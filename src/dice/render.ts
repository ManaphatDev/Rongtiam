// Replays thrown dice over the table with three.js. Loaded lazily; renders only while dice are on screen.
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PCFShadowMap, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShadowMaterial, SRGBColorSpace, Vector3,
  WebGLRenderer,
} from 'three';
import { cross, dieGeom, dot, norm, sub, type DieGeom, type V3 } from './geom';
import type { DieTag, PhysDie } from './model';
import { FPS, POS_Q, TRAY } from './physics-consts';

/** How long dice stay after landing, and how long they take to fade. */
const HOLD_MS = 1800, FADE_MS = 400;
const CELL = 128;

interface Play {
  meshes: Mesh[];
  tracks: number[][];
  frames: number;
  start: number;
  instant: boolean;
  landed: (() => void) | null;
  tags?: DieTag[];
  /** The numbers floating above the dice, created when they land. */
  labels: { el: HTMLElement; die: number }[];
  /** Last keyframe position drawn (nothing to redraw while it stays the same). */
  shownFrame: number;
}

export class DiceScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 1, 0.1, 200);
  private plays = new Set<Play>();
  private geoms = new Map<string, BufferGeometry>();
  private mats = new Map<string, MeshStandardMaterial>();
  private ro: ResizeObserver;
  private running = false;
  private tagLayer = document.createElement('div');
  private v = new Vector3();
  /** Where the camera is and looks now, eased towards the framing it wants (the tray, or the landed dice). */
  private eye = new Vector3();
  private look = new Vector3();
  private lastTick = 0;
  /** Stage size, refreshed by the ResizeObserver: reading it every frame would force a layout per frame. */
  private size = { w: 1, h: 1 };
  private opacity = '';
  private still = matchMedia('(prefers-reduced-motion: reduce)');
  /** Something changed since the last draw. The scene is redrawn only then: still dice cost nothing. */
  private dirty = true;

  /** Null when the browser can't do WebGL (the caller falls back to the 2D result). */
  static create(host: HTMLElement): DiceScene | null {
    try {
      return new DiceScene(host);
    } catch {
      return null;
    }
  }

  private constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    const c = this.renderer.domElement;
    c.className = 'dicecanvas';
    c.setAttribute('aria-hidden', 'true');
    host.appendChild(c);
    this.tagLayer.className = 'dicetags';
    this.tagLayer.setAttribute('aria-hidden', 'true');
    host.appendChild(this.tagLayer);

    this.scene.add(new HemisphereLight(0xffffff, 0x444455, 1.6));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 22, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 50 });
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const floor = new Mesh(new PlaneGeometry(TRAY.w * 1.4, TRAY.d * 1.4), new ShadowMaterial({ opacity: 0.32 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(host);
    this.fit();
  }

  private fit() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    if (!this.running) this.aim(this.framing(0, 0, TRAY.w, TRAY.d, 1.2), true);
  }

  /**
   * Camera pose that shows a w × d area (world x × z) centred on (cx, cz), looking down from slightly in front. On a
   * tall (phone) screen the camera turns a quarter so the long side runs down the screen and the dice come out bigger.
   */
  private framing(cx: number, cz: number, w: number, d: number, margin: number) {
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const portrait = this.camera.aspect < 1;
    const [across, down] = portrait ? [d, w] : [w, d];
    const dist = Math.max(down / 2 / t, across / 2 / (t * this.camera.aspect)) * margin;
    const k = dist / 30; // the forward tilt and look-ahead scale with distance
    return portrait
      ? { eye: new Vector3(cx + dist * 0.34, dist * 0.94, cz), look: new Vector3(cx + 0.6 * k, 0, cz) }
      : { eye: new Vector3(cx, dist * 0.94, cz + dist * 0.34), look: new Vector3(cx, 0, cz + 0.6 * k) };
  }

  /** Moves the camera towards a framing (`snap` jumps there). */
  private aim(f: { eye: Vector3; look: Vector3 }, snap: boolean, a = 1) {
    // Close enough: stop moving (and stop redrawing) instead of creeping forever.
    if (this.eye.distanceToSquared(f.eye) < 1e-6 && this.look.distanceToSquared(f.look) < 1e-6) return;
    this.dirty = true;
    if (snap) {
      this.eye.copy(f.eye);
      this.look.copy(f.look);
    } else {
      this.eye.lerp(f.eye, a);
      this.look.lerp(f.look, a);
    }
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
  }

  /** Once every throw on screen has landed, close in on the dice (they are small on a phone); otherwise the tray. */
  private target() {
    const all = [...this.plays];
    // The margin keeps dice clear of the toolbar floating over the stage's left edge.
    if (!all.length || all.some((p) => p.landed)) return this.framing(0, 0, TRAY.w, TRAY.d, 1.2);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of all) {
      for (const m of p.meshes) {
        x0 = Math.min(x0, m.position.x);
        x1 = Math.max(x1, m.position.x);
        z0 = Math.min(z0, m.position.z);
        z1 = Math.max(z1, m.position.z);
      }
    }
    // Room for the dice themselves and their labels, but never closer than a few dice across.
    const w = Math.max(9, x1 - x0 + 4), d = Math.max(6, z1 - z0 + 5);
    return this.framing((x0 + x1) / 2, (z0 + z1) / 2 - 0.6, Math.min(w, TRAY.w), Math.min(d, TRAY.d), 1.15);
  }

  /** Replays one throw; resolves when the dice land (they stay a moment longer, then fade). */
  play(kinds: PhysDie['kind'][], tracks: number[][], color: string, instant: boolean, tags?: DieTag[]): Promise<void> {
    return new Promise((landed) => {
      const meshes = kinds.map((k) => {
        const m = new Mesh(this.geometry(k), this.material(k, color));
        m.castShadow = true;
        this.scene.add(m);
        return m;
      });
      const p: Play = { meshes, tracks, frames: tracks[0].length / 7, start: performance.now(), instant, landed, tags, labels: [], shownFrame: -1 };
      this.plays.add(p);
      this.pose(p, instant ? p.frames - 1 : 0);
      this.dirty = true;
      this.opacity = '1';
      this.renderer.domElement.style.opacity = '1';
      this.tagLayer.style.opacity = '1';
      this.renderer.domElement.classList.add('on');
      this.tagLayer.classList.add('on');
      if (!this.running) {
        this.running = true;
        this.lastTick = 0;
        this.aim(this.framing(0, 0, TRAY.w, TRAY.d, 1.2), true);
        this.renderer.setAnimationLoop((t) => this.tick(t));
      }
    });
  }

  private tick(now: number) {
    let fading = 1;
    for (const p of this.plays) {
      const t = now - p.start;
      const f = Math.min(p.instant ? p.frames - 1 : (t / 1000) * FPS, p.frames - 1);
      if (f !== p.shownFrame) {
        p.shownFrame = f;
        this.pose(p, f);
        this.dirty = true;
      }
      const landedAt = p.instant ? 0 : ((p.frames - 1) / FPS) * 1000;
      if (t >= landedAt && p.landed) {
        p.landed();
        p.landed = null;
        this.addLabels(p);
        this.dirty = true;
      }
    }
    // Ease the camera (time-based so it feels the same at any frame rate; instant under reduced motion).
    const dt = this.lastTick ? now - this.lastTick : 16;
    this.lastTick = now;
    const still = this.still.matches;
    this.aim(this.target(), still, 1 - Math.exp(-dt / 140));
    for (const p of this.plays) {
      const t = now - p.start;
      const landedAt = p.instant ? 0 : ((p.frames - 1) / FPS) * 1000;
      if (this.dirty) this.placeLabels(p);
      const after = t - landedAt - HOLD_MS;
      if (after > FADE_MS) {
        for (const m of p.meshes) this.scene.remove(m);
        for (const l of p.labels) l.el.remove();
        this.plays.delete(p);
        this.dirty = true;
      } else if (after > 0) fading = Math.min(fading, 1 - after / FADE_MS);
    }
    // Fade only when every throw on screen is fading (two people rolling together share the canvas).
    const op = String(this.plays.size ? Math.round(fading * 100) / 100 : 0);
    if (op !== this.opacity) {
      this.opacity = op;
      this.renderer.domElement.style.opacity = op;
      this.tagLayer.style.opacity = op;
    }
    // Fading is CSS opacity on the canvas, so it needs no redraw either.
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
    if (!this.plays.size) {
      this.renderer.setAnimationLoop(null);
      this.running = false;
      this.renderer.domElement.classList.remove('on');
      this.tagLayer.classList.remove('on');
    }
  }

  /** One label per tagged die (a d100's total sits on its tens die). */
  private addLabels(p: Play) {
    p.tags?.forEach((tag, i) => {
      if (!tag.v) return;
      const el = document.createElement('span');
      el.className = `dicetag${tag.off ? ' off' : ''}`;
      el.textContent = tag.v;
      this.tagLayer.appendChild(el);
      p.labels.push({ el, die: i });
    });
  }

  /** Projects each label's die (raised a little) onto the screen. */
  private placeLabels(p: Play) {
    if (!p.labels.length) return;
    const { w, h } = this.size;
    for (const { el, die } of p.labels) {
      this.v.copy(p.meshes[die].position);
      this.v.y += 1.5;
      this.v.project(this.camera);
      el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  private pose(p: Play, f: number) {
    const i = Math.floor(f), j = Math.min(i + 1, p.frames - 1), a = f - i;
    const qa = new Quaternion(), qb = new Quaternion(), va = new Vector3(), vb = new Vector3();
    p.meshes.forEach((m, d) => {
      const tr = p.tracks[d];
      va.set(tr[i * 7], tr[i * 7 + 1], tr[i * 7 + 2]).divideScalar(POS_Q);
      vb.set(tr[j * 7], tr[j * 7 + 1], tr[j * 7 + 2]).divideScalar(POS_Q);
      qa.set(tr[i * 7 + 3], tr[i * 7 + 4], tr[i * 7 + 5], tr[i * 7 + 6]).normalize();
      qb.set(tr[j * 7 + 3], tr[j * 7 + 4], tr[j * 7 + 5], tr[j * 7 + 6]).normalize();
      m.position.lerpVectors(va, vb, a);
      m.quaternion.slerpQuaternions(qa, qb, a);
    });
  }

  // ---- meshes ------------------------------------------------------------------------------------------

  /** Flat-shaded faces; each face's UVs point into its own cell of the die's label atlas. */
  private geometry(kind: PhysDie['kind']) {
    const hit = this.geoms.get(kind);
    if (hit) return hit;
    const g = dieGeom(kind);
    const { cols, rows } = grid(g.faces.length);
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    g.faces.forEach((f, fi) => {
      const { flat } = faceFrame(g, fi);
      const cu = fi % cols, cv = Math.floor(fi / cols);
      const toUv = (k: number) => {
        const [x, y] = flat[k];
        return [(cu + 0.5 + x * 0.46) / cols, 1 - (cv + 0.5 - y * 0.46) / rows];
      };
      for (let k = 1; k + 1 < f.length; k++) {
        for (const idx of [0, k, k + 1]) {
          pos.push(...g.vertices[f[idx]]);
          nor.push(...g.normals[fi]);
          uv.push(...toUv(idx));
        }
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    this.geoms.set(kind, geo);
    return geo;
  }

  private material(kind: PhysDie['kind'], color: string) {
    const key = `${kind}:${color}`;
    const hit = this.mats.get(key);
    if (hit) return hit;
    const tex = new CanvasTexture(atlas(dieGeom(kind), color));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.05 });
    this.mats.set(key, m);
    return m;
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    for (const p of this.plays) p.landed?.();
    this.plays.clear();
    for (const g of this.geoms.values()) g.dispose();
    for (const m of this.mats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.tagLayer.remove();
  }
}

const grid = (n: number) => {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
};

/**
 * A face's own 2D frame: "up" points at an edge midpoint for squares (so d6 numbers sit straight) and at the
 * farthest corner otherwise (the tip of a d10 kite, a corner of a triangle). Coordinates are scaled to radius 1.
 */
function faceFrame(g: DieGeom, fi: number) {
  const f = g.faces[fi], n = g.normals[fi];
  const pts = f.map((i) => g.vertices[i]);
  const c = pts.reduce<V3>((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  let upPt: V3;
  if (g.kind === 'd6') upPt = pts[0].map((v, i) => (v + pts[1][i]) / 2) as V3;
  else {
    upPt = pts[0];
    for (const p of pts) if (Math.hypot(...sub(p, c)) > Math.hypot(...sub(upPt, c)) + 1e-9) upPt = p;
  }
  const up = norm(sub(upPt, c)), right = cross(up, n);
  const r = Math.max(...pts.map((p) => Math.hypot(...sub(p, c))));
  const flat = pts.map((p) => [dot(sub(p, c), right) / r, dot(sub(p, c), up) / r] as [number, number]);
  return { flat, r };
}

/** Label atlas: one cell per face in the die's colour with its number (a d4 shows its three corner numbers). */
function atlas(g: DieGeom, color: string) {
  const { cols, rows } = grid(g.faces.length);
  const cv = document.createElement('canvas');
  cv.width = cols * CELL;
  cv.height = rows * CELL;
  const x = cv.getContext('2d')!;
  x.fillStyle = color;
  x.fillRect(0, 0, cv.width, cv.height);
  const ink = luminance(color) > 0.55 ? '#1d1724' : '#ffffff';
  x.fillStyle = ink;
  x.strokeStyle = ink;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const many = g.labels.length >= 9;
  g.faces.forEach((f, fi) => {
    const ox = (fi % cols) * CELL + CELL / 2, oy = Math.floor(fi / cols) * CELL + CELL / 2;
    const { flat } = faceFrame(g, fi);
    if (g.kind === 'd4') {
      // Each corner's number, pointing at its corner, so the top corner reads upright.
      f.forEach((vi, k) => {
        const [px, py] = flat[k];
        x.save();
        x.translate(ox + px * CELL * 0.46 * 0.55, oy - py * CELL * 0.46 * 0.55);
        x.rotate(Math.atan2(px, py));
        x.font = `600 ${CELL * 0.2}px Kanit, system-ui, sans-serif`;
        x.fillText(g.labels[g.vertexValue![vi]], 0, 0);
        x.restore();
      });
      return;
    }
    const label = g.labels[g.faceValue[fi]];
    const size = g.kind === 'd20' || g.kind === 'd8' ? 0.27 : g.kind === 'd10' || g.kind === 'd10u' ? 0.3 : g.kind === 'd10t' ? 0.24 : 0.36;
    x.font = `600 ${CELL * size}px Kanit, system-ui, sans-serif`;
    const yOff = g.kind.startsWith('d10') ? CELL * 0.06 : g.faces[fi].length === 3 ? CELL * 0.05 : 0;
    x.fillText(label, ox, oy + yOff);
    // Underline 6 and 9 so they can't be mistaken for each other.
    if (many && (label === '6' || label === '9')) {
      const w = x.measureText(label).width;
      x.lineWidth = CELL * 0.025;
      x.beginPath();
      x.moveTo(ox - w / 2, oy + yOff + CELL * size * 0.55);
      x.lineTo(ox + w / 2, oy + yOff + CELL * size * 0.55);
      x.stroke();
    }
  });
  return cv;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
