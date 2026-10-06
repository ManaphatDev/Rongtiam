// Fog geometry on top of Clipper2: every fog item is a shape (list of integer rings) that is either added to or
// cut from the fog of the items below it (by z). The visible fog is the result of folding them in order.
import {
  difference, EndType, FillRule, inflatePaths, JoinType, pointInPolygon, PointInPolygonResult, ramerDouglasPeucker,
  rectClip, simplifyPaths, union, type Path64, type Paths64,
} from 'clipper2-ts';

/** Flat ring `[x0, y0, x1, y1, …]` in whole world units. */
export type Ring = number[];
export type FogMode = 'add' | 'cut';
export interface FogShape {
  mode: FogMode;
  rings: Ring[];
}
export interface Pt {
  x: number;
  y: number;
}

/** Points kept for one drawn stroke/shape; keeps an item's payload to a few tens of KB. */
export const MAX_SHAPE_POINTS = 4000;
/** A compacted item holds the whole merged fog, so it may be larger (still ≈150 KB of JSON). */
export const MAX_COMPACT_POINTS = 12000;
/** Half-extent of the "cover everything" rectangle. */
export const COVER_EXTENT = 50000;

const toPath = (r: Ring): Path64 => {
  const p: Path64 = [];
  for (let i = 0; i + 1 < r.length; i += 2) p.push({ x: r[i], y: r[i + 1] });
  return p;
};
const toPaths = (rings: Ring[]): Paths64 => rings.map(toPath).filter((p) => p.length >= 3);
const toRing = (p: Path64): Ring => {
  const r: Ring = [];
  for (const q of p) r.push(Math.round(q.x), Math.round(q.y));
  return r;
};
const fromPaths = (ps: Paths64): Ring[] => ps.map(toRing).filter((r) => r.length >= 6);
const pointCount = (rings: Ring[]) => rings.reduce((n, r) => n + r.length / 2, 0);
const rnd = (pts: Pt[]): Path64 => pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

/** Simplifies until at most `max` points remain (widening the tolerance each pass). */
export function limitPoints(rings: Ring[], max = MAX_SHAPE_POINTS): Ring[] {
  let out = rings;
  for (let eps = 1; pointCount(out) > max && eps < 4096; eps *= 1.6) out = fromPaths(simplifyPaths(toPaths(rings), eps, true));
  return out;
}

export function rectRings(a: Pt, b: Pt): Ring[] {
  const x0 = Math.round(Math.min(a.x, b.x)), x1 = Math.round(Math.max(a.x, b.x));
  const y0 = Math.round(Math.min(a.y, b.y)), y1 = Math.round(Math.max(a.y, b.y));
  if (x1 - x0 < 1 || y1 - y0 < 1) return [];
  return [[x0, y0, x1, y0, x1, y1, x0, y1]];
}

/** Closed polygon from clicked points; a self-crossing outline is resolved into plain rings. */
export function polyRings(pts: Pt[]): Ring[] {
  if (pts.length < 3) return [];
  return limitPoints(fromPaths(union([rnd(pts)], FillRule.NonZero)));
}

/** A thick line through `pts` (RDP → offset with round joins/ends → simplify). */
export function brushRings(pts: Pt[], width: number): Ring[] {
  const half = Math.max(1, Math.round(width / 2));
  if (pts.length === 0) return [];
  if (pts.length === 1 || pts.every((p) => p.x === pts[0].x && p.y === pts[0].y)) return circleRings(pts[0], half);
  const line = ramerDouglasPeucker(rnd(pts), Math.max(1, width / 12));
  const out = inflatePaths([line], half, JoinType.Round, EndType.Round, 2, Math.max(0.25, half / 24));
  return limitPoints(fromPaths(simplifyPaths(out, Math.max(0.5, half / 40), true)));
}

export function circleRings(c: Pt, r: number): Ring[] {
  const n = Math.max(12, Math.min(48, Math.round(r / 2)));
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r));
  }
  return [ring];
}

export function coverRings(): Ring[] {
  const e = COVER_EXTENT;
  return [[-e, -e, e, -e, e, e, -e, e]];
}

/** Folds shapes (already sorted bottom → top) into the visible fog. Consecutive shapes of one mode go in one pass. */
export function computeFog(shapes: FogShape[]): Ring[] {
  let acc: Paths64 = [];
  let i = 0;
  while (i < shapes.length) {
    const mode = shapes[i].mode;
    const run: Paths64 = [];
    while (i < shapes.length && shapes[i].mode === mode) run.push(...toPaths(shapes[i++].rings));
    if (!run.length) continue;
    acc = mode === 'add' ? union(acc, run, FillRule.NonZero) : difference(acc, run, FillRule.NonZero);
  }
  return fromPaths(acc);
}

/** The merged fog as one shape, thinned to fit a single item. */
export function compactShape(shapes: FogShape[]): FogShape {
  return { mode: 'add', rings: limitPoints(computeFog(shapes), MAX_COMPACT_POINTS) };
}

/**
 * The part of the fog inside a world rectangle (each ring clipped on its own, so even-odd painting inside the
 * rectangle is unchanged). Keeps on-screen drawing small however large the fog is.
 */
export function clipRings(rings: Ring[], l: number, t: number, r: number, b: number): Ring[] {
  if (!rings.length || !(r > l && b > t)) return [];
  const rect = { left: Math.floor(l), top: Math.floor(t), right: Math.ceil(r), bottom: Math.ceil(b) };
  return fromPaths(rectClip(rect, toPaths(rings)));
}

/** SVG path data; render with `fill-rule="evenodd"`. */
export function ringsToPath(rings: Ring[]): string {
  let d = '';
  for (const r of rings) {
    d += `M${r[0]} ${r[1]}`;
    for (let i = 2; i + 1 < r.length; i += 2) d += `L${r[i]} ${r[i + 1]}`;
    d += 'Z';
  }
  return d;
}

/** Even-odd containment, matching how the rings are painted. */
export function containsPoint(rings: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    const res = pointInPolygon({ x: Math.round(x), y: Math.round(y) }, toPath(r));
    if (res === PointInPolygonResult.IsInside || res === PointInPolygonResult.IsOn) inside = !inside;
  }
  return inside;
}

/** Shape rings read back from an item's props, tolerating anything a hand-edited row might contain. */
export function ringsOf(props: Record<string, unknown>): Ring[] {
  if (!Array.isArray(props.geom)) return [];
  return props.geom.filter((r): r is Ring => Array.isArray(r) && r.length >= 6 && r.every((n) => Number.isFinite(n)));
}
