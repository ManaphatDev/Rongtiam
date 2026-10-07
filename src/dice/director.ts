// Runs rolls for one table. Local roll: parse → simulate (Rapier, lazily loaded; crypto if it can't load) →
// broadcast the keyframes on `live` → write the roll_log row (the official result) → replay. Other people's
// rolls replay from their keyframes; the on-table result waits until the dice have landed.
import { rand, randFloat, uuid } from '../lib/rand';
import type { RoomStore } from '../sync/room.svelte';
import type { RollResult } from '../sync/types';
import { evaluate, expand, FACES, format, parse, tagsFor, type DieTag } from './model';
import { parseStart } from './protocol';
import type { DiceScene } from './render';

const PHYSICS_TIMEOUT_MS = 10_000;
/** How long a roll_log row waits for its throw to show up before the result is shown anyway. */
const GRACE_MS = 400;

export interface LocalRoll {
  label: string;
  result: RollResult;
}

export class DiceDirector {
  private scene: Promise<DiceScene | null> | null = null;
  private playing = new Map<string, Promise<void>>();
  private waiting = new Map<string, () => void>();
  private unsub: () => void;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private store: RoomStore, private host: HTMLElement, private notify: (text: string) => void) {
    this.unsub = store.onRollStart((p) => this.onStart(p));
  }

  /** Desktop: fetch the 3D code while idle so the first roll is instant. Phones load it when first needed. */
  prefetch() {
    if (!matchMedia('(pointer: fine)').matches) return;
    const go = () => {
      void this.getScene();
      void import('./physics').then((m) => m.loadPhysics()).catch(() => {});
    };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 });
    else setTimeout(go, 2000);
  }

  private getScene() {
    this.scene ??= import('./render').then((m) => m.DiceScene.create(this.host), () => null);
    return this.scene;
  }

  /** Throws `expr`; resolves with the result once the dice have landed (DiceError for a bad expression). */
  /** `title` names what is being rolled (e.g. a save from a sheet); the log shows it before the dice.
   *  `onDecided` gets the result as soon as its row is written, while the dice are still tumbling. */
  async roll(expr: string, secret: boolean, title?: string, onDecided?: (result: RollResult) => void): Promise<LocalRoll> {
    const terms = parse(expr);
    const label = title ? `${title.slice(0, 80)} · ${format(terms)}` : format(terms);
    const dice = expand(terms).map((d) => ({ id: d.id, kind: d.kind }));
    const id = uuid();

    let sim: { faces: Record<string, number>; frames: number[][] } | null = null;
    try {
      const phys = await withTimeout(import('./physics'), PHYSICS_TIMEOUT_MS);
      await withTimeout(phys.loadPhysics(), PHYSICS_TIMEOUT_MS);
      sim = phys.simulate(dice, randFloat);
    } catch {
      sim = null;
    }
    const faces = sim?.faces ?? Object.fromEntries(dice.map((d) => [d.id, rand(FACES[d.kind]) - 1]));
    const result = evaluate(terms, faces, sim ? 'physics' : 'crypto');
    const visibility = secret && this.store.isGM ? 'gm' : 'all';
    const color = this.store.meMember?.color ?? '#e5484d';

    // Others start replaying before the result row exists; a secret roll tells players nothing but that it happened.
    if (visibility === 'gm') this.store.sendRollStart({ u: this.store.userId, id, secret: true });
    const tags = tagsFor(terms, result);
    if (visibility === 'all' && sim) this.store.sendRollStart({ u: this.store.userId, id, color, kinds: dice.map((d) => d.kind), k: sim.frames, tags });

    const replay = sim ? this.replay(id, dice.map((d) => d.kind), sim.frames, color, tags) : Promise.resolve();
    await this.store.roll({ id, label, spec: { expr: label }, result, visibility });
    onDecided?.(result);
    await replay;
    return { label, result };
  }

  private onStart(payload: unknown) {
    const p = parseStart(payload, (u) => this.store.state.members.get(u)?.status === 'approved');
    if (!p) return;
    if (p.secret) {
      if (!this.store.isGM) this.notify('GM ทอยลับ');
      return;
    }
    void this.replay(p.id, p.kinds, p.k, p.color, p.tags);
  }

  private replay(id: string, kinds: Parameters<DiceScene['play']>[0], tracks: number[][], color: string, tags?: DieTag[]) {
    const run = this.getScene()
      .then((s) => s?.play(kinds, tracks, color, this.reduce.matches, tags))
      .catch(() => {})
      .finally(() => this.playing.delete(id));
    this.playing.set(id, run);
    this.waiting.get(id)?.();
    return run;
  }

  /** Resolves when roll `id`'s dice have landed (or straight away if no throw for it shows up). */
  after(id: string): Promise<void> {
    const p = this.playing.get(id);
    if (p) return p;
    return new Promise((done) => {
      const t = setTimeout(() => {
        this.waiting.delete(id);
        done();
      }, GRACE_MS);
      this.waiting.set(id, () => {
        clearTimeout(t);
        this.waiting.delete(id);
        void this.playing.get(id)?.then(done);
      });
    });
  }

  destroy() {
    this.unsub();
    void this.scene?.then((s) => s?.destroy());
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('timeout')), ms);
    p.then((v) => (clearTimeout(t), ok(v)), (e) => (clearTimeout(t), fail(e)));
  });
}
