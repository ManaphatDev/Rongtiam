import { describe, expect, it } from 'vitest';
import { evaluate, expand, parse } from '../../../dice/model';
import {
  POINT_BUY_BUDGET, ROLL_EXPR, baseScores, emptyScores, pointBuySpent, pointBuyStart, pointCost, poolOf, scoresFromRoll,
} from './abilities';

describe('point buy', () => {
  it('costs follow the 2024 table and stop outside 8-15', () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map((s) => pointCost(s))).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
    expect(pointCost(7)).toBeNull();
    expect(pointCost(16)).toBeNull();
  });

  it('the standard 27-point spread costs exactly 27', () => {
    expect(pointBuySpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(POINT_BUY_BUDGET);
    expect(pointBuySpent(pointBuyStart())).toBe(0);
  });

  it('a score outside the range makes the spread unusable', () => {
    expect(pointBuySpent({ ...pointBuyStart(), str: 16 })).toBe(Infinity);
    const s = { ...emptyScores(), method: 'pointbuy' as const, base: { ...pointBuyStart(), str: 7 } };
    expect(baseScores(s, null)).toBeNull();
  });

  it('refuses a spread over the budget and accepts one at it', () => {
    const over = { ...emptyScores(), method: 'pointbuy' as const, base: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 } };
    expect(baseScores(over, null)).toBeNull();
    const ok = { ...emptyScores(), method: 'pointbuy' as const, base: { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 } };
    expect(baseScores(ok, null)).toEqual({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 });
  });
});

describe('standard array and rolled scores', () => {
  const full = { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 };

  it('assigns the array by index', () => {
    const s = { ...emptyScores(), method: 'array' as const, assign: full };
    expect(baseScores(s, null)).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  });

  it('is incomplete until every ability has a value, and values are used once', () => {
    expect(baseScores({ ...emptyScores(), assign: { str: 0 } }, null)).toBeNull();
    expect(baseScores({ ...emptyScores(), assign: { ...full, cha: 0 } }, null)).toBeNull();
    expect(baseScores({ ...emptyScores(), assign: { ...full, cha: 9 } }, null)).toBeNull();
  });

  it('a roll method has no pool until the dice are rolled', () => {
    const s = { ...emptyScores(), method: 'roll' as const, assign: full };
    expect(poolOf('roll', null)).toBeNull();
    expect(baseScores(s, null)).toBeNull();
    expect(baseScores(s, [18, 16, 14, 12, 11, 9])).toEqual({ str: 18, dex: 16, con: 14, int: 12, wis: 11, cha: 9 });
  });
});

describe('scoresFromRoll', () => {
  it('sums the three highest of each group of four dice, in group order', () => {
    const terms = parse(ROLL_EXPR);
    expect(expand(terms)).toHaveLength(24);
    // Face index 3 reads 4. Group 2 gets a 1 and a 6 so its dropped die and its best die differ from the others.
    const faces = Object.fromEntries(expand(terms).map((d) => [d.id, 3]));
    faces['1.0'] = 0; // a 1: dropped
    faces['1.1'] = 5; // a 6: kept
    const result = evaluate(terms, faces, 'test');
    expect(scoresFromRoll(result)).toEqual([12, 14, 12, 12, 12, 12]);
  });

  it('is empty for a roll with no dice', () => {
    expect(scoresFromRoll({ dice: [], total: 0, breakdown: '' })).toEqual([]);
  });
});
