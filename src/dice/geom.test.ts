import { describe, expect, it } from 'vitest';
import { dieGeom, dot, norm, qBetween, qmul, readUp, restHeight, rotate, settle, sub, type Quat, type V3 } from './geom';
import { FACES, type PhysDie } from './model';

const KINDS: PhysDie['kind'][] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd10t', 'd10u'];
const FACE_COUNT: Record<string, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d10t: 10, d10u: 10 };
const spin = (axis: V3, a: number): Quat => {
  const n = norm(axis), s = Math.sin(a / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)];
};

describe('dice geometry', () => {
  it.each(KINDS)('%s has the right faces, all planar and facing out', (kind) => {
    const g = dieGeom(kind);
    expect(g.faces).toHaveLength(FACE_COUNT[kind]);
    g.faces.forEach((f, i) => {
      const n = g.normals[i];
      const d = dot(n, g.vertices[f[0]]);
      for (const v of f) expect(Math.abs(dot(n, g.vertices[v]) - d)).toBeLessThan(1e-9);
      expect(d).toBeGreaterThan(0);
      // Counter-clockwise from outside: the winding's normal agrees with the outward one.
      const w = norm(cross3(sub(g.vertices[f[1]], g.vertices[f[0]]), sub(g.vertices[f[2]], g.vertices[f[0]])));
      expect(dot(w, n)).toBeGreaterThan(0.99);
    });
  });

  it('the d10 is a pentagonal trapezohedron: ten four-sided faces', () => {
    for (const f of dieGeom('d10').faces) expect(f).toHaveLength(4);
  });

  it.each(KINDS)('%s carries every value exactly once', (kind) => {
    const g = dieGeom(kind);
    const vals = kind === 'd4' ? g.vertexValue! : g.faceValue;
    expect([...vals].sort((a, b) => a - b)).toEqual(Array.from({ length: FACES[kind] }, (_, i) => i));
    expect(g.labels).toHaveLength(FACES[kind]);
  });

  it('opposite faces add up like real dice', () => {
    const g = dieGeom('d20');
    g.normals.forEach((n, i) => {
      const j = g.normals.findIndex((m) => dot(m, n) < -0.999);
      expect(g.faceValue[i] + g.faceValue[j]).toBe(19);
    });
  });

  it('labels: d10 reads 0–9, d100 tens read 00–90', () => {
    expect(dieGeom('d10').labels[0]).toBe('0');
    expect(dieGeom('d10t').labels).toEqual(['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']);
    expect(dieGeom('d20').labels.at(-1)).toBe('20');
  });
});

describe('reading the top face', () => {
  it.each(KINDS)('%s: turning each value up reads that value, from any spin around the vertical', (kind) => {
    const g = dieGeom(kind);
    g.locators.forEach((loc, v) => {
      for (const twist of [0, 1.1, 2.7]) {
        const q = qmul(spin([0, 1, 0], twist), qBetween(loc, [0, 1, 0]));
        const r = readUp(g, q);
        expect(r.value).toBe(v);
        expect(r.flatness).toBeGreaterThan(0.999);
      }
    });
  });

  it('a die leaning on something is turned flat onto the face that was most up', () => {
    const g = dieGeom('d6');
    const tilted = qmul(spin([1, 0, 0.3], 0.35), qBetween(g.locators[4], [0, 1, 0]));
    const r = readUp(g, tilted);
    expect(r.value).toBe(4);
    expect(r.flatness).toBeLessThan(0.97);
    const flat = settle(g, tilted, r.value);
    expect(readUp(g, flat).flatness).toBeGreaterThan(0.9999);
    expect(readUp(g, flat).value).toBe(4);
  });

  it('a d6 resting on a face sits half its edge above the floor', () => {
    const g = dieGeom('d6');
    const q = qBetween(g.locators[0], [0, 1, 0]);
    expect(restHeight(g, q)).toBeCloseTo(Math.abs(g.vertices[0][0]), 6);
  });

  it('rotate is a rotation (keeps length)', () => {
    const v = rotate(spin([1, 2, 3], 1.3), [0.3, -0.4, 1.2]);
    expect(Math.hypot(...v)).toBeCloseTo(Math.hypot(0.3, -0.4, 1.2), 9);
  });
});

function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
