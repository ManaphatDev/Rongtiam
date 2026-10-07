// Client-side replica of a room: confirmed server rows + this client's pending (optimistic) changes.
//
// Ordering rules:
// - Every server row/event carries `rev` (the room's monotonic counter). Older revs never overwrite newer ones.
// - While the first snapshot loads, events are buffered and then replayed if newer than the snapshot.
// - Deleted ids are tombstoned so a late or buffered `up` can't resurrect them. Items hidden from players are
//   tombstoned only up to that rev, so unhiding (a newer rev) brings them back.

import { pathKey, setIn, type Path } from './paths';
import type {
  AssetRow, CharacterRow, CharOp, ContentRow, DbEvent, InitRow, ItemRow, MemberRow, NewItem, PatchFields, Props, RollRow,
  RoomRow, Snapshot,
} from './types';

interface Pending {
  seq: number;
  add?: NewItem;
  patch?: PatchFields;
  del?: boolean;
}

export type ChangeKind = 'items' | 'members' | 'assets' | 'room' | 'rolls' | 'characters' | 'content' | 'initiative';
type Listener = (kind: ChangeKind, ids?: Set<string>) => void;

const DELETED = Number.POSITIVE_INFINITY;

export function mergePatch(base: PatchFields, next: PatchFields): PatchFields {
  const out: PatchFields = { ...base };
  if (next.props) out.props = { ...(base.props ?? {}), ...next.props };
  if (next.meta) {
    const meta = { ...(base.meta ?? {}) };
    for (const [ns, v] of Object.entries(next.meta)) meta[ns] = { ...(meta[ns] ?? {}), ...v };
    out.meta = meta;
  }
  if (next.z !== undefined) out.z = next.z;
  if (next.locked !== undefined) out.locked = next.locked;
  if (next.hidden !== undefined) out.hidden = next.hidden;
  return out;
}

/** Same semantics as the SQL in apply_ops: props merge with null removing a key, meta merges per namespace. */
export function applyPatch(row: ItemRow, p: PatchFields): ItemRow {
  const out: ItemRow = { ...row };
  if (p.props) {
    const props: Props = { ...row.props };
    for (const [k, v] of Object.entries(p.props)) {
      if (v === null) delete props[k];
      else props[k] = v;
    }
    out.props = props;
  }
  if (p.meta) {
    const meta = { ...row.meta };
    for (const [ns, v] of Object.entries(p.meta)) meta[ns] = { ...(meta[ns] ?? {}), ...v };
    out.meta = meta;
  }
  if (p.z !== undefined) out.z = p.z;
  if (p.locked !== undefined) out.locked = p.locked;
  if (p.hidden !== undefined) out.hidden = p.hidden;
  return out;
}

/**
 * Rows ordered by rev with tombstones, for the collections that have no optimistic adds (characters, room content,
 * initiative). Same rules as items: stale revs are ignored, deletes can't be resurrected, and rows hidden from
 * players are tombstoned only up to that rev so making them visible again brings them back.
 */
export class Collection<T extends { id: string; rev: number }> {
  readonly rows = new Map<string, T>();
  private tombstones = new Map<string, number>();

  load(rows: T[]) {
    this.rows.clear();
    for (const r of rows) this.rows.set(r.id, r);
    for (const [id, rev] of this.tombstones) if (rev !== DELETED) this.tombstones.delete(id);
  }

  /** True when the row was newer and is now stored. */
  up(row: T, rev = row.rev): boolean {
    const t = this.tombstones.get(row.id);
    if (t !== undefined && t >= rev) return false;
    const cur = this.rows.get(row.id);
    if (cur && cur.rev >= rev) return false;
    this.tombstones.delete(row.id);
    this.rows.set(row.id, row);
    return true;
  }

  del(id: string, rev: number, hidden = false) {
    this.tombstones.set(id, hidden ? rev : DELETED);
    this.rows.delete(id);
  }
}

export class RoomState {
  room: RoomRow | null = null;
  readonly items = new Map<string, ItemRow>();
  readonly members = new Map<string, MemberRow>();
  readonly assets = new Map<string, AssetRow>();
  rolls: RollRow[] = [];
  readonly characters = new Collection<CharacterRow>();
  readonly content = new Collection<ContentRow>();
  readonly initiative = new Collection<InitRow>();
  /** This client's unsent/unacknowledged character edits, by character then path. */
  private charPending = new Map<string, Map<string, { path: Path; value: unknown; seq: number }>>();

  private pending = new Map<string, Pending>();
  private tombstones = new Map<string, number>();
  private buffer: DbEvent[] = [];
  private ready = false;
  private seqCounter = 0;
  private listeners = new Set<Listener>();

  constructor(private isGM: () => boolean = () => false) {}

  get loaded() {
    return this.ready;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(kind: ChangeKind, ids?: Set<string>) {
    for (const l of this.listeners) l(kind, ids);
  }

  /** Called when (re)subscribing: events arriving until the next snapshot are held back. */
  beginResync() {
    this.ready = false;
    this.buffer = [];
  }

  loadSnapshot(s: Snapshot) {
    const before = new Set(this.items.keys());
    this.room = s.room;
    this.items.clear();
    for (const it of s.items) this.items.set(it.id, it);
    for (const [id, rev] of this.tombstones) if (rev !== DELETED) this.tombstones.delete(id);
    this.members.clear();
    for (const m of s.members) this.members.set(m.user_id, m);
    this.assets.clear();
    for (const a of s.assets) this.assets.set(assetKey(a.file, a.kind), a);
    this.rolls = [...s.rolls];
    this.characters.load(s.characters ?? []);
    this.content.load(s.content ?? []);
    this.initiative.load(s.initiative ?? []);
    // Pending adds that the server already has are no longer pending (later local changes still are).
    for (const [id, p] of this.pending) if (p.add && this.items.has(id)) this.settleAdd(id, p);

    const queued = this.buffer;
    this.buffer = [];
    this.ready = true;
    for (const e of queued) if (e.rev > s.seq) this.apply(e, true);

    const changed = new Set([...before, ...this.items.keys()]);
    this.emit('room');
    this.emit('members');
    this.emit('assets');
    this.emit('rolls');
    this.emit('characters');
    this.emit('content');
    this.emit('initiative');
    this.emit('items', changed);
  }

  handle(e: DbEvent) {
    if (!this.ready) {
      this.buffer.push(e);
      return;
    }
    this.apply(e, false);
  }

  private apply(e: DbEvent, quiet: boolean) {
    switch (e.kind) {
      case 'item': {
        if (e.op === 'up') {
          const t = this.tombstones.get(e.row.id);
          if (t !== undefined && t >= e.rev) return;
          const cur = this.items.get(e.row.id);
          if (cur && cur.rev >= e.rev) return;
          this.tombstones.delete(e.row.id);
          this.items.set(e.row.id, e.row);
          const p = this.pending.get(e.row.id);
          if (p?.add) this.settleAdd(e.row.id, p);
          if (!quiet) this.emit('items', new Set([e.row.id]));
        } else {
          // GMs also receive the hidden copy on their own topic, so ignore the players' "it's gone" notice.
          if (e.reason === 'hidden' && this.isGM()) return;
          this.tombstones.set(e.id, e.reason === 'hidden' ? e.rev : DELETED);
          this.items.delete(e.id);
          this.pending.delete(e.id);
          if (!quiet) this.emit('items', new Set([e.id]));
        }
        return;
      }
      case 'member': {
        if (e.op === 'up') {
          const cur = this.members.get(e.row.user_id);
          if (cur && cur.rev >= e.rev) return;
          this.members.set(e.row.user_id, e.row);
        } else {
          this.members.delete(e.user_id);
        }
        if (!quiet) this.emit('members');
        return;
      }
      case 'asset': {
        if (e.op === 'up') this.assets.set(assetKey(e.row.file, e.row.kind), e.row);
        else this.assets.delete(assetKey(e.file, e.assetKind));
        if (!quiet) this.emit('assets');
        return;
      }
      case 'room': {
        if (this.room && this.room.rev >= e.rev) return;
        this.room = e.row;
        if (!quiet) this.emit('room');
        return;
      }
      case 'roll': {
        if (this.rolls.some((r) => r.id === e.row.id)) return;
        this.rolls = [...this.rolls, e.row].slice(-200);
        if (!quiet) this.emit('rolls');
        return;
      }
      case 'character':
      case 'init': {
        const coll: Collection<CharacterRow | InitRow> = e.kind === 'character' ? this.characters : this.initiative;
        const kind = e.kind === 'character' ? 'characters' : 'initiative';
        if (e.op === 'up') {
          if (!coll.up(e.row, e.rev)) return;
        } else {
          // GMs also receive the secret copy on their own topic.
          if (e.reason === 'hidden' && this.isGM()) return;
          coll.del(e.id, e.rev, e.reason === 'hidden');
          if (e.kind === 'character') this.charPending.delete(e.id);
        }
        if (!quiet) this.emit(kind);
        return;
      }
      case 'content': {
        if (e.op === 'up') {
          if (!this.content.up(e.row, e.rev)) return;
        } else this.content.del(e.id, e.rev);
        if (!quiet) this.emit('content');
        return;
      }
    }
  }

  /** The server has the added row: drop the add, but keep changes made after it was sent. */
  private settleAdd(id: string, p: Pending) {
    if (p.patch) delete p.add;
    else this.pending.delete(id);
  }

  // ---- reading ---------------------------------------------------------------

  /** Confirmed row with this client's pending changes on top; undefined when absent or pending deletion. */
  get(id: string): ItemRow | undefined {
    const p = this.pending.get(id);
    const base = this.items.get(id);
    if (p?.del) return undefined;
    if (base) return p?.patch ? applyPatch(base, p.patch) : base;
    if (p?.add) {
      const row: ItemRow = {
        id, room_id: this.room?.id ?? '', kind: p.add.kind, z: p.add.z, locked: !!p.add.locked,
        hidden: !!p.add.hidden, props: p.add.props, meta: p.add.meta ?? {}, rev: 0, created_by: null, updated_by: null,
      };
      return p.patch ? applyPatch(row, p.patch) : row;
    }
    return undefined;
  }

  /** All visible item ids (confirmed + pending adds, minus pending deletes). */
  ids(): string[] {
    const out = new Set(this.items.keys());
    for (const [id, p] of this.pending) {
      if (p.del) out.delete(id);
      else if (p.add) out.add(id);
    }
    return [...out];
  }

  all(): ItemRow[] {
    const out: ItemRow[] = [];
    for (const id of this.ids()) {
      const r = this.get(id);
      if (r) out.push(r);
    }
    return out;
  }

  hasPending(id: string) {
    return this.pending.has(id);
  }

  // ---- local (optimistic) changes; each returns the seq to acknowledge later --------

  localAdd(item: NewItem): number {
    const seq = ++this.seqCounter;
    this.pending.set(item.id, { seq, add: item });
    this.emit('items', new Set([item.id]));
    return seq;
  }

  localPatch(id: string, fields: PatchFields): number {
    const seq = ++this.seqCounter;
    const cur = this.pending.get(id);
    if (cur?.add && !this.items.has(id)) {
      // Not on the server yet: fold the change into the add itself. The add may already be on its way, so the
      // change is also kept as a patch to lay over the server's row when it arrives (re-applying it is harmless).
      const merged = applyPatch(this.get(id)!, fields);
      cur.add = { ...cur.add, z: merged.z, locked: merged.locked, hidden: merged.hidden, props: merged.props, meta: merged.meta };
      cur.patch = mergePatch(cur.patch ?? {}, fields);
      cur.seq = seq;
    } else {
      this.pending.set(id, { seq, patch: mergePatch(cur?.patch ?? {}, fields) });
    }
    this.emit('items', new Set([id]));
    return seq;
  }

  localDel(id: string): number {
    const seq = ++this.seqCounter;
    this.pending.set(id, { seq, del: true });
    this.emit('items', new Set([id]));
    return seq;
  }

  /** Server accepted a batch. `rows` are the rows it returned (adds, patches and actually-deleted rows). */
  ack(sent: { id: string; seq: number; t: 'add' | 'patch' | 'del' }[], rows: ItemRow[]) {
    const changed = new Set<string>();
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const s of sent) {
      const row = byId.get(s.id);
      if (s.t === 'del') {
        if (row) {
          this.tombstones.set(s.id, DELETED);
          this.items.delete(s.id);
        }
      } else if (row) {
        const cur = this.items.get(row.id);
        const t = this.tombstones.get(row.id);
        if ((!cur || cur.rev < row.rev) && !(t !== undefined && t >= row.rev)) this.items.set(row.id, row);
      }
      if (this.pending.get(s.id)?.seq === s.seq) this.pending.delete(s.id);
      changed.add(s.id);
    }
    this.emit('items', changed);
  }

  /** Server refused a batch: drop this client's pending changes for those items (the confirmed state shows again). */
  reject(ids: string[]) {
    for (const id of ids) this.pending.delete(id);
    this.emit('items', new Set(ids));
  }

  // ---- characters: confirmed rows with this client's pending field edits on top ------------

  character(id: string): CharacterRow | undefined {
    const base = this.characters.rows.get(id);
    const p = this.charPending.get(id);
    if (!base || !p?.size) return base;
    let data = base.data;
    for (const { path, value } of p.values()) data = setIn(data, path, value);
    return { ...base, data };
  }

  characterList(): CharacterRow[] {
    return [...this.characters.rows.keys()].map((id) => this.character(id)!);
  }

  localCharPatch(id: string, path: Path, value: unknown): number {
    const seq = ++this.seqCounter;
    let p = this.charPending.get(id);
    if (!p) this.charPending.set(id, (p = new Map()));
    p.set(pathKey(path), { path, value, seq });
    this.emit('characters');
    return seq;
  }

  /** The pending edits of a character as ops, with the seq each was recorded at (for acknowledging later). */
  pendingCharOps(id: string): { ops: CharOp[]; sent: { key: string; seq: number }[] } {
    const p = this.charPending.get(id);
    const ops: CharOp[] = [], sent: { key: string; seq: number }[] = [];
    for (const [key, e] of p ?? []) {
      ops.push({ path: e.path, value: e.value ?? null });
      sent.push({ key, seq: e.seq });
    }
    return { ops, sent };
  }

  /** Server applied a patch. Edits made after it was sent stay pending. */
  charAck(id: string, sent: { key: string; seq: number }[], row: CharacterRow) {
    this.characters.up(row);
    const p = this.charPending.get(id);
    for (const s of sent) if (p?.get(s.key)?.seq === s.seq) p.delete(s.key);
    if (p && !p.size) this.charPending.delete(id);
    this.emit('characters');
  }

  charReject(id: string, keys: string[]) {
    const p = this.charPending.get(id);
    for (const k of keys) p?.delete(k);
    if (p && !p.size) this.charPending.delete(id);
    this.emit('characters');
  }

  // ---- convenience ---------------------------------------------------------------------

  member(userId: string | null | undefined) {
    return userId ? this.members.get(userId) : undefined;
  }

  maxZ(kindGroup: (k: ItemRow['kind']) => boolean): number {
    let z = 0;
    for (const it of this.all()) if (kindGroup(it.kind)) z = Math.max(z, it.z);
    return z;
  }
}

export const assetKey = (file: string, kind: string) => `${kind}:${file}`;
