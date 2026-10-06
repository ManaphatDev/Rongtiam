// The fog layer above the tokens: the fog itself (computed from the fog items only when they change, painted by
// FogCanvas) plus SVG overlays for the in-progress shape and the outline of the selected shape.
import type { RoomStore } from '../sync/room.svelte';
import type { ItemRow } from '../sync/types';
import type { Ui } from '../table/ui.svelte';
import { FogCanvas, type View } from './FogCanvas';
import { computeFog, ringsOf, ringsToPath, type FogMode, type FogShape, type Pt, type Ring } from './geometry';

const NS = 'http://www.w3.org/2000/svg';

export interface FogEntry {
  id: string;
  z: number;
  shape: FogShape;
}

export const fogMode = (it: ItemRow): FogMode => (it.props.mode === 'cut' ? 'cut' : 'add');

export class FogLayer {
  private svg: SVGSVGElement;
  private fog: FogCanvas;
  private sel: SVGPathElement;
  private prev: SVGPathElement;
  private band: SVGPathElement;
  private raf = 0;
  private lastKey = '';

  constructor(host: HTMLElement, private store: RoomStore, private ui: Ui) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'fogsvg');
    this.svg.setAttribute('aria-hidden', 'true');
    const path = (cls: string) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('fill-rule', 'evenodd');
      this.svg.appendChild(p);
      return p;
    };
    this.fog = new FogCanvas(host);
    this.sel = path('fog-sel');
    this.band = path('fog-band');
    this.prev = path('fog-prev');
    host.appendChild(this.svg);
  }

  /** Fog items bottom → top, the order their effects are folded in. */
  entries(): FogEntry[] {
    const out: FogEntry[] = [];
    for (const it of this.store.state.all()) {
      if (it.kind === 'fog') out.push({ id: it.id, z: it.z, shape: { mode: fogMode(it), rings: ringsOf(it.props) } });
    }
    return out.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
  }

  /** Redraw on the next frame (many ops often land together). */
  invalidate() {
    if (!this.raf) this.raf = requestAnimationFrame(() => ((this.raf = 0), this.draw()));
  }

  private draw() {
    const es = this.entries();
    const key = es.map((e) => `${e.id}:${e.z}:${e.shape.mode}:${geomSig(e.shape.rings)}`).join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.fog.setShape(computeFog(es.map((e) => e.shape)));
    }
    const picked = this.ui.selectedId ? this.store.item(this.ui.selectedId) : undefined;
    this.sel.setAttribute('d', picked?.kind === 'fog' ? ringsToPath(ringsOf(picked.props)) : '');
  }

  setView(v: View, w: number, h: number) {
    this.fog.setView(v, w, h);
  }

  setUnit(gridSize: number) {
    this.fog.setUnit(gridSize);
  }

  // ---- in-progress shape (local only) -----------------------------------------------

  showShape(rings: Ring[], mode: FogMode) {
    this.prev.setAttribute('d', ringsToPath(rings));
    this.prev.setAttribute('class', `fog-prev ${mode}`);
  }

  /** Open polyline preview (polygon outline, with the rubber band to the pointer). */
  showOutline(pts: Pt[], closed: boolean, mode: FogMode) {
    let d = '';
    pts.forEach((p, i) => (d += `${i ? 'L' : 'M'}${p.x} ${p.y}`));
    if (closed && pts.length > 2) d += 'Z';
    this.prev.setAttribute('d', d);
    this.prev.setAttribute('class', `fog-prev ${mode}${closed ? '' : ' open'}`);
  }

  /** Brush strokes preview as a thick round-capped line, which is also what the committed shape looks like. */
  showBand(pts: Pt[], width: number, mode: FogMode) {
    let d = '';
    pts.forEach((p, i) => (d += `${i ? 'L' : 'M'}${p.x} ${p.y}`));
    if (pts.length === 1) d += 'l0 0';
    this.band.setAttribute('d', d);
    this.band.setAttribute('stroke-width', String(width));
    this.band.setAttribute('class', `fog-band ${mode}`);
  }

  clearPreview() {
    this.prev.setAttribute('d', '');
    this.band.setAttribute('d', '');
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.fog.destroy();
    this.svg.remove();
  }
}

/** Fingerprint of a ring list (cheap next to the boolean ops it saves). */
function geomSig(rings: Ring[]) {
  let n = 0, h = 0;
  for (const r of rings) {
    n += r.length;
    for (const v of r) h = (h * 31 + v) | 0;
  }
  return `${rings.length}.${n}.${h}`;
}
