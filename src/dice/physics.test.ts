import { beforeAll, describe, expect, it } from 'vitest';
import { dieGeom, readUp, type Quat } from './geom';
import { expand, FACES, parse } from './model';
import { EVERY, launches, loadPhysics, MAX_STEPS, POS_Q, randomQuat, ROT_Q, simulate, TRAY } from './physics';

/** Seeded RNG so throws are reproducible in tests. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dice = (expr: string) => expand(parse(expr)).map((d) => ({ id: d.id, kind: d.kind }));

beforeAll(() => loadPhysics(), 30_000);

describe('throws', () => {
  it('random orientations are unit quaternions', () => {
    const rng = seeded(1);
    for (let i = 0; i < 200; i++) expect(Math.hypot(...randomQuat(rng))).toBeCloseTo(1, 9);
  });

  it('every die starts inside the tray, moving towards the middle', () => {
    for (let s = 0; s < 20; s++) {
      const ls = launches(24, seeded(s));
      for (const l of ls) {
        expect(Math.abs(l.pos[0])).toBeLessThan(TRAY.w / 2);
        expect(Math.abs(l.pos[2])).toBeLessThan(TRAY.d / 2);
        expect(Math.sign(l.vel[0])).toBe(-Math.sign(l.pos[0]));
      }
    }
  });
});

describe('golden throws', () => {
  it.each(['1d20', '3d6', '2d20kh1', 'd100', '1d4+1d8+1d12', '4d6kh3'])('%s settles flat and reads a valid face', (expr) => {
    const ds = dice(expr);
    const sim = simulate(ds, seeded(42));
    expect(sim.steps).toBeLessThanOrEqual(MAX_STEPS);
    expect(Object.keys(sim.faces).sort()).toEqual(ds.map((d) => d.id).sort());
    ds.forEach((d, i) => {
      expect(sim.faces[d.id]).toBeGreaterThanOrEqual(0);
      expect(sim.faces[d.id]).toBeLessThan(FACES[d.kind]);
      // The last keyframe shows the face that was read, lying flat.
      const f = sim.frames[i];
      expect(f.length % 7).toBe(0);
      const q = f.slice(-4).map((v) => v / ROT_Q) as Quat;
      const r = readUp(dieGeom(d.kind), q);
      expect(r.value).toBe(sim.faces[d.id]);
      expect(r.flatness).toBeGreaterThan(0.99);
      // Inside the tray and resting on the floor.
      expect(Math.abs(f.at(-7)! / POS_Q)).toBeLessThan(TRAY.w / 2);
      expect(f.at(-6)! / POS_Q).toBeLessThan(1.5);
    });
  });

  it('the same throw gives the same roll (the replay is the result)', () => {
    const a = simulate(dice('5d6'), seeded(7)), b = simulate(dice('5d6'), seeded(7));
    expect(a.faces).toEqual(b.faces);
    expect(a.frames).toEqual(b.frames);
  });

  it('dice usually come to rest within a few seconds', () => {
    let total = 0;
    for (let s = 0; s < 20; s++) total += simulate(dice('2d6'), seeded(100 + s)).steps;
    expect(total / 20 / 120).toBeLessThan(5);
  });

  it('keyframes stay small enough to broadcast', () => {
    const sim = simulate(dice('24d6'), seeded(3));
    expect(JSON.stringify(sim.frames).length).toBeLessThan(200_000);
    expect(sim.frames[0].length / 7).toBeLessThanOrEqual(MAX_STEPS / EVERY + 8);
  }, 30_000);
});

// Opt-in fairness check (slow): DICE_FAIR=1 npx vitest run src/dice/physics.test.ts
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
describe.skipIf(!env.DICE_FAIR)('fairness', () => {
  it.each(['d6', 'd20'] as const)('%s faces come up evenly (chi-square, 10k throws)', (kind) => {
    const n = FACES[kind], N = 10_000;
    const counts = new Array(n).fill(0);
    const rng = seeded(2024);
    for (let i = 0; i < N; i++) counts[simulate([{ id: 'x', kind }], rng).faces.x]++;
    const e = N / n;
    const chi = counts.reduce((s, c) => s + (c - e) ** 2 / e, 0);
    // 99.9th percentile of chi-square with n-1 degrees of freedom: d6 ≈ 20.5, d20 ≈ 43.8.
    expect(chi).toBeLessThan(kind === 'd6' ? 20.5 : 43.8);
  }, 600_000);
});
