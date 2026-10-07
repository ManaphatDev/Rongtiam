// Connects a room to its rulesets: loads the modules its characters use and hands them the room's content.
import type { RoomStore } from '../sync/room.svelte';
import type { CharacterRow, ItemRow } from '../sync/types';
import type { TokenStatus } from '../table/Stage';
import type { RulesetContext, RulesetModule } from './core/types';
import { loadRuleset, RULESETS } from './registry';

export class RulesetHost {
  /** Bumped when a module finishes loading, so views that asked for it re-run. */
  version = $state(0);
  private mods = new Map<string, RulesetModule>();
  private listeners = new Set<() => void>();

  constructor(private store: RoomStore) {}

  /** The room's chosen system ('none' until a GM picks one). */
  get roomRuleset(): string {
    void this.store.roomVersion;
    const id = this.store.state.room?.ruleset_id ?? 'none';
    return RULESETS.some((r) => r.id === id) ? id : 'none';
  }

  get ctx(): RulesetContext {
    void this.store.contentVersion;
    return { content: [...this.store.state.content.rows.values()] };
  }

  /** The module if loaded; otherwise starts loading it and returns null (callers re-run on `version`). */
  module(id: string): RulesetModule | null {
    void this.version;
    const m = this.mods.get(id);
    if (!m) this.ensure(id);
    return m ?? null;
  }

  async ensure(id: string): Promise<RulesetModule | null> {
    const have = this.mods.get(id);
    if (have) return have;
    try {
      const m = await loadRuleset(id);
      if (m && !this.mods.has(id)) {
        this.mods.set(id, m);
        this.version++;
        for (const l of this.listeners) l();
      }
      return m;
    } catch {
      return null;
    }
  }

  onLoad(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Characters this viewer can see, newest last. */
  characters(): CharacterRow[] {
    void this.store.charactersVersion;
    return this.store.state.characterList().sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  }

  /**
   * What a token shows: its bound sheet's bars and conditions, or (unbound) the NPC HP a GM typed onto the token,
   * which players only see when the GM made it public.
   */
  tokenStatus(it: ItemRow): TokenStatus | null {
    const core = (it.meta?.core ?? {}) as TokenCore;
    if (core.characterId) {
      const ch = this.store.state.character(core.characterId);
      const mod = ch && this.module(ch.ruleset);
      if (!ch || !mod) return null;
      const ctx = this.ctx;
      const defs = new Map(mod.conditions(ctx).map((c) => [c.key, c]));
      return {
        bars: mod.bars(ch.data, ctx),
        icons: mod.activeConditions(ch.data).flatMap((k) => (defs.has(k) ? [{ icon: defs.get(k)!.icon, label: defs.get(k)!.label }] : [])),
      };
    }
    if (core.hp && (this.store.isGM || core.hpPublic)) {
      return { bars: [{ label: 'HP', current: core.hp.cur, max: core.hp.max, color: '#e5484d' }], icons: [] };
    }
    return null;
  }

  /** Whether this viewer may edit a character (mirrors the RLS update policy). */
  canEdit(c: CharacterRow) {
    return this.store.isGM || (c.owner_id === this.store.userId && c.visibility === 'party');
  }
}

/** What a token keeps in meta.core: the sheet it stands for, or quick NPC hit points. */
export interface TokenCore {
  characterId?: string | null;
  hp?: { cur: number; max: number } | null;
  hpPublic?: boolean;
}
