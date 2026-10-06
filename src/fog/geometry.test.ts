import { describe, expect, it } from 'vitest';
import {
  brushRings, circleRings, clipRings, compactShape, computeFog, containsPoint, coverRings, limitPoints, MAX_COMPACT_POINTS,
  MAX_SHAPE_POINTS, polyRings, rectRings, ringsOf, ringsToPath, type FogShape, type Ring,
} from './geometry';

const rect = (x0: number, y0: number, x1: number, y1: number) => rectRings({ x: x0, y: y0 }, { x: x1, y: y1 });
const add = (rings: Ring[]): FogShape => ({ mode: 'add', rings });
const cut = (rings: Ring[]): FogShape => ({ mode: 'cut', rings });
const fogAt = (rings: Ring[], x: number, y: number) => containsPoint(rings, x, y);
const bytes = (rings: Ring[]) => JSON.stringify({ mode: 'add', geom: rings }).length;

describe('fog fold order', () => {
  it('add, cut, add: the later add covers the hole again', () => {
    const fog = computeFog([add(rect(0, 0, 100, 100)), cut(rect(20, 20, 80, 80)), add(rect(40, 40, 60, 60))]);
    expect(fogAt(fog, 5, 5)).toBe(true);
    expect(fogAt(fog, 30, 30)).toBe(false);
    expect(fogAt(fog, 50, 50)).toBe(true);
    expect(fogAt(fog, 150, 150)).toBe(false);
  });

  it('cut then add is not the same as add then cut', () => {
    const a = computeFog([cut(rect(0, 0, 50, 50)), add(rect(0, 0, 100, 100))]);
    const b = computeFog([add(rect(0, 0, 100, 100)), cut(rect(0, 0, 50, 50))]);
    expect(fogAt(a, 25, 25)).toBe(true);
    expect(fogAt(b, 25, 25)).toBe(false);
    expect(fogAt(b, 75, 75)).toBe(true);
  });

  it('a cut with nothing beneath it changes nothing', () => {
    expect(computeFog([cut(rect(0, 0, 10, 10))])).toEqual([]);
  });

  it('cover-all then a cut leaves exactly one hole', () => {
    const fog = computeFog([add(coverRings()), cut(rect(100, 100, 200, 200))]);
    expect(fogAt(fog, 150, 150)).toBe(false);
    expect(fogAt(fog, 0, 0)).toBe(true);
    expect(fogAt(fog, -30000, 30000)).toBe(true);
    expect(fog).toHaveLength(2);
  });

  it('overlapping adds merge into one outline', () => {
    const fog = computeFog([add(rect(0, 0, 60, 60)), add(rect(40, 40, 100, 100))]);
    expect(fog).toHaveLength(1);
    expect(fogAt(fog, 50, 50)).toBe(true);
    expect(fogAt(fog, 90, 10)).toBe(false);
  });

  it('ignores degenerate rings', () => {
    expect(computeFog([add([[0, 0, 5, 5]]), add(rect(0, 0, 0, 10))])).toEqual([]);
  });
});

describe('shapes', () => {
  it('rect is normalised whatever the drag direction, and empty when flat', () => {
    expect(rect(100, 80, 20, 10)).toEqual([[20, 10, 100, 10, 100, 80, 20, 80]]);
    expect(rect(0, 0, 100, 0)).toEqual([]);
  });

  it('a self-crossing polygon becomes valid rings', () => {
    const bow = polyRings([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
    expect(bow.length).toBeGreaterThanOrEqual(1);
    expect(fogAt(bow, 5, 50)).toBe(true);
    expect(fogAt(bow, 95, 50)).toBe(true);
    expect(fogAt(bow, 50, 10)).toBe(false);
    expect(polyRings([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toEqual([]);
  });

  it('a brush stroke is a closed band of the requested width', () => {
    const r = brushRings([{ x: 0, y: 0 }, { x: 200, y: 0 }], 40);
    expect(r).toHaveLength(1);
    expect(fogAt(r, 100, 0)).toBe(true);
    expect(fogAt(r, 100, 18)).toBe(true);
    expect(fogAt(r, 100, 26)).toBe(false);
    expect(fogAt(r, -15, 0)).toBe(true); // round end cap
    expect(fogAt(r, -30, 0)).toBe(false);
    expect(r[0].every((n) => Number.isInteger(n))).toBe(true);
  });

  it('a click without moving paints a dot', () => {
    const r = brushRings([{ x: 50, y: 50 }], 60);
    expect(fogAt(r, 50, 50)).toBe(true);
    expect(fogAt(r, 50 + 25, 50)).toBe(true);
    expect(fogAt(r, 50 + 40, 50)).toBe(false);
  });

  it('a long wiggly stroke stays within the point budget and payload size', () => {
    const pts = Array.from({ length: 6000 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 7) * 500 + Math.cos(i / 3) * 40 }));
    const r = brushRings(pts, 30);
    expect(r.length).toBeGreaterThan(0);
    expect(r.reduce((n, x) => n + x.length / 2, 0)).toBeLessThanOrEqual(MAX_SHAPE_POINTS);
    expect(bytes(r)).toBeLessThan(200_000);
  });

  it('limitPoints thins dense rings but keeps the outline', () => {
    const dense = circleRings({ x: 0, y: 0 }, 5000)[0];
    const many: Ring = [];
    for (let i = 0; i < 20000; i++) many.push(Math.round(Math.cos(i / 3183) * 5000), Math.round(Math.sin(i / 3183) * 5000));
    const out = limitPoints([many], 500);
    expect(out[0].length / 2).toBeLessThanOrEqual(500);
    expect(fogAt(out, 0, 0)).toBe(true);
    expect(fogAt(out, 4900, 0)).toBe(true);
    expect(dense.length).toBeGreaterThan(6);
  });
});

describe('compact', () => {
  it('merging gives the same picture with fewer shapes', () => {
    const shapes = [add(rect(0, 0, 100, 100)), cut(rect(20, 20, 80, 80)), add(rect(40, 40, 60, 60)), add(rect(90, 90, 160, 160))];
    const merged = compactShape(shapes);
    expect(merged.mode).toBe('add');
    for (const [x, y] of [[5, 5], [30, 30], [50, 50], [120, 120], [200, 200], [95, 20]]) {
      expect(fogAt(computeFog([merged]), x, y)).toBe(fogAt(computeFog(shapes), x, y));
    }
  });

  it('a very busy fog still fits in one item', () => {
    const shapes: FogShape[] = [];
    for (let i = 0; i < 400; i++) shapes.push(add(brushRings([{ x: i * 20, y: 0 }, { x: i * 20 + 150, y: 300 + (i % 7) * 60 }], 50)));
    const merged = compactShape(shapes);
    expect(merged.rings.reduce((n, r) => n + r.length / 2, 0)).toBeLessThanOrEqual(MAX_COMPACT_POINTS);
    expect(bytes(merged.rings)).toBeLessThan(200_000);
  });
});

describe('clipRings', () => {
  it('cuts a huge fog down to the view but paints the same inside it', () => {
    const fog = computeFog([add(coverRings()), cut(rect(100, 100, 200, 200)), add(rect(140, 140, 160, 160))]);
    const clipped = clipRings(fog, 0, 0, 300, 300);
    for (const r of clipped) for (const v of r) expect(Math.abs(v)).toBeLessThanOrEqual(300);
    for (const [x, y] of [[10, 10], [150, 120], [150, 150], [250, 250], [199, 101]]) {
      expect(fogAt(clipped, x, y)).toBe(fogAt(fog, x, y));
    }
  });

  it('is empty when nothing reaches the rectangle', () => {
    expect(clipRings(rect(0, 0, 10, 10), 100, 100, 200, 200)).toEqual([]);
    expect(clipRings([], 0, 0, 1, 1)).toEqual([]);
  });
});

describe('paths and props', () => {
  it('writes closed sub-paths', () => {
    expect(ringsToPath([[0, 0, 10, 0, 10, 10], [1, 1, 2, 1, 2, 2]])).toBe('M0 0L10 0L10 10ZM1 1L2 1L2 2Z');
  });

  it('reads geometry back defensively', () => {
    expect(ringsOf({})).toEqual([]);
    expect(ringsOf({ geom: 'nope' })).toEqual([]);
    expect(ringsOf({ geom: [[0, 0, 1, 1, 2, 2], [1, 2], ['a', 0, 1, 1, 2, 2], null] })).toEqual([[0, 0, 1, 1, 2, 2]]);
  });
});
