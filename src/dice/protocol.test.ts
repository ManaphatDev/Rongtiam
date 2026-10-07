import { describe, expect, it } from 'vitest';
import { parseStart } from './protocol';

const id = '6f1c0e3a-2b4d-4c5e-8f90-1a2b3c4d5e6f';
const member = (u: string) => u === 'alice';
const frame = [0, 500, 0, 0, 0, 0, 10000];
const good = { u: 'alice', id, color: '#e5484d', kinds: ['d6', 'd20'], k: [[...frame, ...frame], [...frame, ...frame]] };

describe('parseStart', () => {
  it('accepts a well-formed throw and a secret notice', () => {
    expect(parseStart(good, member)).toEqual(good);
    expect(parseStart({ u: 'alice', id, secret: true, kinds: ['d6'], k: [[1]] }, member)).toEqual({ u: 'alice', id, secret: true });
  });

  it('keeps valid tags and drops odd ones without losing the throw', () => {
    const tags = [{ v: '4' }, { v: '17', off: true }];
    expect(parseStart({ ...good, tags }, member)).toEqual({ ...good, tags });
    expect(parseStart({ ...good, tags: [{ v: '<b>' }, { v: '1' }] }, member)).toEqual(good);
    expect(parseStart({ ...good, tags: [{ v: '1' }] }, member)).toEqual(good);
  });

  it.each([
    ['a non-member', { ...good, u: 'mallory' }],
    ['a bad id', { ...good, id: 'x' }],
    ['a bad colour', { ...good, color: 'red;background:url(x)' }],
    ['an unknown die', { ...good, kinds: ['d6', 'd7'] }],
    ['mismatched tracks', { ...good, k: [good.k[0]] }],
    ['ragged frames', { ...good, k: [good.k[0], frame] }],
    ['a partial frame', { ...good, k: [[1, 2, 3], [1, 2, 3]] }],
    ['non-integers', { ...good, k: [[...frame.slice(0, 6), 0.5], frame] }],
    ['too many frames', { ...good, kinds: ['d6'], k: [Array.from({ length: 7 * 300 }, () => 0)] }],
    ['too many dice', { ...good, kinds: Array(25).fill('d6'), k: Array(25).fill(frame) }],
    ['nothing at all', null],
  ])('refuses %s', (_, p) => {
    expect(parseStart(p, member)).toBeNull();
  });
});
