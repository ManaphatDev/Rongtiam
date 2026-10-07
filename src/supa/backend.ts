import type { RealtimeChannel } from '@supabase/supabase-js';
import { toDbEvent, type Backend, type BackendHandlers, type NewCharacter, type NewInit, type NewRoll } from '../sync/backend';
import type { CharacterRow, CharOp, InitRow, ItemRow, MemberRow, Op, PresenceInfo, RoomSettings, Snapshot } from '../sync/types';
import { rpc, supa, type RpcError } from './client';

const BUCKET = 'room-assets';

function fail(error: { code?: string; message: string } | null) {
  if (error) throw { code: error.code, message: error.message } satisfies RpcError;
}

export class SupabaseBackend implements Backend {
  private channels: RealtimeChannel[] = [];
  private live: RealtimeChannel | null = null;
  private me: PresenceInfo | null = null;
  private subscribedOnce = new Set<string>();

  constructor(readonly roomId: string, readonly userId: string) {}

  async connect(h: BackendHandlers, me: PresenceInfo, isGM: boolean) {
    const s = supa();
    this.me = me;
    await s.realtime.setAuth();
    h.onStatus('connecting');

    const scopes: ('db' | 'gm')[] = isGM ? ['db', 'gm'] : ['db'];
    const ready = new Set<string>();
    const total = scopes.length + 1;
    const onState = (name: string) => (status: string) => {
      if (status === 'SUBSCRIBED') {
        ready.add(name);
        // Every (re)join of a stored-state channel means we may have missed events.
        if (name !== 'live' && this.subscribedOnce.has(name)) h.onSubscribed();
        this.subscribedOnce.add(name);
        if (ready.size === total) h.onStatus('live');
        if (name === 'live' && this.me) void this.live?.track(this.me);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        ready.delete(name);
        h.onStatus('offline');
      }
    };

    const first: Promise<void>[] = [];
    for (const scope of scopes) {
      const ch = s.channel(`room:${this.roomId}:${scope}`, { config: { private: true } });
      ch.on('broadcast', { event: '*' }, (msg) => {
        const e = toDbEvent(msg.event, (msg.payload ?? {}) as Record<string, unknown>, scope);
        if (e) h.onEvent(e);
      });
      first.push(subscribed(ch, onState(scope)));
      this.channels.push(ch);
    }

    const live = s.channel(`room:${this.roomId}:live`, {
      config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.userId } },
    });
    live.on('broadcast', { event: '*' }, (msg) => h.onLive(msg.event, msg.payload));
    live.on('presence', { event: 'sync' }, () => {
      const state = live.presenceState<PresenceInfo>();
      const list: PresenceInfo[] = [];
      for (const metas of Object.values(state)) if (metas[0]) list.push(metas[0]);
      h.onPresence(list);
    });
    this.live = live;
    this.channels.push(live);
    first.push(subscribed(live, onState('live')));

    await Promise.all(first);
  }

  async snapshot(): Promise<Snapshot> {
    return rpc<Snapshot>('room_snapshot', { p_room: this.roomId });
  }

  async applyOps(ops: Op[]): Promise<ItemRow[]> {
    return (await rpc<ItemRow[]>('apply_ops', { p_room: this.roomId, p_ops: ops })) ?? [];
  }

  sendLive(event: string, payload: unknown) {
    void this.live?.send({ type: 'broadcast', event, payload });
  }

  async insertRoll(r: NewRoll) {
    const { error } = await supa().from('roll_log').insert({ room_id: this.roomId, user_id: this.userId, ...r });
    fail(error);
  }

  async updateRoom(fields: { name?: string; settings?: RoomSettings; ruleset_id?: string }) {
    const { error } = await supa().from('rooms').update(fields).eq('id', this.roomId);
    fail(error);
  }

  async updateMember(userId: string, fields: Partial<Pick<MemberRow, 'status' | 'role' | 'display_name' | 'color'>>) {
    const { error } = await supa().from('room_members').update(fields).eq('room_id', this.roomId).eq('user_id', userId);
    fail(error);
    if (userId === this.userId && this.me && (fields.display_name || fields.color)) {
      this.me = { ...this.me, name: fields.display_name ?? this.me.name, color: fields.color ?? this.me.color };
      void this.live?.track(this.me);
    }
  }

  async removeMember(userId: string) {
    const { error } = await supa().from('room_members').delete().eq('room_id', this.roomId).eq('user_id', userId);
    fail(error);
  }

  async rotateGmKey() {
    return rpc<string>('rotate_gm_key', { p_room: this.roomId });
  }

  async uploadImage(file: string, blob: Blob) {
    const { error } = await supa().storage.from(BUCKET).upload(`${this.roomId}/${file}`, blob, {
      contentType: blob.type, upsert: false, cacheControl: '31536000',
    });
    // Content-addressed: "already exists" means someone uploaded the very same bytes.
    if (error && !/exist|duplicate/i.test(error.message) && (error as { statusCode?: string }).statusCode !== '409') {
      throw { message: error.message } satisfies RpcError;
    }
  }

  async downloadImage(file: string) {
    const { data, error } = await supa().storage.from(BUCKET).download(`${this.roomId}/${file}`);
    if (error || !data) throw { message: error?.message ?? 'download failed' } satisfies RpcError;
    return data;
  }

  async addAsset(a: { file: string; kind: 'map' | 'token' | 'sticker'; w: number; h: number }) {
    const { error } = await supa().from('assets').insert({ room_id: this.roomId, ...a });
    if (error && error.code !== '23505') fail(error);
  }

  async removeAsset(file: string, kind: 'map' | 'token' | 'sticker') {
    const { error } = await supa().from('assets').delete().eq('room_id', this.roomId).eq('file', file).eq('kind', kind);
    fail(error);
  }

  async insertCharacter(c: NewCharacter) {
    const { data, error } = await supa().from('characters').insert({ room_id: this.roomId, ...c }).select().single();
    fail(error);
    return data as CharacterRow;
  }

  async patchCharacter(id: string, ops: CharOp[]) {
    return rpc<CharacterRow>('character_patch', { p_id: id, p_ops: ops });
  }

  async updateCharacter(id: string, fields: Partial<Pick<CharacterRow, 'owner_id' | 'visibility'>>) {
    const { error } = await supa().from('characters').update(fields).eq('id', id);
    fail(error);
  }

  async deleteCharacter(id: string) {
    const { error } = await supa().from('characters').delete().eq('id', id);
    fail(error);
  }

  async upsertContent(c: { kind: string; key: string; data: Record<string, unknown> }) {
    const { error } = await supa().from('room_content').upsert({ room_id: this.roomId, ...c }, { onConflict: 'room_id,kind,key' });
    fail(error);
  }

  async deleteContent(id: string) {
    const { error } = await supa().from('room_content').delete().eq('id', id);
    fail(error);
  }

  async insertInit(e: NewInit) {
    const { data, error } = await supa().from('initiative_entries').insert({ room_id: this.roomId, ...e }).select().single();
    fail(error);
    return data as InitRow;
  }

  async updateInit(id: string, fields: Partial<Pick<InitRow, 'name' | 'init' | 'tie' | 'hidden' | 'item_id'>>) {
    const { error } = await supa().from('initiative_entries').update(fields).eq('id', id);
    fail(error);
  }

  async deleteInit(id: string) {
    const { error } = await supa().from('initiative_entries').delete().eq('id', id);
    fail(error);
  }

  disconnect() {
    const s = supa();
    for (const ch of this.channels) void s.removeChannel(ch);
    this.channels = [];
    this.live = null;
  }
}

function subscribed(ch: RealtimeChannel, onState: (status: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    ch.subscribe((status, err) => {
      onState(status);
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true;
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        settled = true;
        reject(err ?? new Error(`realtime ${status}`));
      }
    });
  });
}
