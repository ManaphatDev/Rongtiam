// The roller's browser decides the roll: it throws the dice in a Rapier world, runs the whole simulation up
// front (≤ 960 steps of 1/120 s), records a keyframe every 4 steps (30 Hz) for everyone else to replay, and
// reads the faces that ended up on top. Loaded lazily — Rapier is ~1.5 MB gzipped.
import RAPIER from '@dimforge/rapier3d-compat';
import { dieGeom, readUp, restHeight, settle, type Quat, type V3 } from './geom';
import type { PhysDie } from './model';
import { EVERY, MAX_STEPS, POS_Q, ROT_Q, STEP, TRAY } from './physics-consts';

export { EVERY, MAX_STEPS, POS_Q, ROT_Q, STEP, TRAY };
const GRAVITY = -45;

export interface ThrowDie {
  id: string;
  kind: PhysDie['kind'];
}

export interface Launch {
  pos: V3;
  rot: Quat;
  vel: V3;
  spin: V3;
}

export interface Sim {
  /** Value index on top for each die id. */
  faces: Record<string, number>;
  /** Per die: [x, y, z, qx, qy, qz, qw] × frames, quantised. */
  frames: number[][];
  steps: number;
}

let ready: Promise<void> | null = null;
export function loadPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

/** Uniformly random orientation (Shoemake). */
export function randomQuat(rng: () => number): Quat {
  const u1 = rng(), u2 = rng() * 2 * Math.PI, u3 = rng() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/** Throw from one side of the tray towards the middle, in a loose cluster, every die spinning its own way. */
export function launches(n: number, rng: () => number): Launch[] {
  const side = rng() < 0.5 ? -1 : 1;
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  // Room left for the whole cluster to shift sideways, keeping every die clear of the walls.
  const z0 = (rng() - 0.5) * Math.max(0, TRAY.d - 3 - (rows - 1) * 1.7);
  const speed = 14 + rng() * 8;
  const aim = (rng() - 0.5) * 0.5;
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return {
      pos: [side * (TRAY.w / 2 - 2.2 - c * 1.7), 2.5 + rng() * 1.5 + r * 0.4, z0 + (r - (rows - 1) / 2) * 1.7 + (rng() - 0.5) * 0.4],
      rot: randomQuat(rng),
      vel: [-side * speed * (0.85 + rng() * 0.3), rng() * 2, (aim + (rng() - 0.5) * 0.4) * speed],
      spin: [(rng() - 0.5) * 50, (rng() - 0.5) * 50, (rng() - 0.5) * 50],
    };
  });
}

export function simulate(dice: ThrowDie[], rng: () => number): Sim {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = STEP;
  try {
    const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.7).setRestitution(0.25));
    const { w, d, h } = TRAY;
    box(0, -0.5, 0, w, 0.5, d); // floor
    box(0, h + 0.5, 0, w, 0.5, d); // lid
    box(-w / 2 - 0.5, h / 2, 0, 0.5, h, d);
    box(w / 2 + 0.5, h / 2, 0, 0.5, h, d);
    box(0, h / 2, -d / 2 - 0.5, w, h, 0.5);
    box(0, h / 2, d / 2 + 0.5, w, h, 0.5);

    const ls = launches(dice.length, rng);
    const bodies = dice.map((die, i) => {
      const l = ls[i];
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...l.pos)
          .setRotation({ x: l.rot[0], y: l.rot[1], z: l.rot[2], w: l.rot[3] })
          .setLinvel(...l.vel)
          .setAngvel({ x: l.spin[0], y: l.spin[1], z: l.spin[2] })
          .setLinearDamping(0.15)
          .setAngularDamping(0.25)
          .setCcdEnabled(true),
      );
      const pts = new Float32Array(dieGeom(die.kind).vertices.flat());
      world.createCollider(RAPIER.ColliderDesc.convexHull(pts)!.setFriction(0.5).setRestitution(0.3).setDensity(1.2), body);
      return body;
    });

    const frames: number[][] = dice.map(() => []);
    const record = (poses: { p: V3; q: Quat }[]) => poses.forEach(({ p, q }, i) => frames[i].push(
      Math.round(p[0] * POS_Q), Math.round(p[1] * POS_Q), Math.round(p[2] * POS_Q),
      Math.round(q[0] * ROT_Q), Math.round(q[1] * ROT_Q), Math.round(q[2] * ROT_Q), Math.round(q[3] * ROT_Q)));
    const poses = () => bodies.map((b) => {
      const t = b.translation(), r = b.rotation();
      return { p: [t.x, t.y, t.z] as V3, q: [r.x, r.y, r.z, r.w] as Quat };
    });

    let still = 0, steps = 0;
    record(poses());
    while (steps < MAX_STEPS) {
      world.step();
      steps++;
      if (steps % EVERY === 0) record(poses());
      const calm = bodies.every((b) => {
        const v = b.linvel(), a = b.angvel();
        return Math.hypot(v.x, v.y, v.z) < 0.08 && Math.hypot(a.x, a.y, a.z) < 0.15;
      });
      still = calm ? still + 1 : 0;
      if (still >= 18) break;
    }

    // Read the faces; a die left leaning on another (or a wall) is eased flat onto its most-up face.
    const end = poses();
    const faces: Record<string, number> = {};
    const target = end.map(({ p, q }, i) => {
      const g = dieGeom(dice[i].kind);
      const r = readUp(g, q);
      faces[dice[i].id] = r.value;
      if (r.flatness > 0.995) return { p, q };
      const q2 = settle(g, q, r.value);
      return { p: [p[0], restHeight(g, q2), p[2]] as V3, q: q2 };
    });
    if (target.some((t, i) => t !== end[i])) {
      for (let k = 1; k <= 6; k++) {
        const f = k / 6;
        record(end.map((e, i) => ({ p: lerp3(e.p, target[i].p, f), q: nlerp(e.q, target[i].q, f) })));
      }
    } else if (steps % EVERY !== 0) record(end);
    return { faces, frames, steps };
  } finally {
    world.free();
  }
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function nlerp(a: Quat, b: Quat, t: number): Quat {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q: Quat = [a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t];
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
