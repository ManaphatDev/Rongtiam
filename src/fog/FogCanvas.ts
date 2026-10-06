// Paints the fog on a canvas the size of the screen (placed inside the world layer so it stacks between the
// tokens and the pings): a feathered mask of the fog shape, filled with two drifting layers of cloud texture.
// The mask is redrawn only when the shape or the view changes; drifting just re-fills it, ~15 times a second.
import { cloudPixels, parseHex, tileNoise, type Rgb } from './clouds';
import { clipRings, ringsToPath, type Ring } from './geometry';

const FPS = 15;
const MAX_DPR = 2;
const TEX = 256;
/** In grid cells: how soft the edge is, and how big each cloud layer's tile is. */
const FEATHER = 0.45, TILE_A = 12, TILE_B = 5;
/** Drift in grid cells per second. */
const DRIFT_A = [0.12, 0.05], DRIFT_B = [-0.2, 0.09];

export interface View {
  x: number;
  y: number;
  k: number;
}

export class FogCanvas {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private mask = document.createElement('canvas');
  private mctx = this.mask.getContext('2d')!;
  private rings: Ring[] = [];
  private view: View = { x: 0, y: 0, k: 1 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private unit = 70;
  private tex: { color: string; a: CanvasPattern; b: CanvasPattern } | null = null;
  private maskDirty = true;
  private raf = 0;
  private lastPaint = 0;
  private readonly t0 = performance.now();
  private still = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private host: HTMLElement) {
    this.canvas.className = 'fogcanvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    this.still.addEventListener('change', this.kick);
  }

  /** The visible fog in world units (empty = no fog). */
  setShape(rings: Ring[]) {
    this.rings = rings;
    this.kick();
  }

  /** The world transform and the stage size in CSS pixels. */
  setView(v: View, w: number, h: number) {
    this.view = { ...v };
    this.w = w;
    this.h = h;
    const s = this.canvas.style;
    s.left = `${-v.x / v.k}px`;
    s.top = `${-v.y / v.k}px`;
    s.width = `${w / v.k}px`;
    s.height = `${h / v.k}px`;
    this.kick();
  }

  /** Grid size in world units; the edge softness and cloud size follow it. */
  setUnit(u: number) {
    if (u > 0 && u !== this.unit) {
      this.unit = u;
      this.kick();
    }
  }

  private kick = () => {
    this.maskDirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  };

  private tick = (now: number) => {
    this.raf = 0;
    const moving = this.rings.length > 0 && !this.still.matches;
    if (this.maskDirty) {
      this.renderMask();
      this.maskDirty = false;
      this.paint(now);
    } else if (now - this.lastPaint >= 1000 / FPS) this.paint(now);
    if (moving) this.raf = requestAnimationFrame(this.tick);
  };

  private resize() {
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(this.w * this.dpr)), H = Math.max(1, Math.round(this.h * this.dpr));
    for (const c of [this.canvas, this.mask]) {
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
    }
  }

  private renderMask() {
    this.resize();
    const c = this.mctx, { x, y, k } = this.view, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.mask.width, this.mask.height);
    if (!this.rings.length) return;
    const blur = Math.min(80, this.unit * FEATHER * k) * d;
    // Only what is on screen, plus enough margin that the blur doesn't fade the fog at the screen's edges.
    const m = (blur * 2 + 8) / (d * k);
    const path = new Path2D(ringsToPath(clipRings(this.rings, -x / k - m, -y / k - m, (this.w - x) / k + m, (this.h - y) / k + m)));
    c.fillStyle = '#000';
    if (blur < 0.75) {
      c.setTransform(d * k, 0, 0, d * k, d * x, d * y);
      c.fill(path, 'evenodd');
      return;
    }
    // Shadow trick (works in every browser, unlike ctx.filter): draw the clipped shape entirely to the left of the
    // canvas and let only its blurred shadow land back on it.
    const off = this.mask.width + m * d * k * 2 + blur * 4 + 16;
    c.setTransform(d * k, 0, 0, d * k, d * x - off, d * y);
    c.shadowColor = '#000';
    c.shadowBlur = blur;
    c.shadowOffsetX = off;
    c.shadowOffsetY = 0;
    c.fill(path, 'evenodd');
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetX = 0;
  }

  private paint(now: number) {
    this.lastPaint = now;
    const c = this.ctx, { x, y, k } = this.view, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.rings.length) return;
    c.drawImage(this.mask, 0, 0);

    const tex = this.texture();
    const t = this.still.matches ? 0 : (now - this.t0) / 1000;
    const u = this.unit;
    // Patterns live in world units, so the clouds stay put on the map while panning and zooming.
    c.setTransform(d * k, 0, 0, d * k, d * x, d * y);
    const x0 = -x / k, y0 = -y / k, ww = this.w / k, hh = this.h / k;
    c.globalCompositeOperation = 'source-in';
    tex.a.setTransform(new DOMMatrix().translateSelf(t * DRIFT_A[0] * u, t * DRIFT_A[1] * u).scaleSelf((TILE_A * u) / TEX));
    c.fillStyle = tex.a;
    c.fillRect(x0, y0, ww, hh);
    // A second, smaller layer moving the other way gives depth; source-atop keeps the mask's alpha.
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = 0.5;
    tex.b.setTransform(new DOMMatrix().translateSelf(t * DRIFT_B[0] * u, t * DRIFT_B[1] * u).scaleSelf((TILE_B * u) / TEX));
    c.fillStyle = tex.b;
    c.fillRect(x0, y0, ww, hh);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /** Cloud patterns in the current fog colour (rebuilt when the theme changes it). */
  private texture() {
    const color = getComputedStyle(this.host).getPropertyValue('--fog').trim();
    if (this.tex?.color === color) return this.tex;
    const base: Rgb = parseHex(color) ?? [20, 16, 28];
    const wisp = base.map((v) => Math.min(255, v + 30)) as Rgb;
    const make = (seed: number) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = TEX;
      cv.getContext('2d')!.putImageData(new ImageData(cloudPixels(tileNoise(TEX, seed), base, wisp), TEX, TEX), 0, 0);
      return this.ctx.createPattern(cv, 'repeat')!;
    };
    this.tex = { color, a: make(11), b: make(29) };
    return this.tex;
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.still.removeEventListener('change', this.kick);
    this.canvas.remove();
  }
}
