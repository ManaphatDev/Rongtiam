// Ability scores for the builder: the standard array, 27-point buy, and six rolls of 4d6 keeping the best three.
import type { RollResult } from '../../../sync/types';
import { ABILITIES, type Ability } from '../i18n/th';

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
/** Six `4d6kh3` in one throw: the dice model keeps the best three of each group (24 dice, its maximum). */
export const ROLL_EXPR = Array<string>(6).fill('4d6kh3').join('+');
const COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/** Ability → index into the pool of values (the array, or the six rolled totals). */
export type Assign = Partial<Record<Ability, number>>;
export interface Scores {
  method: 'array' | 'pointbuy' | 'roll';
  assign: Assign;
  /** Point buy only. */
  base: Record<Ability, number>;
}

export const pointBuyStart = (): Record<Ability, number> => ({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
export const emptyScores = (): Scores => ({ method: 'array', assign: {}, base: pointBuyStart() });

/** Point-buy cost of one score; null outside 8-15. */
export const pointCost = (score: number): number | null => COSTS[score] ?? null;

export function pointBuySpent(base: Record<Ability, number>): number {
  return ABILITIES.reduce((sum, a) => sum + (pointCost(base[a]) ?? Infinity), 0);
}

/** The six totals a roll of ROLL_EXPR gave: dice are grouped by their term, dice that were dropped don't count. */
export function scoresFromRoll(result: RollResult): number[] {
  const sums = new Map<number, number>();
  for (const die of result.dice) {
    const term = Number(die.id.split('.')[0]);
    sums.set(term, (sums.get(term) ?? 0) + (die.dropped ? 0 : die.value));
  }
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([, total]) => total);
}

export const poolOf = (method: Scores['method'], rolled: number[] | null): number[] | null =>
  method === 'array' ? [...STANDARD_ARRAY] : method === 'roll' ? rolled : null;

/** The six base scores this choice gives, or null while it is incomplete or not allowed. */
export function baseScores(s: Scores, rolled: number[] | null): Record<Ability, number> | null {
  if (s.method === 'pointbuy') return pointBuySpent(s.base) <= POINT_BUY_BUDGET ? { ...s.base } : null;
  const pool = poolOf(s.method, rolled);
  if (!pool) return null;
  const idx = ABILITIES.map((a) => s.assign[a]);
  const bad = idx.some((i) => i === undefined || !Number.isInteger(i) || i < 0 || i >= pool.length);
  if (bad || new Set(idx).size !== idx.length) return null;
  return Object.fromEntries(ABILITIES.map((a, n) => [a, pool[idx[n]!]])) as Record<Ability, number>;
}
