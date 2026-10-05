// Pure table geometry, ported from legacy/dnd-table.html.

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const normDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
export const isQuarter = (rot: number) => {
  const m = (((rot % 90) + 90) % 90);
  return m < 0.01 || m > 89.99;
};

export interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
  cx: number;
  cy: number;
}

export interface Placed {
  kind: string;
  x: number;
  y: number;
  size: number;
  rot?: number;
  aspect?: number;
}

/** Axis-aligned bounds of a (possibly rotated) item. Maps are size × size·aspect, everything else square. */
export function aabb(it: Placed): Box {
  const w = it.size;
  const h = it.kind === 'map' ? it.size * (it.aspect ?? 1) : it.size;
  const r = ((it.rot ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const hw = (w * c + h * s) / 2;
  const hh = (w * s + h * c) / 2;
  return { l: it.x - hw, r: it.x + hw, t: it.y - hh, b: it.y + hh, cx: it.x, cy: it.y };
}

/**
 * Edge/centre snapping of a map against other maps. Returns the offset to apply (0 when nothing is in reach).
 * Only quarter-turn maps snap. `th` is the reach in world units.
 */
export function snapOffset(it: Placed, others: Placed[], th: number): { dx: number; dy: number } {
  if (it.kind !== 'map' || !isQuarter(it.rot ?? 0)) return { dx: 0, dy: 0 };
  const a = aabb(it);
  let bx: number | null = null;
  let by: number | null = null;
  for (const o of others) {
    if (o === it || o.kind !== 'map' || !isQuarter(o.rot ?? 0)) continue;
    const b = aabb(o);
    const overlapY = a.t < b.b + th && a.b > b.t - th;
    const overlapX = a.l < b.r + th && a.r > b.l - th;
    if (overlapY) {
      for (const [p, q] of [[a.l, b.r], [a.r, b.l], [a.l, b.l], [a.r, b.r], [a.cx, b.cx]]) {
        const d = q - p;
        if (Math.abs(d) < th && (bx === null || Math.abs(d) < Math.abs(bx))) bx = d;
      }
    }
    if (overlapX) {
      for (const [p, q] of [[a.t, b.b], [a.b, b.t], [a.t, b.t], [a.b, b.b], [a.cy, b.cy]]) {
        const d = q - p;
        if (Math.abs(d) < th && (by === null || Math.abs(d) < Math.abs(by))) by = d;
      }
    }
  }
  return { dx: bx ?? 0, dy: by ?? 0 };
}

/** Bounds of several boxes, or null when empty. */
export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (const x of boxes) {
    l = Math.min(l, x.l);
    r = Math.max(r, x.r);
    t = Math.min(t, x.t);
    b = Math.max(b, x.b);
  }
  return { l, r, t, b, cx: (l + r) / 2, cy: (t + b) / 2 };
}
