import { describe, expect, it } from 'vitest';
import { aabb, isQuarter, normDeg, snapOffset } from './geometry';
import { budgetHz } from '../sync/ephemeral';
import { rand } from './rand';

describe('geometry', () => {
  it('normDeg wraps into [-180, 180)', () => {
    expect(normDeg(190)).toBe(-170);
    expect(normDeg(-190)).toBe(170);
    expect(normDeg(0)).toBe(0);
  });

  it('aabb swaps sides for a quarter-turned map', () => {
    const b = aabb({ kind: 'map', x: 0, y: 0, size: 200, aspect: 0.5, rot: 90 });
    expect(b.r - b.l).toBeCloseTo(100);
    expect(b.b - b.t).toBeCloseTo(200);
  });

  it('isQuarter', () => {
    expect(isQuarter(-90)).toBe(true);
    expect(isQuarter(45)).toBe(false);
  });

  it('snaps a map edge onto a neighbour within reach', () => {
    const a = { kind: 'map', x: 0, y: 0, size: 100, aspect: 1, rot: 0 };
    const b = { kind: 'map', x: 105, y: 3, size: 100, aspect: 1, rot: 0 };
    expect(snapOffset(b, [a, b], 14)).toEqual({ dx: -5, dy: -3 });
  });

  it('does not snap rotated or distant maps', () => {
    const a = { kind: 'map', x: 0, y: 0, size: 100, aspect: 1, rot: 0 };
    expect(snapOffset({ kind: 'map', x: 300, y: 0, size: 100, aspect: 1, rot: 0 }, [a], 14)).toEqual({ dx: 0, dy: 0 });
    expect(snapOffset({ kind: 'map', x: 105, y: 0, size: 100, aspect: 1, rot: 30 }, [a], 14)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('budgetHz', () => {
  it('shrinks with people online and stays in [3, 10]', () => {
    expect(budgetHz(1)).toBe(10);
    expect(budgetHz(6)).toBe(5);
    expect(budgetHz(20)).toBe(3);
  });
});

describe('rand', () => {
  it('stays in range', () => {
    for (let i = 0; i < 2000; i++) {
      const v = rand(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});
