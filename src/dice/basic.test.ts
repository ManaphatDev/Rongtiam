import { describe, expect, it } from 'vitest';
import { rollBasic } from './basic';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++];
};

describe('rollBasic', () => {
  it('sums dice and the modifier', () => {
    const r = rollBasic(6, 3, 2, 'normal', seq(1, 4, 6));
    expect(r.result.total).toBe(13);
    expect(r.label).toBe('3d6 +2');
    expect(r.result.breakdown).toBe('1 + 4 + 6 (+2)');
  });

  it('advantage keeps the higher d20 and flags crits', () => {
    const r = rollBasic(20, 5, 0, 'adv', seq(3, 20));
    expect(r.result.total).toBe(20);
    expect(r.result.crit).toBe('hit');
    expect(r.result.dice).toHaveLength(2);
  });

  it('disadvantage keeps the lower d20', () => {
    const r = rollBasic(20, 1, -1, 'dis', seq(1, 15));
    expect(r.result.total).toBe(0);
    expect(r.result.crit).toBe('fumble');
    expect(r.label).toBe('d20 เสียเปรียบ -1');
  });

  it('ignores advantage on other dice and clamps the count', () => {
    const r = rollBasic(8, 99, 0, 'adv', () => 1);
    expect(r.result.dice).toHaveLength(20);
    expect(r.result.crit).toBeUndefined();
  });
});
