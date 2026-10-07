import { describe, expect, it } from 'vitest';
import { DiceError, evaluate, expand, format, MAX_DICE, parse, quick, tagsFor } from './model';

/** Face indices that read as the given values (d10: 10 → face 0). */
const facesFor = (expr: string, values: number[]) => {
  const out: Record<string, number> = {};
  expand(parse(expr)).forEach((p, i) => {
    const v = values[i];
    out[p.id] = p.kind === 'd10' ? v % 10 : p.kind === 'd10t' || p.kind === 'd10u' ? v : v - 1;
  });
  return out;
};
const roll = (expr: string, ...values: number[]) => evaluate(parse(expr), facesFor(expr, values));

describe('parse', () => {
  it('reads dice, keep rules and constants', () => {
    expect(parse('2d20kh1 + 1d4 - 3')).toEqual([
      { t: 'dice', sign: 1, count: 2, sides: 20, keep: { high: true, n: 1 } },
      { t: 'dice', sign: 1, count: 1, sides: 4 },
      { t: 'const', sign: -1, value: 3 },
    ]);
    expect(parse('d%')).toEqual([{ t: 'dice', sign: 1, count: 1, sides: 100 }]);
    expect(parse('4D6K3')[0]).toMatchObject({ keep: { high: true, n: 3 } });
  });

  it('round-trips through format', () => {
    for (const s of ['2d20kh1 + 5', '4d6kh3', '1d8 - 1d4 + 2', '-1d6']) expect(format(parse(s))).toBe(s);
  });

  it('refuses what cannot be thrown, in Thai', () => {
    for (const bad of ['', '3', 'd7', '2d6kh3', 'abc', '2d6 3', `${MAX_DICE + 1}d6`, '13d100', '0d6']) {
      expect(() => parse(bad), bad).toThrow(DiceError);
    }
    expect(() => parse('d7')).toThrow(/d7/);
  });
});

describe('expand', () => {
  it('lists physical dice; a d100 is a tens and a units d10', () => {
    expect(expand(parse('2d6 + d100')).map((d) => d.kind)).toEqual(['d6', 'd6', 'd10t', 'd10u']);
  });
});

describe('evaluate', () => {
  it('sums and applies constants', () => {
    const r = roll('3d6+2', 1, 4, 6);
    expect(r.total).toBe(13);
    expect(r.breakdown).toBe('[1, 4, 6] + 2');
    expect(r.engine).toBe('physics');
  });

  it('advantage keeps the higher d20 and flags a natural 20', () => {
    const r = roll('2d20kh1+5', 3, 20);
    expect(r.total).toBe(25);
    expect(r.crit).toBe('hit');
    expect(r.dice.filter((d) => d.dropped)).toEqual([{ id: '0.0', sides: 20, value: 3, dropped: true }]);
    expect(r.breakdown).toBe('[20 (ทิ้ง 3)] + 5');
  });

  it('disadvantage keeps the lower and flags a natural 1', () => {
    const r = roll('2d20kl1', 1, 15);
    expect(r.total).toBe(1);
    expect(r.crit).toBe('fumble');
  });

  it('4d6 keep 3 drops the lowest', () => {
    expect(roll('4d6kh3', 2, 6, 1, 5).total).toBe(13);
  });

  it('no crit when the d20 is one of several dice', () => {
    expect(roll('1d20+1d4', 20, 3).crit).toBeUndefined();
    expect(roll('2d20', 20, 20).crit).toBeUndefined();
  });

  it('a d10 face 0 reads 10', () => {
    expect(roll('2d10', 10, 3).total).toBe(13);
  });

  it('d100: tens + units, and 00 + 0 is 100', () => {
    expect(roll('d100', 4, 7).total).toBe(47);
    expect(roll('d100', 0, 7).total).toBe(7);
    expect(roll('d100', 9, 0).total).toBe(90);
    expect(roll('d100', 0, 0).total).toBe(100);
  });

  it('negative dice terms subtract', () => {
    expect(roll('1d8-1d4', 6, 2).total).toBe(4);
  });

  it('refuses missing or impossible faces', () => {
    expect(() => evaluate(parse('1d6'), {})).toThrow(DiceError);
    expect(() => evaluate(parse('1d6'), { '0.0': 6 })).toThrow(DiceError);
  });
});

describe('quick', () => {
  it('builds the expression for the quick buttons', () => {
    expect(quick(6, 3, 2, 'normal')).toBe('3d6+2');
    expect(quick(20, 5, -1, 'adv')).toBe('2d20kh1-1');
    expect(quick(20, 1, 0, 'dis')).toBe('2d20kl1');
    expect(quick(8, 99, 0, 'adv')).toBe(`${MAX_DICE}d8`);
    expect(quick(100, 99, 0, 'normal')).toBe(`${MAX_DICE / 2}d100`);
  });
});

describe('tagsFor', () => {
  it('labels each die in throw order; a d100 shows its total on the tens die', () => {
    const expr = '2d20kh1 + d100 + 1d10';
    expect(tagsFor(parse(expr), roll(expr, 3, 17, 4, 7, 10))).toEqual([
      { v: '3', off: true }, { v: '17' }, { v: '47' }, { v: '' }, { v: '10' },
    ]);
  });
});
