// The `roll` live message: sent by the roller before the roll_log row is written, so everyone can replay the
// throw while the official result travels through the database. A GM's secret roll sends no dice at all.
import { FACES, MAX_DICE, type DieTag, type PhysDie } from './model';
import { EVERY, MAX_STEPS } from './physics-consts';

export interface RollStart {
  u: string;
  id: string;
  secret?: false;
  color: string;
  kinds: PhysDie['kind'][];
  /** Per die: quantised [x, y, z, qx, qy, qz, qw] keyframes at 30 Hz. */
  k: number[][];
  /** Per die: the number floated above it once it lands. */
  tags?: DieTag[];
}
export interface SecretStart {
  u: string;
  id: string;
  secret: true;
}

const MAX_FRAMES = MAX_STEPS / EVERY + 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts only well-formed messages from members of the room (the live topic is writable by all of them). */
export function parseStart(p: unknown, isMember: (u: string) => boolean): RollStart | SecretStart | null {
  if (!p || typeof p !== 'object') return null;
  const m = p as Record<string, unknown>;
  if (typeof m.u !== 'string' || !isMember(m.u) || typeof m.id !== 'string' || !UUID.test(m.id)) return null;
  if (m.secret === true) return { u: m.u, id: m.id, secret: true };
  if (typeof m.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(m.color)) return null;
  const kinds = m.kinds, k = m.k;
  if (!Array.isArray(kinds) || !Array.isArray(k) || !kinds.length || kinds.length > MAX_DICE || k.length !== kinds.length) return null;
  if (!kinds.every((x) => typeof x === 'string' && x in FACES)) return null;
  const n = (k[0] as unknown[])?.length;
  for (const f of k) {
    if (!Array.isArray(f) || f.length !== n || n % 7 !== 0 || n === 0 || n / 7 > MAX_FRAMES) return null;
    if (!f.every((v) => Number.isInteger(v) && Math.abs(v) < 1e6)) return null;
  }
  const out: RollStart = { u: m.u, id: m.id, color: m.color, kinds: kinds as PhysDie['kind'][], k: k as number[][] };
  // Tags are decoration: drop them (not the throw) if they look wrong.
  const tags = m.tags;
  if (Array.isArray(tags) && tags.length === kinds.length && tags.every((t) =>
    t && typeof t === 'object' && typeof t.v === 'string' && /^\d{0,3}$/.test(t.v) && (t.off === undefined || typeof t.off === 'boolean'))) {
    out.tags = tags.map((t: DieTag) => ({ v: t.v, ...(t.off ? { off: true } : {}) }));
  }
  return out;
}
