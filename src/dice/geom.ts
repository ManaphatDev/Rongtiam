// Hand-built dice: vertices of each polyhedron, its faces (found as the convex hull), which value each face
// carries, and a "locator" per value — the local direction that points straight up when that value is rolled
// (the face normal, or for a d4 the vertex, since a d4 reads its top corner).
import type { PhysDie } from './model';

export type V3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

export interface DieGeom {
  kind: PhysDie['kind'];
  vertices: V3[];
  /** Vertex indices of each face, counter-clockwise seen from outside. */
  faces: number[][];
  /** Outward unit normal per face. */
  normals: V3[];
  /** Value index (0..n-1) shown on each face (d4: unused, see vertexValue). */
  faceValue: number[];
  /** d4 only: value index at each vertex. */
  vertexValue?: number[];
  /** Up-direction per value index. */
  locators: V3[];
  /** Text printed for each value index. */
  labels: string[];
}

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-6;

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const scale = (vs: V3[], r: number): V3[] => {
  const m = Math.max(...vs.map((v) => Math.hypot(...v)));
  return vs.map((v) => [(v[0] / m) * r, (v[1] / m) * r, (v[2] / m) * r]);
};

/** Faces of a convex point set: every supporting plane, with its coplanar vertices ordered around it. */
export function hullFaces(vs: V3[]): { faces: number[][]; normals: V3[] } {
  const seen = new Set<string>();
  const faces: number[][] = [];
  const normals: V3[] = [];
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      for (let k = j + 1; k < vs.length; k++) {
        let n = cross(sub(vs[j], vs[i]), sub(vs[k], vs[i]));
        if (Math.hypot(...n) < EPS) continue;
        n = norm(n);
        const d = dot(n, vs[i]);
        let above = 0, below = 0;
        const on: number[] = [];
        vs.forEach((v, q) => {
          const s = dot(n, v) - d;
          if (s > 1e-5) above++;
          else if (s < -1e-5) below++;
          else on.push(q);
        });
        if (above && below) continue;
        if (above) n = [-n[0], -n[1], -n[2]];
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        // Order counter-clockwise around the outward normal.
        const c = on.reduce<V3>((a, q) => [a[0] + vs[q][0] / on.length, a[1] + vs[q][1] / on.length, a[2] + vs[q][2] / on.length], [0, 0, 0]);
        const u = norm(sub(vs[on[0]], c)), w = cross(n, u);
        on.sort((a, b) => Math.atan2(dot(sub(vs[a], c), w), dot(sub(vs[a], c), u)) - Math.atan2(dot(sub(vs[b], c), w), dot(sub(vs[b], c), u)));
        faces.push(on);
        normals.push(n);
      }
    }
  }
  return { faces, normals };
}

function verticesOf(kind: PhysDie['kind']): V3[] {
  switch (kind) {
    case 'd4':
      return scale([[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]], 1.05);
    case 'd6':
      return scale([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 0.82);
    case 'd8':
      return scale([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], 0.85);
    case 'd12': {
      const v: V3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          v.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
        }
      }
      return scale(v, 0.9);
    }
    case 'd20': {
      const v: V3[] = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
      return scale(v, 0.95);
    }
    default: {
      // Pentagonal trapezohedron: two apexes and a zig-zag ring. The ring height c keeps every kite planar.
      const h = 1, c = (h * (1 - Math.cos(Math.PI / 5))) / (1 + Math.cos(Math.PI / 5));
      const v: V3[] = [[0, h, 0], [0, -h, 0]];
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5;
        v.push([Math.cos(a), k % 2 ? -c : c, Math.sin(a)]);
      }
      return scale(v, 0.9);
    }
  }
}

/** Gives opposite faces values that add up to n-1 (so 1 is opposite n), like real dice. */
function pairValues(normals: V3[]): number[] {
  const n = normals.length;
  const val = new Array<number>(n).fill(-1);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (val[i] >= 0) continue;
    const opp = normals.findIndex((m, j) => j !== i && val[j] < 0 && dot(m, normals[i]) < -1 + 1e-6);
    val[i] = next;
    if (opp >= 0) val[opp] = n - 1 - next;
    next++;
  }
  return val;
}

const cache = new Map<PhysDie['kind'], DieGeom>();

export function dieGeom(kind: PhysDie['kind']): DieGeom {
  const hit = cache.get(kind);
  if (hit) return hit;
  const vertices = verticesOf(kind);
  const { faces, normals } = hullFaces(vertices);
  const n = kind === 'd4' ? 4 : faces.length;
  let faceValue: number[], locators: V3[], vertexValue: number[] | undefined;
  if (kind === 'd4') {
    vertexValue = [0, 1, 2, 3];
    faceValue = faces.map(() => -1);
    locators = vertices.map(norm);
  } else {
    faceValue = pairValues(normals);
    locators = new Array(n);
    faceValue.forEach((v, f) => (locators[v] = normals[f]));
  }
  const labels = Array.from({ length: n }, (_, v) =>
    kind === 'd10t' ? `${v}0`.padStart(2, '0') : kind === 'd10' || kind === 'd10u' ? String(v) : String(v + 1));
  const g: DieGeom = { kind, vertices, faces, normals, faceValue, vertexValue, locators, labels };
  cache.set(kind, g);
  return g;
}

// ---- orientation --------------------------------------------------------------------------

export function rotate(q: Quat, v: V3): V3 {
  const [x, y, z, w] = q;
  // v + 2w(q×v) + 2 q×(q×v)
  const u: V3 = [x, y, z];
  const t = cross(u, v).map((c) => 2 * c) as V3;
  const s = cross(u, t);
  return [v[0] + w * t[0] + s[0], v[1] + w * t[1] + s[1], v[2] + w * t[2] + s[2]];
}

export function qmul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/** Shortest rotation taking unit vector a onto unit vector b. */
export function qBetween(a: V3, b: V3): Quat {
  const d = dot(a, b);
  if (d < -1 + 1e-9) {
    const axis = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(a, b);
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

const UP: V3 = [0, 1, 0];

/** Which value index is up, and how squarely (1 = perfectly flat; lower means leaning). */
export function readUp(g: DieGeom, q: Quat): { value: number; flatness: number } {
  let best = -1, value = 0;
  g.locators.forEach((l, i) => {
    const d = dot(rotate(q, l), UP);
    if (d > best) {
      best = d;
      value = i;
    }
  });
  return { value, flatness: best };
}

/** The same pose turned the least amount so that `value` points exactly up (for dice left leaning on something). */
export function settle(g: DieGeom, q: Quat, value: number): Quat {
  return qmul(qBetween(rotate(q, g.locators[value]), UP), q);
}

/** Height of the centre above the floor when resting in pose q. */
export function restHeight(g: DieGeom, q: Quat): number {
  return -Math.min(...g.vertices.map((v) => rotate(q, v)[1]));
}
