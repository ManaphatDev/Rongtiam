import { describe, expect, it } from 'vitest';
import { pickState, toggle } from './ui';

describe('toggle', () => {
  it('adds, removes, and stops adding at the limit', () => {
    expect(toggle([], 'a', 2)).toEqual(['a']);
    expect(toggle(['a'], 'b', 2)).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a', 2)).toEqual(['b']);
  });
  it('never changes the list it was given', () => {
    const list = ['a'];
    toggle(list, 'b', 3);
    toggle(list, 'a', 3);
    expect(list).toEqual(['a']);
  });
});

describe('pickState', () => {
  const opts = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }, { id: 'c', label: 'C' }];
  it('locks unchosen options that are disabled or past the limit', () => {
    const s = pickState(['a'], opts, 1);
    expect(opts.map((o) => s.locked(o))).toEqual([false, true, true]);
  });
  it('never locks a chosen option, even one a clash disabled, so it can always be taken back', () => {
    const s = pickState(['b', 'c'], opts, 2);
    expect(s.locked(opts[1])).toBe(false);
    expect(s.locked(opts[2])).toBe(false);
    expect(s.locked(opts[0])).toBe(true);
  });
  it('drops chosen ids that are no longer offered, and they do not count toward the limit', () => {
    const s = pickState(['gone', 'a'], opts, 2);
    expect(s.kept).toEqual(['a']);
    expect(s.locked(opts[2])).toBe(false);
  });
});
