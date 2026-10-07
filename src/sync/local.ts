// In-memory backend for trying the table without Supabase (dev only, single player as GM).
import { setIn } from './paths';
import { applyPatch } from './state';
import type { Backend, BackendHandlers, NewCharacter, NewInit, NewRoll } from './backend';
import type {
  AssetRow, CharacterRow, CharOp, ContentRow, InitRow, ItemRow, MemberRow, Op, PresenceInfo, RoomRow, RoomSettings, Snapshot,
} from './types';

export class LocalBackend implements Backend {
  readonly roomId = 'local';
  readonly userId = 'local-user';
  private seq = 0;
  private h: BackendHandlers | null = null;
  private items = new Map<string, ItemRow>();
  private assets = new Map<string, AssetRow>();
  private images = new Map<string, Blob>();
  private rolls: Snapshot['rolls'] = [];
  private characters = new Map<string, CharacterRow>();
  private content = new Map<string, ContentRow>();
  private initiative = new Map<string, InitRow>();
  private room: RoomRow = {
    id: 'local', slug: 'local', name: 'โต๊ะทดลอง', ruleset_id: 'none',
    settings: { grid: { on: false, size: 70 }, snap: true }, rev: 0, created_by: this.userId,
  };
  private me: MemberRow = {
    room_id: 'local', user_id: this.userId, role: 'gm', status: 'approved', display_name: 'GM', color: '#e5484d', rev: 0,
  };

  async connect(h: BackendHandlers, me: PresenceInfo) {
    this.h = h;
    h.onStatus('live');
    h.onPresence([me]);
  }

  async snapshot(): Promise<Snapshot> {
    return {
      seq: this.seq, room: this.room, members: [this.me], items: [...this.items.values()],
      assets: [...this.assets.values()], rolls: this.rolls, characters: [...this.characters.values()],
      content: [...this.content.values()], initiative: [...this.initiative.values()],
    };
  }

  async applyOps(ops: Op[]) {
    const out: ItemRow[] = [];
    for (const op of ops) {
      if (op.t === 'add') {
        const r: ItemRow = {
          id: op.item.id, room_id: 'local', kind: op.item.kind, z: op.item.z, locked: !!op.item.locked,
          hidden: !!op.item.hidden, props: op.item.props, meta: op.item.meta ?? {}, rev: ++this.seq,
          created_by: this.userId, updated_by: this.userId,
        };
        this.items.set(r.id, r);
        out.push(r);
        this.emit({ kind: 'item', scope: 'db', op: 'up', row: r, rev: r.rev });
      } else if (op.t === 'patch') {
        const cur = this.items.get(op.id);
        if (!cur) throw { code: '42501', message: 'forbidden_or_missing' };
        const { t: _t, id: _id, ...f } = op;
        const r = { ...applyPatch(cur, f), rev: ++this.seq };
        this.items.set(r.id, r);
        out.push(r);
        this.emit({ kind: 'item', scope: 'db', op: 'up', row: r, rev: r.rev });
      } else {
        const cur = this.items.get(op.id);
        if (cur) {
          this.items.delete(op.id);
          out.push(cur);
          this.emit({ kind: 'item', scope: 'db', op: 'del', id: op.id, rev: ++this.seq });
        }
      }
    }
    return out;
  }

  sendLive() {}

  async insertRoll(r: NewRoll) {
    const row = { room_id: 'local', user_id: this.userId, ...r, id: r.id ?? crypto.randomUUID(), rev: ++this.seq, created_at: new Date().toISOString() };
    this.rolls.push(row);
    this.emit({ kind: 'roll', scope: 'db', op: 'up', row, rev: row.rev });
  }

  async updateRoom(fields: { name?: string; settings?: RoomSettings; ruleset_id?: string }) {
    this.room = { ...this.room, ...fields, rev: ++this.seq };
    this.emit({ kind: 'room', scope: 'db', op: 'up', row: this.room, rev: this.room.rev });
  }

  async updateMember(_u: string, fields: Partial<MemberRow>) {
    this.me = { ...this.me, ...fields, rev: ++this.seq };
    this.emit({ kind: 'member', scope: 'db', op: 'up', row: this.me, rev: this.me.rev });
  }

  async removeMember() {}
  async rotateGmKey() {
    return 'local';
  }

  async uploadImage(file: string, blob: Blob) {
    this.images.set(file, blob);
  }

  async downloadImage(file: string) {
    const b = this.images.get(file);
    if (!b) throw { message: 'missing image' };
    return b;
  }

  async addAsset(a: { file: string; kind: AssetRow['kind']; w: number; h: number }) {
    const row: AssetRow = { room_id: 'local', ...a, rev: ++this.seq, created_by: this.userId };
    this.assets.set(`${a.kind}:${a.file}`, row);
    this.emit({ kind: 'asset', scope: 'db', op: 'up', row, rev: row.rev });
  }

  async removeAsset(file: string, kind: AssetRow['kind']) {
    this.assets.delete(`${kind}:${file}`);
    this.emit({ kind: 'asset', scope: 'db', op: 'del', file, assetKind: kind, rev: ++this.seq });
  }

  async insertCharacter(c: NewCharacter) {
    const row: CharacterRow = {
      id: crypto.randomUUID(), room_id: 'local', owner_id: c.owner_id === undefined ? this.userId : c.owner_id, ruleset: c.ruleset,
      visibility: c.visibility ?? 'party', data: c.data, rev: ++this.seq,
    };
    this.characters.set(row.id, row);
    this.emit({ kind: 'character', scope: 'db', op: 'up', row, rev: row.rev });
    return row;
  }

  async patchCharacter(id: string, ops: CharOp[]) {
    const cur = this.characters.get(id);
    if (!cur) throw { code: '42501', message: 'forbidden_or_missing' };
    let data = cur.data;
    for (const o of ops) data = setIn(data, o.path, o.value);
    const row = { ...cur, data, rev: ++this.seq };
    this.characters.set(id, row);
    this.emit({ kind: 'character', scope: 'db', op: 'up', row, rev: row.rev });
    return row;
  }

  async updateCharacter(id: string, fields: Partial<Pick<CharacterRow, 'owner_id' | 'visibility'>>) {
    const cur = this.characters.get(id);
    if (!cur) return;
    const row = { ...cur, ...fields, rev: ++this.seq };
    this.characters.set(id, row);
    this.emit({ kind: 'character', scope: 'db', op: 'up', row, rev: row.rev });
  }

  async deleteCharacter(id: string) {
    if (!this.characters.delete(id)) return;
    this.emit({ kind: 'character', scope: 'db', op: 'del', id, rev: ++this.seq });
    for (const e of [...this.initiative.values()]) if (e.character_id === id) await this.deleteInit(e.id);
  }

  async upsertContent(c: { kind: string; key: string; data: Record<string, unknown> }) {
    const cur = [...this.content.values()].find((x) => x.kind === c.kind && x.key === c.key);
    const row: ContentRow = { id: cur?.id ?? crypto.randomUUID(), room_id: 'local', ...c, rev: ++this.seq };
    this.content.set(row.id, row);
    this.emit({ kind: 'content', scope: 'db', op: 'up', row, rev: row.rev });
  }

  async deleteContent(id: string) {
    if (!this.content.delete(id)) return;
    this.emit({ kind: 'content', scope: 'db', op: 'del', id, rev: ++this.seq });
  }

  async insertInit(e: NewInit) {
    const row: InitRow = {
      id: crypto.randomUUID(), room_id: 'local', character_id: null, item_id: null, tie: 0, hidden: false, ...e,
      rev: ++this.seq, created_by: this.userId, created_at: new Date().toISOString(),
    };
    this.initiative.set(row.id, row);
    this.emit({ kind: 'init', scope: 'db', op: 'up', row, rev: row.rev });
    return row;
  }

  async updateInit(id: string, fields: Partial<Pick<InitRow, 'name' | 'init' | 'tie' | 'hidden' | 'item_id'>>) {
    const cur = this.initiative.get(id);
    if (!cur) return;
    const row = { ...cur, ...fields, rev: ++this.seq };
    this.initiative.set(id, row);
    this.emit({ kind: 'init', scope: 'db', op: 'up', row, rev: row.rev });
  }

  async deleteInit(id: string) {
    if (!this.initiative.delete(id)) return;
    this.emit({ kind: 'init', scope: 'db', op: 'del', id, rev: ++this.seq });
  }

  disconnect() {
    this.h = null;
  }

  private emit(e: Parameters<BackendHandlers['onEvent']>[0]) {
    queueMicrotask(() => this.h?.onEvent(e));
  }
}
