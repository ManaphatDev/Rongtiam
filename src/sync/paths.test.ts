import { describe, expect, it } from 'vitest';
import { getIn, pathKey, setIn } from './paths';

describe('paths', () => {
  it('sets deep values, creating parents, without touching the original', () => {
    const a = { hp: { max: 10 }, name: 'A' };
    const b = setIn(a, ['hp', 'current'], 7);
    expect(b).toEqual({ hp: { max: 10, current: 7 }, name: 'A' });
    expect(a).toEqual({ hp: { max: 10 }, name: 'A' });
    expect(b.name).toBe('A');
    expect(setIn({}, ['a', 'b', 'c'], 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it('null removes a key, like the server', () => {
    expect(setIn({ a: 1, b: 2 }, ['a'], null)).toEqual({ b: 2 });
    expect(setIn({ x: { a: 1 } }, ['x', 'a'], null)).toEqual({ x: {} });
  });

  it('works inside arrays', () => {
    expect(setIn({ list: [1, 2, 3] }, ['list', 1], 9)).toEqual({ list: [1, 9, 3] });
    expect(getIn({ list: [{ n: 'a' }] }, ['list', 0, 'n'])).toBe('a');
    expect(getIn({ a: 1 }, ['a', 'b'])).toBeUndefined();
  });

  it('keys identify paths', () => {
    expect(pathKey(['a', 1])).toBe(pathKey(['a', 1]));
    expect(pathKey(['a', 1])).not.toBe(pathKey(['a', '1']));
  });
});
