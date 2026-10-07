import type {
  CharacterRow, CharOp, ContentRow, DbEvent, InitRow, ItemRow, MemberRow, Op, PresenceInfo, RollResult, RoomSettings, Snapshot,
} from './types';

export type ConnStatus = 'connecting' | 'live' | 'offline';

export interface BackendHandlers {
  onEvent(e: DbEvent): void;
  onLive(event: string, payload: unknown): void;
  onPresence(list: PresenceInfo[]): void;
  onStatus(s: ConnStatus): void;
  /** Channels (re)joined: the caller should buffer events and load a fresh snapshot. */
  onSubscribed(): void;
}

export interface NewRoll {
  /** Chosen by the roller so the live replay and the stored row can be matched. */
  id?: string;
  label: string;
  spec: Record<string, unknown>;
  result: RollResult;
  visibility: 'all' | 'gm';
}

export interface NewCharacter {
  ruleset: string;
  data: Record<string, unknown>;
  visibility?: CharacterRow['visibility'];
  /** GMs may create for someone else (or nobody: an NPC); for players the server always uses themselves. */
  owner_id?: string | null;
}

export type NewInit = Pick<InitRow, 'name' | 'init'> & Partial<Pick<InitRow, 'character_id' | 'item_id' | 'tie' | 'hidden'>>;

/** Everything the table needs from the server. Implemented by Supabase and by an in-memory local backend. */
export interface Backend {
  readonly userId: string;
  readonly roomId: string;
  connect(h: BackendHandlers, me: PresenceInfo, isGM: boolean): Promise<void>;
  snapshot(): Promise<Snapshot>;
  applyOps(ops: Op[]): Promise<ItemRow[]>;
  sendLive(event: string, payload: unknown): void;
  insertRoll(r: NewRoll): Promise<void>;
  updateRoom(fields: { name?: string; settings?: RoomSettings; ruleset_id?: string }): Promise<void>;
  updateMember(userId: string, fields: Partial<Pick<MemberRow, 'status' | 'role' | 'display_name' | 'color'>>): Promise<void>;
  removeMember(userId: string): Promise<void>;
  rotateGmKey(): Promise<string>;
  uploadImage(file: string, blob: Blob): Promise<void>;
  downloadImage(file: string): Promise<Blob>;
  addAsset(a: { file: string; kind: 'map' | 'token' | 'sticker'; w: number; h: number }): Promise<void>;
  removeAsset(file: string, kind: 'map' | 'token' | 'sticker'): Promise<void>;
  insertCharacter(c: NewCharacter): Promise<CharacterRow>;
  /** Field-level edit (character_patch): only the given paths change. */
  patchCharacter(id: string, ops: CharOp[]): Promise<CharacterRow>;
  /** GM only: who owns it and whether players can see it. */
  updateCharacter(id: string, fields: Partial<Pick<CharacterRow, 'owner_id' | 'visibility'>>): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  upsertContent(c: { kind: string; key: string; data: Record<string, unknown> }): Promise<void>;
  deleteContent(id: string): Promise<void>;
  insertInit(e: NewInit): Promise<InitRow>;
  updateInit(id: string, fields: Partial<Pick<InitRow, 'name' | 'init' | 'tie' | 'hidden' | 'item_id'>>): Promise<void>;
  deleteInit(id: string): Promise<void>;
  disconnect(): void;
}

/** Converts a trigger broadcast ({op,row|id|...,rev}) into a typed event. */
export function toDbEvent(event: string, payload: Record<string, unknown>, scope: 'db' | 'gm'): DbEvent | null {
  const rev = Number(payload.rev ?? 0);
  const op = payload.op as 'up' | 'del';
  switch (event) {
    case 'item':
      return op === 'up'
        ? { kind: 'item', scope, op, row: payload.row as ItemRow, rev }
        : { kind: 'item', scope, op: 'del', id: String(payload.id), rev, reason: payload.reason === 'hidden' ? 'hidden' : undefined };
    case 'member':
      return op === 'up'
        ? { kind: 'member', scope, op, row: payload.row as MemberRow, rev }
        : { kind: 'member', scope, op: 'del', user_id: String(payload.user_id), rev };
    case 'asset':
      return op === 'up'
        ? { kind: 'asset', scope, op, row: payload.row as never, rev }
        : { kind: 'asset', scope, op: 'del', file: String(payload.file), assetKind: payload.kind as never, rev };
    case 'room':
      return { kind: 'room', scope, op: 'up', row: payload.row as never, rev };
    case 'roll':
      return { kind: 'roll', scope, op: 'up', row: payload.row as never, rev };
    case 'character':
    case 'init':
      return op === 'up'
        ? { kind: event, scope, op, row: payload.row as never, rev }
        : { kind: event, scope, op: 'del', id: String(payload.id), rev, reason: payload.reason === 'hidden' ? 'hidden' : undefined };
    case 'content':
      return op === 'up'
        ? { kind: 'content', scope, op, row: payload.row as never, rev }
        : { kind: 'content', scope, op: 'del', id: String(payload.id), rev };
    default:
      return null;
  }
}
