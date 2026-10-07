import { describe, expect, it } from 'vitest';
import type { InitRow } from '../sync/types';
import { nextTurn, ordered, prevTurn } from './initiative';

const e = (id: string, init: number, tie = 0, created_at = '2026-01-01T00:00:00Z'): InitRow =>
  ({ id, room_id: 'r', character_id: null, item_id: null, name: id, init, tie, hidden: false, rev: 1, created_at });

describe('initiative order', () => {
  it('sorts by roll, then the tie-breaker, then who joined first', () => {
    const rows = [e('slow', 5), e('dexy', 12, 16), e('fast', 18), e('plain', 12, 10), e('late', 12, 10, '2026-01-01T00:00:09Z')];
    expect(ordered(rows).map((r) => r.id)).toEqual(['fast', 'dexy', 'plain', 'late', 'slow']);
  });

  it('turns advance through the order and wrap into the next round', () => {
    const o = ordered([e('a', 20), e('b', 10), e('c', 5)]);
    let t = nextTurn(o, { round: 1, current: null });
    expect(t).toEqual({ round: 1, current: 'a' });
    t = nextTurn(o, t);
    t = nextTurn(o, t);
    expect(t).toEqual({ round: 1, current: 'c' });
    t = nextTurn(o, t);
    expect(t).toEqual({ round: 2, current: 'a' });
    expect(prevTurn(o, t)).toEqual({ round: 1, current: 'c' });
    expect(prevTurn(o, { round: 1, current: 'a' })).toEqual({ round: 1, current: 'a' });
  });

  it('copes with the current entry having been removed or an empty order', () => {
    const o = ordered([e('a', 20), e('b', 10)]);
    expect(nextTurn(o, { round: 3, current: 'gone' })).toEqual({ round: 3, current: 'a' });
    expect(nextTurn([], { round: 3, current: 'a' })).toEqual({ round: 1, current: null });
  });
});
