import { describe, expect, it } from 'vitest';
import { evaluate, FormulaError, refsOf, type Resolver } from './formula';

const vars: Record<string, number | string> = { str: 16, str_mod: 3, pb: 2, level: 5, half: '@level / 2', loop_a: '@loop_b + 1', loop_b: '@loop_a' };
const resolve: Resolver = (name) => vars[name];
const num = (src: string) => evaluate(src, resolve).value;
const dice = (src: string) => evaluate(src, resolve).dice;

describe('numbers', () => {
  it('follows precedence and parentheses', () => {
    expect(num('1 + 2 * 3')).toBe(7);
    expect(num('(1 + 2) * 3')).toBe(9);
    expect(num('10 - 4 - 3')).toBe(3);
    expect(num('-3 + 5')).toBe(2);
    expect(num('2 * -3')).toBe(-6);
    expect(num('7 / 2')).toBe(3.5);
  });

  it('has the functions sheets need', () => {
    expect(num('floor((@str - 10) / 2)')).toBe(3);
    expect(num('floor((7 - 10) / 2)')).toBe(-2);
    expect(num('ceil(@level / 4) + 1')).toBe(3);
    expect(num('max(1, 2, @pb + 5)')).toBe(7);
    expect(num('min(3, @level)')).toBe(3);
    expect(num('abs(-4)')).toBe(4);
    expect(num('mod(17, 5)')).toBe(2);
    expect(num('mod(-1, 5)')).toBe(4);
  });

  it('reads fields, including fields that are formulas themselves', () => {
    expect(num('@half')).toBe(2.5);
    expect(num('floor(@half) + @pb')).toBe(4);
  });
});

describe('dice', () => {
  it('turns a roll formula into a dice expression with the numbers worked out', () => {
    expect(dice('1d20 + @str_mod + @pb')).toBe('1d20+5');
    expect(dice('2d6 + floor(@level / 2)')).toBe('2d6+2');
    expect(dice('1d8 + 1d6 - 1')).toBe('1d8+1d6-1');
    expect(dice('d20')).toBe('1d20');
    expect(dice('2d20kh1 + @pb')).toBe('2d20kh1+2');
    expect(dice('1d4 - @str_mod')).toBe('1d4-3');
  });

  it('dice counts can come from fields', () => {
    expect(dice('(@pb)d6')).toBe('2d6');
    expect(dice('ceil(@level / 2)d6')).toBe('3d6');
  });

  it('a formula without dice has no dice expression', () => {
    expect(evaluate('@pb + 1', resolve)).toEqual({ value: 3, dice: null });
  });
});

describe('errors (in Thai)', () => {
  it.each([
    ['1 +', /ไม่ครบ/],
    ['(1 + 2', /วงเล็บ/],
    ['@nope + 1', /nope/],
    ['foo(1)', /foo/],
    ['1d20 * 2', /คูณ/],
    ['@loop_a', /วน/],
    ['1 / 0', /ศูนย์/],
    ['2 $ 3', /อ่าน/],
    ['(0)d6', /ลูกเต๋า/],
  ])('%s', (src, msg) => {
    expect(() => evaluate(src, resolve)).toThrow(FormulaError);
    expect(() => evaluate(src, resolve)).toThrow(msg);
  });

  it('never runs code', () => {
    expect(() => evaluate('constructor.constructor("return 1")()', resolve)).toThrow(FormulaError);
  });
});

describe('refsOf', () => {
  it('lists the fields a formula reads', () => {
    expect(refsOf('floor((@str - 10) / 2) + @pb + @str')).toEqual(['str', 'pb']);
  });
});
