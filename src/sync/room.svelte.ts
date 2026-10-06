// One connected room: replica state + op queue + ephemeral bus + images, exposed to Svelte through version counters.
import { AssetCache } from './assets';
import type { Backend, ConnStatus, NewRoll } from './backend';
import { EphemeralBus } from './ephemeral';
import { OpQueue, type SendError } from './opqueue';
import { RoomState } from './state';
import { FORBIDDEN, type ItemRow, type MemberRow, type NewItem, type PatchFields, type PresenceInfo, type RoomSettings } from './types';

export interface Preview {
  u: string;
  x: number;
  y: number;
  rot?: number;
  at: number;
}

export interface Ping {
  x: number;
  y: number;
  color: string;
}

/** Where the GM asks everyone to look: the centre and the world-space size they want visible. */
export interface ViewTarget {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export class RoomStore {
  readonly state: RoomState;
  readonly ops: OpQueue;
  readonly bus: EphemeralBus;
  readonly assets: AssetCache;

  // Reactive bits for Svelte. Large collections stay in `state` (plain Maps); bumping a version re-runs $derived.
  itemsVersion = $state(0);
  membersVersion = $state(0);
  assetsVersion = $state(0);
  roomVersion = $state(0);
  rollsVersion = $state(0);
  online = $state.raw<PresenceInfo[]>([]);
  status = $state<ConnStatus>('connecting');
  kicked = $state<null | 'kicked' | 'banned'>(null);

  /** Positions other people are dragging right now (not yet committed). */
  readonly previews = new Map<string, Preview>();
  private previewListeners = new Set<(id: string) => void>();
  private pingListeners = new Set<(p: Ping) => void>();
  private rollListeners = new Set<(r: import('./types').RollRow) => void>();
  private viewListeners = new Set<(v: ViewTarget) => void>();
  private resyncing = false;

  constructor(readonly backend: Backend, private me: PresenceInfo, private onError: (msg: string) => void) {
    this.state = new RoomState(() => this.isGM);
    this.ops = new OpQueue(this.state, {
      send: (ops) => backend.applyOps(ops),
      onRejected: (e) => this.onError(rejectMessage(e)),
    });
    this.bus = new EphemeralBus((event, payload) => backend.sendLive(event, payload), () => this.online.length);
    this.assets = new AssetCache(backend.roomId, (f) => backend.downloadImage(f));

    this.state.subscribe((kind, ids) => {
      if (kind === 'items') {
        this.itemsVersion++;
        // A committed position supersedes the live preview of whoever moved it.
        if (ids) for (const id of ids) if (this.previews.delete(id)) this.emitPreview(id);
      } else if (kind === 'members') {
        this.membersVersion++;
        this.checkKicked();
      } else if (kind === 'assets') this.assetsVersion++;
      else if (kind === 'room') this.roomVersion++;
      else if (kind === 'rolls') this.rollsVersion++;
    });
  }

  get userId() {
    return this.backend.userId;
  }

  get meMember(): MemberRow | undefined {
    void this.membersVersion;
    return this.state.members.get(this.userId);
  }

  get isGM() {
    void this.membersVersion;
    return this.state.members.get(this.userId)?.role === 'gm';
  }

  get settings(): RoomSettings {
    void this.roomVersion;
    return this.state.room?.settings ?? { grid: { on: false, size: 70 }, snap: true };
  }

  async connect(isGM: boolean) {
    this.state.beginResync();
    await this.backend.connect(
      {
        onEvent: (e) => {
          if (e.kind === 'roll' && this.state.loaded && !this.state.rolls.some((r) => r.id === e.row.id)) {
            for (const l of this.rollListeners) l(e.row);
          }
          this.state.handle(e);
        },
        onLive: (event, payload) => this.onLive(event, payload),
        onPresence: (list) => (this.online = list),
        onStatus: (s) => (this.status = s),
        onSubscribed: () => void this.resync(),
      },
      this.me,
      isGM,
    );
    await this.loadSnapshot();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
  }

  private hiddenAt = 0;
  private onVisibility = () => {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.bus.paused = true;
    } else {
      this.bus.paused = false;
      if (this.hiddenAt && Date.now() - this.hiddenAt > 30_000) void this.resync();
    }
  };
  private onOnline = () => void this.resync();

  private async loadSnapshot() {
    const snap = await this.backend.snapshot();
    if (!snap.room) {
      this.kicked = 'kicked';
      return;
    }
    this.state.loadSnapshot(snap);
  }

  async resync() {
    if (this.resyncing) return;
    this.resyncing = true;
    try {
      this.state.beginResync();
      await this.loadSnapshot();
    } catch {
      // Stay buffered; the next reconnect/visibility change retries.
    } finally {
      this.resyncing = false;
    }
  }

  private checkKicked() {
    if (!this.state.loaded) return;
    const m = this.state.members.get(this.userId);
    if (!m) this.kicked = 'kicked';
    else if (m.status === 'banned') this.kicked = 'banned';
    if (this.kicked) this.dispose();
  }

  // ---- ephemeral ---------------------------------------------------------------

  private onLive(event: string, payload: unknown) {
    if (event === 'drag') {
      const p = payload as { u: string; items: { id: string; x: number; y: number; rot?: number }[] };
      for (const it of p.items) {
        if (!this.state.get(it.id)) continue;
        this.previews.set(it.id, { u: p.u, x: it.x, y: it.y, rot: it.rot, at: Date.now() });
        this.emitPreview(it.id);
      }
    } else if (event === 'ping') {
      const p = payload as Ping;
      for (const l of this.pingListeners) l(p);
    } else if (event === 'view') {
      // The live topic is writable by every member, so only follow views that claim to come from a GM.
      const p = payload as Partial<ViewTarget> & { u?: string };
      const v = { cx: p.cx, cy: p.cy, w: p.w, h: p.h };
      if (!p.u || p.u === this.userId || this.state.members.get(p.u)?.role !== 'gm') return;
      if (![v.cx, v.cy, v.w, v.h].every((n) => typeof n === 'number' && Number.isFinite(n)) || v.w! <= 0 || v.h! <= 0) return;
      for (const l of this.viewListeners) l(v as ViewTarget);
    }
  }

  onPreview(fn: (id: string) => void) {
    this.previewListeners.add(fn);
    return () => this.previewListeners.delete(fn);
  }

  onPing(fn: (p: Ping) => void) {
    this.pingListeners.add(fn);
    return () => this.pingListeners.delete(fn);
  }

  /** Fires when a GM asks everyone to look at one spot (Sync View). */
  onView(fn: (v: ViewTarget) => void) {
    this.viewListeners.add(fn);
    return () => this.viewListeners.delete(fn);
  }

  /** Fires for rolls made by others after the room loaded (for the on-table toast). */
  onRoll(fn: (r: import('./types').RollRow) => void) {
    this.rollListeners.add(fn);
    return () => this.rollListeners.delete(fn);
  }

  private emitPreview(id: string) {
    for (const l of this.previewListeners) l(id);
  }

  sendDrag(items: { id: string; x: number; y: number; rot?: number }[]) {
    if (!items.length) return;
    this.bus.put(`drag:${items.map((i) => i.id).join(',')}`, 'drag', { u: this.userId, items });
  }

  sendView(v: ViewTarget) {
    this.bus.immediate('view', { u: this.userId, ...v });
  }

  sendPing(x: number, y: number) {
    this.bus.immediate('ping', { x, y, color: this.meMember?.color ?? this.me.color });
  }

  // ---- writes ------------------------------------------------------------------

  item(id: string): ItemRow | undefined {
    return this.state.get(id);
  }

  add(item: NewItem) {
    this.ops.add(item);
  }

  patch(id: string, fields: PatchFields, delay = 0) {
    this.ops.patch(id, fields, delay);
  }

  del(id: string) {
    this.ops.del(id);
  }

  /** Top of the stacking order for the item's layer group (maps, fog, or everything else). */
  topZ(kind: ItemRow['kind']) {
    const group = (k: ItemRow['kind']) => (k === 'map' ? 'map' : k === 'fog' ? 'fog' : 'items');
    return this.state.maxZ((k) => group(k) === group(kind)) + 1;
  }

  async roll(r: NewRoll) {
    try {
      await this.backend.insertRoll(r);
    } catch (e) {
      this.onError(rejectMessage(e as SendError));
    }
  }

  async updateSettings(settings: RoomSettings) {
    try {
      await this.backend.updateRoom({ settings });
    } catch (e) {
      this.onError(rejectMessage(e as SendError));
    }
  }

  async member(userId: string, fields: Partial<Pick<MemberRow, 'status' | 'role' | 'display_name' | 'color'>>) {
    try {
      await this.backend.updateMember(userId, fields);
    } catch (e) {
      this.onError(rejectMessage(e as SendError));
    }
  }

  async kick(userId: string) {
    try {
      await this.backend.removeMember(userId);
    } catch (e) {
      this.onError(rejectMessage(e as SendError));
    }
  }

  /** Uploads (content-addressed, so re-uploads are free) and records the asset. Shows locally right away. */
  async storeImage(p: { blob: Blob; file: string; w: number; h: number }, kind: 'map' | 'token' | 'sticker') {
    this.assets.put(p.file, p.blob);
    await this.backend.uploadImage(p.file, p.blob);
    await this.backend.addAsset({ file: p.file, kind, w: p.w, h: p.h });
  }

  async removeAsset(file: string, kind: 'map' | 'token' | 'sticker') {
    try {
      await this.backend.removeAsset(file, kind);
    } catch (e) {
      this.onError(rejectMessage(e as SendError));
    }
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    this.bus.dispose();
    this.backend.disconnect();
  }
}

export function rejectMessage(e: SendError): string {
  if (e?.code === FORBIDDEN) return 'ไม่มีสิทธิ์ทำแบบนี้ (หรือของชิ้นนี้ถูกลบ/ล็อกไปแล้ว)';
  return e?.message ? `บันทึกไม่สำเร็จ: ${e.message}` : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}
