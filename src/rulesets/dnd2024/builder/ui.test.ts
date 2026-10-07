import { describe, expect, it } from 'vitest';
import { toggle } from './ui';

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
