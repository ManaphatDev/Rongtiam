// GM fog drawing: rectangle, polygon and brush shapes (each committed as one fog item), shape picking, and the
// bulk operations (cover everything, clear, compact) with an undo stack that only covers this client's own edits.
import { uuid } from '../lib/rand';
import type { RoomStore } from '../sync/room.svelte';
import type { ItemRow } from '../sync/types';
import type { FogTool as FogKind, Ui } from '../table/ui.svelte';
import {
  brushRings, compactShape, containsPoint, coverRings, polyRings, rectRings, ringsOf, type FogMode, type Pt, type Ring,
} from './geometry';
import { fogMode, type FogLayer } from './FogLayer';

type Undo = () => boolean;
const MAX_UNDO = 50;

export class FogTool {
  private drag: { pid: number; start: Pt; pts: Pt[]; mode: FogMode } | null = null;
  private poly: Pt[] = [];
  private hover: Pt | null = null;
  private undoStack: Undo[] = [];
  /** Ids replaced by undo (a deleted id can never come back, so a restored shape gets a fresh one). */
  private alias = new Map<string, string>();

  constructor(
    private store: RoomStore,
    private ui: Ui,
    private layer: FogLayer,
    private toWorld: (cx: number, cy: number) => Pt,
    private scale: () => number,
  ) {}

  private active() {
    return this.ui.tool === 'fog' && this.store.isGM;
  }

  private modeFor(alt: boolean): FogMode {
    return (this.ui.fogMode === 'add') !== alt ? 'add' : 'cut';
  }

  // ---- pointer ------------------------------------------------------------------------

  /** Returns true when the event was used (the stage then skips its own handling). */
  down(e: PointerEvent): boolean {
    if (!this.active()) return false;
    const p = this.toWorld(e.clientX, e.clientY);
    const tool = this.ui.fogTool;

    if (tool === 'pick') {
      this.ui.select(this.pick(p)?.id ?? null);
      return true;
    }
    if (tool === 'poly') {
      const k = this.scale();
      if (this.poly.length >= 3 && Math.hypot(p.x - this.poly[0].x, p.y - this.poly[0].y) * k < 12) {
        this.finishPoly(e.altKey);
        return true;
      }
      const last = this.poly[this.poly.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) * k >= 3) this.poly.push(p);
      this.hover = p;
      this.drawPoly(e.altKey);
      return true;
    }
    if (this.drag) return false;
    this.drag = { pid: e.pointerId, start: p, pts: [p], mode: this.modeFor(e.altKey) };
    this.drawDrag(p);
    return true;
  }

  move(e: PointerEvent): boolean {
    if (!this.active()) return false;
    const p = this.toWorld(e.clientX, e.clientY);
    if (this.ui.fogTool === 'poly' && this.poly.length) {
      this.hover = p;
      this.drawPoly(e.altKey);
      return false;
    }
    if (!this.drag || e.pointerId !== this.drag.pid) return false;
    this.drag.mode = this.modeFor(e.altKey);
    if (this.ui.fogTool === 'brush') {
      const last = this.drag.pts[this.drag.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * this.scale() >= 2) this.drag.pts.push(p);
    }
    this.drawDrag(p);
    return true;
  }

  up(e: PointerEvent): boolean {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return false;
    this.drag = null;
    this.layer.clearPreview();
    const p = this.toWorld(e.clientX, e.clientY);
    const mode = this.modeFor(e.altKey);
    if (this.ui.fogTool === 'rect') {
      // A click that barely moved is not a shape.
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * this.scale() >= 4) this.commit(mode, rectRings(d.start, p));
    } else if (this.ui.fogTool === 'brush') {
      this.commit(mode, brushRings(d.pts, this.ui.brushWidth));
    }
    return true;
  }

  dblclick(e: MouseEvent) {
    if (this.active() && this.ui.fogTool === 'poly') this.finishPoly(e.altKey);
  }

  /** Enter / Esc / Backspace while drawing a polygon; Ctrl+Z always. Returns true when handled. */
  key(e: KeyboardEvent): boolean {
    if (!this.active()) return false;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      this.undo();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === 'enter' && this.poly.length) {
      this.finishPoly(false);
      return true;
    }
    if (k === 'escape' && (this.poly.length || this.drag)) {
      this.cancel();
      return true;
    }
    if (k === 'backspace' && this.poly.length) {
      e.preventDefault();
      this.poly.pop();
      if (this.poly.length) this.drawPoly(false);
      else this.layer.clearPreview();
      return true;
    }
    const next = { r: 'rect', p: 'poly', b: 'brush', s: 'pick' }[k] as FogKind | undefined;
    if (next) {
      this.ui.fogTool = next;
      return true;
    }
    if (k === 'x') {
      this.ui.fogMode = this.ui.fogMode === 'add' ? 'cut' : 'add';
      return true;
    }
    return false;
  }

  /** Drops any unfinished stroke or polygon (tool or shape type changed, Esc, leaving the tool). */
  cancel() {
    this.drag = null;
    this.poly = [];
    this.hover = null;
    this.layer.clearPreview();
  }

  // ---- previews -----------------------------------------------------------------------------

  private drawDrag(p: Pt) {
    const d = this.drag;
    if (!d) return;
    if (this.ui.fogTool === 'rect') this.layer.showShape(rectRings(d.start, p), d.mode);
    else this.layer.showBand(d.pts, this.ui.brushWidth, d.mode);
  }

  private drawPoly(alt: boolean) {
    const pts = this.hover ? [...this.poly, this.hover] : this.poly;
    this.layer.showOutline(pts, false, this.modeFor(alt));
  }

  private finishPoly(alt: boolean) {
    const pts = this.poly;
    this.poly = [];
    this.hover = null;
    this.layer.clearPreview();
    if (pts.length >= 3) this.commit(this.modeFor(alt), polyRings(pts));
  }

  // ---- editing --------------------------------------------------------------------------------

  /** Topmost drawn shape under the point. */
  pick(p: Pt) {
    const es = this.layer.entries();
    for (let i = es.length - 1; i >= 0; i--) if (containsPoint(es[i].shape.rings, p.x, p.y)) return this.store.item(es[i].id);
    return undefined;
  }

  private cur(id: string) {
    while (this.alias.has(id)) id = this.alias.get(id)!;
    return id;
  }

  private push(u: Undo) {
    this.undoStack.push(u);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.ui.fogUndo = this.undoStack.length;
  }

  private create(mode: FogMode, rings: Ring[], z?: number) {
    const id = uuid();
    this.store.add({ id, kind: 'fog', z: z ?? this.store.topZ('fog'), props: { mode, geom: rings } });
    return id;
  }

  /** Same shape again under a new id (hidden/locked are irrelevant for fog). */
  private restore(row: ItemRow) {
    const id = this.create(fogMode(row), ringsOf(row.props), row.z);
    this.alias.set(row.id, id);
    return id;
  }

  private commit(mode: FogMode, rings: Ring[]) {
    if (!rings.length) return;
    const id = this.create(mode, rings);
    this.push(() => this.removeIfPresent(id));
  }

  private removeIfPresent(id: string) {
    const c = this.cur(id);
    if (!this.store.item(c)) return false;
    this.store.del(c);
    if (this.ui.selectedId === c) this.ui.select(null);
    return true;
  }

  deleteShape(it: ItemRow) {
    const snap = structuredClone(it);
    this.store.del(it.id);
    if (this.ui.selectedId === it.id) this.ui.select(null);
    this.push(() => (this.restore(snap), true));
  }

  setMode(it: ItemRow, mode: FogMode) {
    const prev = fogMode(it);
    if (prev === mode) return;
    this.store.patch(it.id, { props: { mode } });
    this.push(() => {
      const c = this.cur(it.id);
      if (!this.store.item(c)) return false;
      this.store.patch(c, { props: { mode: prev } });
      return true;
    });
  }

  private all() {
    return this.layer.entries().map((e) => this.store.item(e.id)!).filter(Boolean);
  }

  /** Swaps every fog item for `next`; one undo step brings the old ones back. */
  private replaceAll(next: { mode: FogMode; rings: Ring[] }[]) {
    const olds = this.all().map((r) => structuredClone(r));
    for (const r of olds) this.store.del(r.id);
    const base = this.store.topZ('fog');
    const made = next.map((s, i) => this.create(s.mode, s.rings, base + i));
    if (this.ui.selectedId && !this.store.item(this.ui.selectedId)) this.ui.select(null);
    this.push(() => {
      let any = false;
      for (const id of made) any = this.removeIfPresent(id) || any;
      for (const r of olds) (this.restore(r), (any = true));
      return any;
    });
  }

  coverAll() {
    this.replaceAll([{ mode: 'add', rings: coverRings() }]);
  }

  clear() {
    if (this.all().length) this.replaceAll([]);
  }

  /** Merges all shapes into the visible result (one item), keeping the picture identical. */
  compact() {
    const es = this.layer.entries();
    if (es.length < 2) return;
    const merged = compactShape(es.map((e) => e.shape));
    this.replaceAll(merged.rings.length ? [merged] : []);
  }

  undo() {
    while (this.undoStack.length) {
      const u = this.undoStack.pop()!;
      this.ui.fogUndo = this.undoStack.length;
      if (u()) return;
    }
  }
}
