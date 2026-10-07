// The table surface: pan/zoom, pointer interaction and per-item DOM, ported from legacy/dnd-table.html.
// Reads items from the RoomStore (confirmed + pending), layers this client's in-progress drag and other
// players' live drag previews on top, and commits one patch when a drag ends.
import { FogLayer } from '../fog/FogLayer';
import { FogTool } from '../fog/FogTool';
import { aabb, clamp, normDeg, snapOffset, unionBox } from '../lib/geometry';
import type { RoomStore, ViewTarget } from '../sync/room.svelte';
import type { ItemRow } from '../sync/types';
import type { Ui } from './ui.svelte';
import { prefs } from './ui.svelte';

export interface StageEls {
  stage: HTMLElement;
  world: HTMLElement;
  maps: HTMLElement;
  items: HTMLElement;
  fog: HTMLElement;
  pings: HTMLElement;
  grid: HTMLElement;
}

/** What a token shows about its creature: bars (HP...) and active condition icons. */
export interface TokenStatus {
  bars: { label: string; current: number; max: number; color: string }[];
  icons: { icon: string; label: string }[];
}

interface Override {
  x?: number;
  y?: number;
  rot?: number;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class Stage {
  view = { x: 0, y: 0, k: 1 };
  private els = new Map<string, HTMLElement>();
  private overrides = new Map<string, Override>();
  private shown = new Map<string, { x: number; y: number; rot: number }>();
  private pointers = new Map<number, { x: number; y: number }>();
  private pan: { x: number; y: number; vx: number; vy: number } | null = null;
  private pinch: { d: number; k: number; wx: number; wy: number } | null = null;
  private drag: { id: string; pid: number; dx: number; dy: number; moved: boolean } | null = null;
  private rotating: { id: string; pid: number; cx: number; cy: number; a0: number; r0: number } | null = null;
  private spaceHeld = false;
  private anim = 0;
  private unsub: (() => void)[] = [];
  private saveViewTimer: ReturnType<typeof setTimeout> | null = null;
  private viewAnim = 0;
  readonly fog: FogLayer;
  /** Bars and condition icons for a token (from its bound character sheet, or its own NPC HP). */
  private status: (it: ItemRow) => TokenStatus | null = () => null;
  readonly fogTool: FogTool;

  constructor(private el: StageEls, private store: RoomStore, private ui: Ui, private onFiles: (files: File[], at: { x: number; y: number }) => void) {
    this.fog = new FogLayer(el.fog, store, ui);
    this.fogTool = new FogTool(store, ui, this.fog, (x, y) => this.toWorld(x, y), () => this.view.k);
    this.unsub.push(store.state.subscribe((kind, ids) => {
      if (kind === 'items') {
        this.render(ids);
        this.fog.invalidate();
      }
      if (kind === 'room') this.renderGrid();
      // A sheet or the room's custom template changed: tokens show its bars/conditions.
      if (kind === 'characters' || kind === 'content') this.renderTokens();
    }));
    this.unsub.push(store.onView((v) => {
      if (store.isGM) return;
      this.followView(v);
      ui.showToast('GM พาไปดูจุดนี้');
    }));
    this.unsub.push(store.onPreview((id) => this.kickAnim(id)));
    this.unsub.push(store.onPing((p) => this.drawPing(p.x, p.y, p.color)));
    this.bind();
    const saved = prefs.load<{ x: number; y: number; k: number } | null>(`view:${store.backend.roomId}`, null);
    if (saved && Number.isFinite(saved.k)) {
      this.view = saved;
      this.applyView();
    } else {
      requestAnimationFrame(() => this.fitView());
    }
    this.render();
    this.renderGrid();
  }

  // ---- permissions (mirrors RLS so the UI doesn't offer what the server will refuse) ----

  canEdit(it: ItemRow) {
    return this.store.isGM || ((it.kind === 'char' || it.kind === 'sticker') && !it.locked && !it.hidden);
  }

  canSelect(it: ItemRow) {
    return this.store.isGM || (it.kind !== 'map' && it.kind !== 'fog');
  }

  // ---- view -----------------------------------------------------------------------

  private stageSize() {
    const r = this.el.stage.getBoundingClientRect();
    return { w: r.width, h: r.height, l: r.left, t: r.top };
  }

  applyView() {
    const { x, y, k } = this.view;
    this.el.world.style.transform = `translate(${x}px,${y}px) scale(${k})`;
    this.el.world.style.setProperty('--inv', String(1 / k));
    this.el.stage.style.backgroundPosition = `${x}px ${y}px`;
    const { w, h } = this.stageSize();
    this.fog.setView(this.view, w, h);
    if (this.saveViewTimer) clearTimeout(this.saveViewTimer);
    this.saveViewTimer = setTimeout(() => prefs.store(`view:${this.store.backend.roomId}`, this.view), 500);
  }

  fitView() {
    const { w, h } = this.stageSize();
    const all = this.store.state.all();
    const maps = all.filter((i) => i.kind === 'map');
    const box = unionBox((maps.length ? maps : all.filter((i) => i.kind !== 'fog')).map((i) => aabb(this.geom(i))));
    if (box && box.r > box.l && box.b > box.t) {
      this.view.k = clamp(Math.min(w / (box.r - box.l), h / (box.b - box.t)) * 0.92, 0.01, 8);
      this.view.x = w / 2 - box.cx * this.view.k;
      this.view.y = h / 2 - box.cy * this.view.k;
    } else {
      this.view = { x: w / 2, y: h / 2, k: 1 };
    }
    this.applyView();
  }

  toWorld(cx: number, cy: number) {
    const s = this.stageSize();
    return { x: (cx - s.l - this.view.x) / this.view.k, y: (cy - s.t - this.view.y) / this.view.k };
  }

  viewCenter() {
    const { w, h } = this.stageSize();
    return { x: (w / 2 - this.view.x) / this.view.k, y: (h / 2 - this.view.y) / this.view.k };
  }

  zoomAt(px: number, py: number, f: number) {
    const k = clamp(this.view.k * f, 0.01, 8);
    const real = k / this.view.k;
    this.view.x = px - (px - this.view.x) * real;
    this.view.y = py - (py - this.view.y) * real;
    this.view.k = k;
    this.applyView();
  }

  zoomCenter(f: number) {
    const s = this.stageSize();
    this.zoomAt(s.w / 2, s.h / 2, f);
  }

  /** GM: ask every player to look at what this view currently shows. */
  syncView() {
    const { w, h } = this.stageSize();
    const c = this.viewCenter();
    this.store.sendView({ cx: c.x, cy: c.y, w: w / this.view.k, h: h / this.view.k });
    this.ui.showToast('ส่งมุมมองนี้ให้ผู้เล่นแล้ว');
  }

  /** Fit the requested world area into this (possibly smaller) screen, easing there unless motion is reduced. */
  private followView(v: ViewTarget) {
    const { w, h } = this.stageSize();
    const k = clamp(Math.min(w / v.w, h / v.h), 0.01, 8);
    const to = { x: w / 2 - v.cx * k, y: h / 2 - v.cy * k, k };
    if (this.viewAnim) cancelAnimationFrame(this.viewAnim);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.view = to;
      this.applyView();
      return;
    }
    const from = { ...this.view };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 350);
      const f = 1 - (1 - t) ** 3;
      // Zoom exponentially so the motion feels even at any scale.
      const kk = from.k * (to.k / from.k) ** f;
      this.view = { k: kk, x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
      this.applyView();
      this.viewAnim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.viewAnim = requestAnimationFrame(step);
  }

  centerOn(id: string) {
    const it = this.store.item(id);
    if (!it) return;
    const g = this.geom(it);
    const { w, h } = this.stageSize();
    this.view.x = w / 2 - g.x * this.view.k;
    this.view.y = h / 2 - g.y * this.view.k;
    this.applyView();
  }

  isOnScreen(id: string) {
    const it = this.store.item(id);
    if (!it) return false;
    const g = this.geom(it);
    const s = this.stageSize();
    const px = this.view.x + g.x * this.view.k, py = this.view.y + g.y * this.view.k;
    return px > 0 && px < s.w && py > 0 && py < s.h;
  }

  // ---- geometry of an item as currently displayed ----------------------------------

  /** Position/rotation including this client's drag and others' animated previews. */
  geom(it: ItemRow) {
    const p = it.props;
    const o = this.overrides.get(it.id);
    const s = this.shown.get(it.id);
    return {
      kind: it.kind,
      x: o?.x ?? s?.x ?? num(p.x),
      y: o?.y ?? s?.y ?? num(p.y),
      rot: o?.rot ?? s?.rot ?? num(p.rot),
      size: num(p.size, 70),
      aspect: num(p.aspect, 1),
    };
  }

  // ---- rendering ------------------------------------------------------------------

  renderGrid() {
    const g = this.store.settings.grid;
    const el = this.el.grid;
    this.fog.setUnit(g.size);
    if (!g.on) {
      el.style.display = 'none';
      return;
    }
    const half = Math.ceil(10000 / g.size) * g.size;
    Object.assign(el.style, {
      display: 'block', left: `${-half}px`, top: `${-half}px`, width: `${half * 2}px`, height: `${half * 2}px`,
      backgroundSize: `${g.size}px ${g.size}px`,
    });
  }

  /** Re-render the given items (all when omitted), then restack. */
  render(ids?: Set<string>) {
    const targets = ids ?? new Set([...this.store.state.ids(), ...this.els.keys()]);
    for (const id of targets) {
      const it = this.store.item(id);
      if (!it || it.kind === 'fog') {
        this.els.get(id)?.remove();
        this.els.delete(id);
        this.overrides.delete(id);
        this.shown.delete(id);
        if (!it && this.ui.selectedId === id) this.ui.select(null);
        continue;
      }
      this.updateEl(it);
    }
    this.restack();
  }

  private activeTurn: string | null = null;

  /** Rings the token whose turn it is. */
  setActiveTurn(id: string | null) {
    if (id === this.activeTurn) return;
    const prev = this.activeTurn;
    this.activeTurn = id;
    for (const x of [prev, id]) {
      const it = x ? this.store.item(x) : undefined;
      if (it) this.updateEl(it);
    }
  }

  setStatusSource(fn: (it: ItemRow) => TokenStatus | null) {
    this.status = fn;
    this.renderTokens();
  }

  /** Re-render character tokens only (their overlays depend on sheets, not just on the item). */
  renderTokens() {
    for (const id of this.els.keys()) {
      const it = this.store.item(id);
      if (it?.kind === 'char') this.updateEl(it);
    }
  }

  refreshSelection() {
    this.fog.invalidate();
    for (const id of this.els.keys()) {
      const it = this.store.item(id);
      if (it) this.updateEl(it);
    }
  }

  private restack() {
    const rows = [...this.els.keys()].map((id) => this.store.item(id)).filter((r): r is ItemRow => !!r);
    rows.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
    rows.forEach((r, i) => {
      const el = this.els.get(r.id);
      if (el) el.style.zIndex = String(i + 1);
    });
  }

  private makeEl(it: ItemRow) {
    const el = document.createElement('div');
    el.className = `item ${it.kind}`;
    el.dataset.id = it.id;
    if (it.kind === 'char') el.innerHTML = '<div class="disc"><img alt=""></div><div class="tag"></div>';
    else if (it.kind === 'map') el.innerHTML = '<img class="mapimg" alt="">';
    else if (it.props.emoji) el.innerHTML = '<span class="emo"></span>';
    else el.innerHTML = '<img class="simg" alt="">';
    el.setAttribute('role', 'button');
    el.addEventListener('focus', () => {
      if (this.ui.selectedId !== it.id) this.ui.select(it.id);
      if (!this.isOnScreen(it.id)) this.centerOn(it.id);
    });
    (it.kind === 'map' ? this.el.maps : this.el.items).appendChild(el);
    this.els.set(it.id, el);
    return el;
  }

  private setImg(img: HTMLImageElement, file: string | undefined) {
    if (!file) {
      img.removeAttribute('src');
      img.dataset.file = '';
      return;
    }
    if (img.dataset.file === file) return;
    img.dataset.file = file;
    const hit = this.store.assets.peek(file);
    if (hit) img.src = hit;
    else {
      img.removeAttribute('src');
      this.store.assets.url(file).then((u) => {
        if (img.dataset.file === file) img.src = u;
      }, () => img.classList.add('broken'));
    }
  }

  private updateEl(it: ItemRow) {
    const el = this.els.get(it.id) ?? this.makeEl(it);
    const p = it.props;
    const g = this.geom(it);
    const selected = it.id === this.ui.selectedId;
    el.style.setProperty('--s', `${g.size}px`);
    el.style.width = `${g.size}px`;
    el.classList.toggle('sel', selected);
    el.classList.toggle('locked', it.locked);
    el.classList.toggle('hidden-gm', it.hidden);
    el.classList.toggle('noedit', !this.canEdit(it));
    el.classList.toggle('turn', it.id === this.activeTurn);
    // Tab reaches what this person may pick up; the name says what it is.
    el.tabIndex = this.canSelect(it) ? 0 : -1;
    el.setAttribute('aria-pressed', String(selected));
    const st = it.kind === 'char' ? this.status(it) : null;
    el.setAttribute('aria-label', [itemName(it), ...(st?.bars.map((b) => `${b.label} ${b.current}/${b.max}`) ?? []), ...(st?.icons.map((i) => i.label) ?? [])].join(', '));

    if (it.kind === 'char') {
      el.style.height = `${g.size}px`;
      el.style.transform = `translate(${g.x}px,${g.y}px) translate(-50%,-50%)`;
      const disc = el.querySelector<HTMLElement>('.disc')!;
      disc.style.borderColor = String(p.color ?? '#ffffff');
      const img = disc.querySelector('img')!;
      this.setImg(img, p.img);
      const zoom = num(p.zoom, 1);
      img.style.transform = `translate(${num(p.ox)}%,${num(p.oy)}%) scale(${zoom * (p.flip ? -1 : 1)}, ${zoom})`;
      el.querySelector('.tag')!.textContent = String(p.name ?? '');
      this.renderStatus(el, this.status(it));
    } else if (it.kind === 'map') {
      el.style.height = `${g.size * g.aspect}px`;
      el.style.transform = `translate(${g.x}px,${g.y}px) translate(-50%,-50%) rotate(${g.rot}deg)`;
      const img = el.firstElementChild as HTMLImageElement;
      this.setImg(img, p.img);
      img.style.transform = p.flip ? 'scaleX(-1)' : '';
    } else {
      el.style.transform = `translate(${g.x}px,${g.y}px) translate(-50%,-50%) rotate(${g.rot}deg)`;
      const child = el.firstElementChild as HTMLElement;
      child.style.transform = p.flip ? 'scaleX(-1)' : '';
      if (p.emoji) {
        child.textContent = String(p.emoji);
        child.style.fontSize = `${g.size * 0.85}px`;
      } else this.setImg(child as HTMLImageElement, p.img);
    }

    const wantsHandle = selected && it.kind !== 'char' && !it.locked && this.canEdit(it);
    let h = el.querySelector(':scope > .rot-handle');
    if (wantsHandle && !h) {
      h = document.createElement('div');
      h.className = 'rot-handle';
      h.textContent = '↻';
      (h as HTMLElement).title = 'ลากเพื่อหมุน';
      el.appendChild(h);
    } else if (!wantsHandle && h) h.remove();
  }

  /** HP-style bars under the token and condition icons around its top edge. */
  private renderStatus(el: HTMLElement, s: TokenStatus | null) {
    let ov = el.querySelector<HTMLElement>(':scope > .tok-status');
    if (!s || (!s.bars.length && !s.icons.length)) {
      ov?.remove();
      return;
    }
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'tok-status';
      ov.setAttribute('aria-hidden', 'true');
      el.appendChild(ov);
    }
    const key = JSON.stringify(s);
    if (ov.dataset.key === key) return;
    ov.dataset.key = key;
    ov.replaceChildren();
    const bars = document.createElement('div');
    bars.className = 'tok-bars';
    for (const b of s.bars) {
      const bar = document.createElement('div');
      bar.className = 'tok-bar';
      bar.title = `${b.label} ${b.current}/${b.max}`;
      const fill = document.createElement('i');
      fill.style.width = `${b.max > 0 ? Math.max(0, Math.min(100, (b.current / b.max) * 100)) : 0}%`;
      fill.style.background = b.color;
      bar.appendChild(fill);
      bars.appendChild(bar);
    }
    ov.appendChild(bars);
    if (s.icons.length) {
      const icons = document.createElement('div');
      icons.className = 'tok-icons';
      for (const i of s.icons) {
        const sp = document.createElement('span');
        sp.textContent = i.icon;
        sp.title = i.label;
        icons.appendChild(sp);
      }
      ov.appendChild(icons);
    }
  }

  // ---- other players' live drags: ease toward the latest preview -----------------------

  private kickAnim(id: string) {
    if (this.overrides.has(id)) return;
    if (!this.store.previews.has(id)) {
      this.shown.delete(id);
      const it = this.store.item(id);
      if (it) this.updateEl(it);
      return;
    }
    if (!this.shown.has(id)) {
      const it = this.store.item(id);
      if (!it) return;
      const g = this.geom(it);
      this.shown.set(id, { x: g.x, y: g.y, rot: g.rot });
    }
    if (!this.anim) this.anim = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.anim = 0;
    const now = Date.now();
    let more = false;
    for (const [id, cur] of this.shown) {
      const pv = this.store.previews.get(id);
      if (!pv || now - pv.at > 1500 || this.overrides.has(id)) {
        this.store.previews.delete(id);
        this.shown.delete(id);
        const it = this.store.item(id);
        if (it) this.updateEl(it);
        continue;
      }
      cur.x += (pv.x - cur.x) * 0.35;
      cur.y += (pv.y - cur.y) * 0.35;
      if (pv.rot !== undefined) cur.rot += normDeg(pv.rot - cur.rot) * 0.35;
      const it = this.store.item(id);
      if (it) this.updateEl(it);
      more = true;
    }
    if (more) this.anim = requestAnimationFrame(this.tick);
  };

  // ---- pings ------------------------------------------------------------------------

  ping(x: number, y: number) {
    this.drawPing(x, y, this.store.meMember?.color ?? '#ffd24a');
    this.store.sendPing(x, y);
  }

  private drawPing(x: number, y: number, color: string) {
    for (const c of ['a', 'b']) {
      const d = document.createElement('div');
      d.className = `ping ${c}`;
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      const sz = 170 / this.view.k;
      d.style.width = `${sz}px`;
      d.style.height = `${sz}px`;
      d.style.borderWidth = `${5 / this.view.k}px`;
      d.style.borderColor = color;
      this.el.pings.appendChild(d);
      setTimeout(() => d.remove(), 1700);
    }
  }

  // ---- item commands (selection panel / keyboard) ----------------------------------------

  rotateSel(deg: number) {
    const it = this.selected();
    if (!it || it.kind === 'char' || it.locked || !this.canEdit(it)) return;
    this.store.patch(it.id, { props: { rot: normDeg(num(it.props.rot) + deg) } }, 150);
  }

  /** Moves the selected piece with the arrow keys: a fifth of a grid cell, or a whole cell with Shift. */
  nudgeSel(key: string, cell: boolean) {
    const it = this.selected();
    if (!it || it.locked || !this.canEdit(it)) return;
    const step = this.store.settings.grid.size / (cell ? 1 : 5);
    const [dx, dy] = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[key] ?? [0, 0];
    this.store.patch(it.id, { props: { x: num(it.props.x) + dx * step, y: num(it.props.y) + dy * step } }, 150);
  }

  deleteSel() {
    const it = this.selected();
    if (!it || !this.canEdit(it)) return;
    if (it.kind === 'fog') {
      this.fogTool.deleteShape(it);
      return;
    }
    this.store.del(it.id);
    this.ui.select(null);
  }

  selected() {
    return this.ui.selectedId ? this.store.item(this.ui.selectedId) : undefined;
  }

  // ---- input ------------------------------------------------------------------------

  private bind() {
    const st = this.el.stage;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, ev: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn as EventListener, opts);
      this.unsub.push(() => t.removeEventListener(ev, fn as EventListener, opts));
    };

    on(st, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(st, 'scroll', () => {
      st.scrollTop = 0;
      st.scrollLeft = 0;
    });
    on(st, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(st, 'pointerup', (e: PointerEvent) => this.onUp(e));
    on(st, 'pointercancel', (e: PointerEvent) => this.onUp(e));
    on(st, 'wheel', (e: WheelEvent) => {
      // Panels floating over the table (the character sheet) scroll themselves.
      if ((e.target as HTMLElement).closest('.overlay-ui')) return;
      e.preventDefault();
      const s = this.stageSize();
      this.zoomAt(e.clientX - s.l, e.clientY - s.t, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    on(st, 'dblclick', (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.tools, .showui, .overlay-ui') || t.closest('.item:not(.map)')) return;
      if (this.ui.tool === 'fog') {
        this.fogTool.dblclick(e);
        return;
      }
      const w = this.toWorld(e.clientX, e.clientY);
      this.ping(w.x, w.y);
    });
    for (const ev of ['dragenter', 'dragover']) {
      on(st, ev, (e: DragEvent) => {
        if ([...(e.dataTransfer?.types ?? [])].includes('Files')) {
          e.preventDefault();
          st.classList.add('dragover');
        }
      });
    }
    for (const ev of ['dragleave', 'drop']) on(st, ev, () => st.classList.remove('dragover'));
    on(st, 'drop', (e: DragEvent) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) this.onFiles(files, this.toWorld(e.clientX, e.clientY));
    });

    // The fog canvas covers exactly the stage, so it follows window and side-panel resizes.
    const ro = new ResizeObserver(() => {
      const { w, h } = this.stageSize();
      this.fog.setView(this.view, w, h);
    });
    ro.observe(st);
    this.unsub.push(() => ro.disconnect());

    on(document, 'keydown', (e: KeyboardEvent) => this.onKey(e));
    on(document, 'keyup', (e: KeyboardEvent) => {
      if (e.key === ' ') this.releaseSpace();
    });
    on(window, 'blur', () => this.releaseSpace());
  }

  private releaseSpace() {
    this.spaceHeld = false;
    this.el.stage.classList.remove('spacehand');
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    const s = this.stageSize();
    const cx = (a.x + b.x) / 2 - s.l, cy = (a.y + b.y) / 2 - s.t;
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: this.view.k, wx: (cx - this.view.x) / this.view.k, wy: (cy - this.view.y) / this.view.k };
  }

  private doPinch() {
    const [a, b] = [...this.pointers.values()];
    const s = this.stageSize();
    const cx = (a.x + b.x) / 2 - s.l, cy = (a.y + b.y) / 2 - s.t;
    const k = clamp((this.pinch!.k * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch!.d, 0.01, 8);
    this.view.k = k;
    this.view.x = cx - this.pinch!.wx * k;
    this.view.y = cy - this.pinch!.wy * k;
    this.applyView();
  }

  private onDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.tools, .showui, .overlay-ui')) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    const handMode = e.button === 1 || this.spaceHeld || this.ui.tool === 'hand';
    const st = this.el.stage;

    if (!handMode && this.ui.tool === 'ping' && e.button === 0 && this.pointers.size === 0) {
      const w = this.toWorld(e.clientX, e.clientY);
      this.ping(w.x, w.y);
      return;
    }
    if (!handMode && this.ui.tool === 'fog' && e.button === 0 && this.pointers.size === 0 && this.fogTool.down(e)) {
      st.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (!handMode && this.ui.tool === 'select' && !this.drag && !this.rotating && this.pointers.size === 0) {
      const hEl = target.closest('.rot-handle');
      const sel = this.selected();
      if (hEl && sel && this.canEdit(sel)) {
        const s = this.stageSize();
        const g = this.geom(sel);
        const cx = s.l + this.view.x + g.x * this.view.k, cy = s.t + this.view.y + g.y * this.view.k;
        this.rotating = { id: sel.id, pid: e.pointerId, cx, cy, a0: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI, r0: g.rot };
        st.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      const el = target.closest<HTMLElement>('.item');
      const it = el ? this.store.item(el.dataset.id!) : undefined;
      if (it && this.canSelect(it)) {
        this.ui.select(it.id);
        if (it.locked || !this.canEdit(it)) return;
        const w = this.toWorld(e.clientX, e.clientY);
        const g = this.geom(it);
        this.drag = { id: it.id, pid: e.pointerId, dx: w.x - g.x, dy: w.y - g.y, moved: false };
        st.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.setPointerCapture(e.pointerId);
    if (this.pointers.size === 1) {
      if (handMode) {
        this.pan = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
        st.classList.add('panning');
        e.preventDefault();
      } else if (this.ui.tool === 'select') this.ui.select(null);
    } else if (this.pointers.size === 2) {
      this.pan = null;
      this.startPinch();
    }
  }

  private onMove(e: PointerEvent) {
    if (this.ui.tool === 'fog' && this.fogTool.move(e)) return;
    if (this.rotating && e.pointerId === this.rotating.pid) {
      const r0 = this.rotating;
      const ang = (Math.atan2(e.clientY - r0.cy, e.clientX - r0.cx) * 180) / Math.PI;
      let r = normDeg(r0.r0 + (ang - r0.a0));
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else {
        const n = Math.round(r / 45) * 45;
        if (Math.abs(r - n) < 3) r = n;
      }
      this.setOverride(r0.id, { rot: normDeg(r) });
      const it = this.store.item(r0.id);
      if (it) {
        const g = this.geom(it);
        this.store.sendDrag([{ id: it.id, x: g.x, y: g.y, rot: g.rot }]);
      }
      return;
    }
    if (this.drag && e.pointerId === this.drag.pid) {
      const it = this.store.item(this.drag.id);
      if (!it) return;
      const w = this.toWorld(e.clientX, e.clientY);
      let x = w.x - this.drag.dx, y = w.y - this.drag.dy;
      if (it.kind === 'map' && this.ui.snap && !e.altKey) {
        const others = this.store.state.all().filter((o) => o.kind === 'map' && o.id !== it.id).map((o) => this.geom(o));
        const d = snapOffset({ ...this.geom(it), x, y }, others, 14 / this.view.k);
        x += d.dx;
        y += d.dy;
      }
      this.drag.moved = true;
      this.setOverride(it.id, { x, y });
      this.store.sendDrag([{ id: it.id, x, y }]);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2 && this.pinch) this.doPinch();
    else if (this.pan && this.pointers.size === 1) {
      this.view.x = this.pan.vx + (e.clientX - this.pan.x);
      this.view.y = this.pan.vy + (e.clientY - this.pan.y);
      this.applyView();
    }
  }

  private onUp(e: PointerEvent) {
    if (this.fogTool.up(e)) return;
    if (this.rotating && e.pointerId === this.rotating.pid) {
      const { id } = this.rotating;
      const rot = this.overrides.get(id)?.rot;
      this.rotating = null;
      if (rot !== undefined) this.store.patch(id, { props: { rot } });
      this.clearOverride(id);
      return;
    }
    if (this.drag && e.pointerId === this.drag.pid) {
      const { id, moved } = this.drag;
      this.drag = null;
      const o = this.overrides.get(id);
      const it = this.store.item(id);
      if (moved && o && it) {
        // Dropping something lifts it to the top of its layer.
        const z = it.kind === 'map' ? undefined : this.store.topZ(it.kind);
        this.store.patch(id, { props: { x: o.x, y: o.y }, ...(z !== undefined && z - 1 > it.z ? { z } : {}) });
      }
      this.clearOverride(id);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    if (this.pointers.size === 1) {
      const p = [...this.pointers.values()][0];
      this.pan = this.el.stage.classList.contains('panning') || this.ui.tool === 'hand' || this.spaceHeld
        ? { x: p.x, y: p.y, vx: this.view.x, vy: this.view.y }
        : null;
    } else if (this.pointers.size === 0) {
      this.pan = null;
      this.el.stage.classList.remove('panning');
    }
  }

  private setOverride(id: string, o: Override) {
    this.overrides.set(id, { ...this.overrides.get(id), ...o });
    this.shown.delete(id);
    const it = this.store.item(id);
    if (it) this.updateEl(it);
  }

  private clearOverride(id: string) {
    this.overrides.delete(id);
    const it = this.store.item(id);
    if (it) this.updateEl(it);
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    if (this.fogTool.key(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const onTable = t === document.body || t === this.el.stage || t.classList.contains('item');
    if (e.key.startsWith('Arrow') && onTable && this.ui.selectedId) {
      e.preventDefault();
      this.nudgeSel(e.key, e.shiftKey);
      return;
    }
    if (e.key === ' ' && !onTable) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this.el.stage.classList.add('spacehand');
      }
      return;
    }
    if (k === 'h') this.ui.toggleAll();
    else if (k === 't') this.ui.toolsHidden = !this.ui.toolsHidden;
    else if (k === 'f') this.fitView();
    else if (k === 'v' || k === '1') this.ui.tool = 'select';
    else if (k === '2') this.ui.tool = 'hand';
    else if (k === '3') this.ui.tool = 'ping';
    else if (k === '4' && this.store.isGM) this.ui.tool = 'fog';
    else if (k === 'q') this.rotateSel(e.shiftKey ? -90 : -15);
    else if (k === 'e') this.rotateSel(e.shiftKey ? 90 : 15);
    else if (k === '+' || k === '=') this.zoomCenter(1.3);
    else if (k === '-') this.zoomCenter(1 / 1.3);
    else if (k === 'escape') this.ui.select(null);
    else if ((k === 'delete' || k === 'backspace') && this.ui.selectedId && onTable) {
      e.preventDefault();
      this.deleteSel();
    }
  }

  destroy() {
    for (const u of this.unsub) u();
    this.unsub = [];
    if (this.anim) cancelAnimationFrame(this.anim);
    if (this.viewAnim) cancelAnimationFrame(this.viewAnim);
    this.fog.destroy();
    if (this.saveViewTimer) clearTimeout(this.saveViewTimer);
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}

/** What a screen reader hears for a piece on the table. */
function itemName(it: ItemRow) {
  const hidden = it.hidden ? ' (ซ่อนจากผู้เล่น)' : '';
  const locked = it.locked ? ' (ล็อก)' : '';
  if (it.kind === 'char') return `ตัวละคร ${String(it.props.name ?? '') || 'ไม่มีชื่อ'}${hidden}${locked}`;
  if (it.kind === 'map') return `แมพ ${String(it.props.name ?? '')}${hidden}${locked}`;
  return `สติกเกอร์${it.props.emoji ? ` ${String(it.props.emoji)}` : ''}${hidden}${locked}`;
}
