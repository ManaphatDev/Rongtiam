// 2D dice (ported from legacy roll()): NdX + modifier, with advantage/disadvantage for a d20.
import { rand } from '../lib/rand';
import type { RollResult } from '../sync/types';

export type Adv = 'normal' | 'adv' | 'dis';

export interface BasicRoll {
  label: string;
  spec: { sides: number; count: number; mod: number; adv: Adv };
  result: RollResult;
}

export function rollBasic(sides: number, count: number, mod: number, adv: Adv, rng: (n: number) => number = rand): BasicRoll {
  count = Math.max(1, Math.min(20, Math.floor(count) || 1));
  mod = Math.max(-99, Math.min(99, Math.floor(mod) || 0));
  let label: string, detail: string, base: number;
  let face: number | null = null;
  const dice: RollResult['dice'] = [];
  if (sides === 20 && adv !== 'normal') {
    const a = rng(20), b = rng(20);
    dice.push({ id: 'a', sides: 20, value: a }, { id: 'b', sides: 20, value: b });
    base = adv === 'adv' ? Math.max(a, b) : Math.min(a, b);
    face = base;
    label = `d20 ${adv === 'adv' ? 'ได้เปรียบ' : 'เสียเปรียบ'}`;
    detail = `ทอยได้ ${a} และ ${b} เลือก ${base}`;
    count = 1;
  } else {
    const rs = Array.from({ length: count }, () => rng(sides));
    rs.forEach((v, i) => dice.push({ id: String(i), sides, value: v }));
    base = rs.reduce((s, v) => s + v, 0);
    label = `${count}d${sides}`;
    detail = rs.join(' + ');
    if (sides === 20 && count === 1) face = rs[0];
  }
  if (mod) {
    label += mod > 0 ? ` +${mod}` : ` ${mod}`;
    detail += ` (${mod > 0 ? '+' : ''}${mod})`;
  }
  const crit = face === 20 ? 'hit' : face === 1 ? 'fumble' : undefined;
  return { label, spec: { sides, count, mod, adv }, result: { dice, total: base + mod, breakdown: detail, crit, engine: 'crypto' } };
}

export const critText = (c: RollResult['crit']) => (c === 'hit' ? 'ค่าวิกฤต! 20 เต็ม' : c === 'fumble' ? 'พลาดยับ! ได้ 1' : '');
