// Dice expressions: parse "2d20kh1 + 1d4 + 3", expand them into the physical dice to throw, and evaluate the
// faces those dice landed on. A d100 is thrown as two d10s (tens "00–90" + units "0–9"; 00 + 0 reads 100).
import type { RollResult } from '../sync/types';

export const PHYSICAL = [4, 6, 8, 10, 12, 20, 100] as const;
export type Sides = (typeof PHYSICAL)[number];
/** At most this many physical dice per roll (6 × 4d6 for ability scores, with room to spare). */
export const MAX_DICE = 24;

export type Term =
  | { t: 'dice'; sign: 1 | -1; count: number; sides: Sides; keep?: { high: boolean; n: number } }
  | { t: 'const'; sign: 1 | -1; value: number };

/** One die on the table. `kind` d10t/d10u are the two halves of a d100. */
export interface PhysDie {
  id: string;
  kind: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd10t' | 'd10u';
  term: number;
}

export class DiceError extends Error {}

/** Parses an expression; throws DiceError with a Thai message when it can't be thrown. */
export function parse(src: string): Term[] {
  const s = src.toLowerCase().replace(/\s+/g, '');
  if (!s) throw new DiceError('พิมพ์สูตรการทอย เช่น 2d6+3');
  const re = /([+-])?(?:(\d*)d(\d+|%)(?:(kh|kl|k)(\d+))?|(\d+))/y;
  const terms: Term[] = [];
  let i = 0, dice = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m[0] === '' || (terms.length > 0 && !m[1])) {
      throw new DiceError(`อ่านสูตรไม่ออกตรง "${s.slice(i)}" ลองรูปแบบอย่าง 2d6+3 หรือ 4d6kh3`);
    }
    i = re.lastIndex;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ t: 'const', sign, value: Math.min(9999, +m[6]) });
      continue;
    }
    const count = m[2] === '' ? 1 : +m[2];
    const sides = (m[3] === '%' ? 100 : +m[3]) as Sides;
    if (!PHYSICAL.includes(sides)) throw new DiceError(`ไม่มีลูกเต๋า d${m[3]} (ใช้ได้ d4 d6 d8 d10 d12 d20 d100)`);
    if (count < 1) throw new DiceError('จำนวนลูกต้องมีอย่างน้อย 1');
    dice += count * (sides === 100 ? 2 : 1);
    if (dice > MAX_DICE) throw new DiceError(`ทอยพร้อมกันได้ไม่เกิน ${MAX_DICE} ลูก`);
    const term: Term = { t: 'dice', sign, count, sides };
    if (m[4]) {
      const n = +m[5];
      if (n < 1 || n > count) throw new DiceError(`เก็บได้ 1 ถึง ${count} ลูก`);
      term.keep = { high: m[4] !== 'kl', n };
    }
    terms.push(term);
  }
  if (!terms.some((t) => t.t === 'dice')) throw new DiceError('สูตรต้องมีลูกเต๋าอย่างน้อยหนึ่งลูก');
  return terms;
}

/** The physical dice to throw, in a stable order. */
export function expand(terms: Term[]): PhysDie[] {
  const out: PhysDie[] = [];
  terms.forEach((t, ti) => {
    if (t.t !== 'dice') return;
    for (let j = 0; j < t.count; j++) {
      if (t.sides === 100) {
        out.push({ id: `${ti}.${j}t`, kind: 'd10t', term: ti }, { id: `${ti}.${j}u`, kind: 'd10u', term: ti });
      } else out.push({ id: `${ti}.${j}`, kind: `d${t.sides}` as PhysDie['kind'], term: ti });
    }
  });
  return out;
}

/** Number of faces of each physical kind (a d10's faces read 0–9). */
export const FACES: Record<PhysDie['kind'], number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d10t: 10, d10u: 10 };

/**
 * Turns landed faces into the roll result. `faces` maps die id → face index 0..n-1, which reads as 1..n, except
 * d10s (0 reads 10), and d100 halves (tens × 10 + units, both 0 → 100).
 */
export function evaluate(terms: Term[], faces: Record<string, number>, engine = 'physics'): RollResult {
  const phys = expand(terms);
  const dice: RollResult['dice'] = [];
  const parts: string[] = [];
  let total = 0;
  let crit: RollResult['crit'];
  terms.forEach((t, ti) => {
    const signTxt = parts.length ? (t.sign < 0 ? ' − ' : ' + ') : t.sign < 0 ? '−' : '';
    if (t.t === 'const') {
      total += t.sign * t.value;
      parts.push(`${signTxt}${t.value}`);
      return;
    }
    const mine = phys.filter((p) => p.term === ti);
    const values: { id: string; v: number }[] = [];
    if (t.sides === 100) {
      for (let j = 0; j < t.count; j++) {
        const tens = faceOf(faces, `${ti}.${j}t`, 10), units = faceOf(faces, `${ti}.${j}u`, 10);
        values.push({ id: `${ti}.${j}`, v: tens * 10 + units || 100 });
      }
    } else {
      for (const p of mine) {
        const f = faceOf(faces, p.id, t.sides);
        values.push({ id: p.id, v: t.sides === 10 ? f || 10 : f + 1 });
      }
    }
    const kept = new Set(values.map((v) => v.id));
    if (t.keep) {
      const order = [...values].sort((a, b) => (t.keep!.high ? b.v - a.v : a.v - b.v));
      kept.clear();
      order.slice(0, t.keep.n).forEach((v) => kept.add(v.id));
    }
    let sum = 0;
    for (const v of values) {
      const k = kept.has(v.id);
      dice.push({ id: v.id, sides: t.sides, value: v.v, ...(k ? {} : { dropped: true }) });
      if (k) sum += v.v;
    }
    total += t.sign * sum;
    // Kept values in roll order, then the ones not counted, in words rather than markup.
    const keptTxt = values.filter((v) => kept.has(v.id)).map((v) => v.v).join(', ');
    const dropped = values.filter((v) => !kept.has(v.id)).map((v) => v.v);
    parts.push(`${signTxt}[${keptTxt}${dropped.length ? ` (ทิ้ง ${dropped.join(', ')})` : ''}]`);
    // A natural 20/1 only means something on a single kept d20.
    if (t.sides === 20 && (t.keep?.n ?? t.count) === 1 && terms.filter((x) => x.t === 'dice').length === 1) {
      const v = values.find((x) => kept.has(x.id))!.v;
      crit = v === 20 ? 'hit' : v === 1 ? 'fumble' : undefined;
    }
  });
  return { dice, total, breakdown: parts.join(''), ...(crit ? { crit } : {}), engine };
}

function faceOf(faces: Record<string, number>, id: string, n: number) {
  const f = faces[id];
  if (!Number.isInteger(f) || f < 0 || f >= n) throw new DiceError(`ไม่มีผลของลูก ${id}`);
  return f;
}

/** Canonical text of an expression, e.g. "2d20kh1 + 5". */
export function format(terms: Term[]): string {
  return terms.map((t, i) => {
    const sign = t.sign < 0 ? (i ? ' - ' : '-') : i ? ' + ' : '';
    if (t.t === 'const') return `${sign}${t.value}`;
    return `${sign}${t.count}d${t.sides}${t.keep ? `${t.keep.high ? 'kh' : 'kl'}${t.keep.n}` : ''}`;
  }).join('');
}

/** The quick-roll buttons: N dice of one kind, a modifier, and advantage/disadvantage for a single d20. */
export function quick(sides: Sides, count: number, mod: number, adv: 'normal' | 'adv' | 'dis'): string {
  const c = Math.max(1, Math.min(sides === 100 ? MAX_DICE / 2 : MAX_DICE, Math.floor(count) || 1));
  const m = Math.max(-99, Math.min(99, Math.floor(mod) || 0));
  const dice = sides === 20 && adv !== 'normal' ? `2d20${adv === 'adv' ? 'kh1' : 'kl1'}` : `${c}d${sides}`;
  return m ? `${dice}${m > 0 ? '+' : '-'}${Math.abs(m)}` : dice;
}

export const critText = (c: RollResult['crit']) => (c === 'hit' ? 'ค่าวิกฤต! 20 เต็ม' : c === 'fumble' ? 'พลาดยับ! ได้ 1' : '');

/** What to float above each physical die once it lands: its value, or nothing for the units half of a d100. */
export interface DieTag {
  v: string;
  /** Rolled but not counted (kh/kl). */
  off?: boolean;
}

/** Tags in the same order as expand(): a d100 shows its combined value over the tens die. */
export function tagsFor(terms: Term[], result: RollResult): DieTag[] {
  const byId = new Map(result.dice.map((d) => [d.id, d]));
  return expand(terms).map((p) => {
    if (p.kind === 'd10u') return { v: '' };
    const d = byId.get(p.kind === 'd10t' ? p.id.slice(0, -1) : p.id);
    return d ? { v: String(d.value), ...(d.dropped ? { off: true } : {}) } : { v: '' };
  });
}
