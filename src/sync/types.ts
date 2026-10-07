// Shapes of rows as stored in Supabase and as exchanged over realtime.

export type ItemKind = 'map' | 'char' | 'sticker' | 'fog';
export type Role = 'gm' | 'player';
export type MemberStatus = 'pending' | 'approved' | 'banned';

/** Flat per-kind fields. A null value in a patch removes the key. */
export interface Props {
  x?: number;
  y?: number;
  size?: number;
  rot?: number;
  flip?: boolean;
  /** Asset file name inside the room folder, e.g. `<sha256>.webp`. */
  img?: string;
  name?: string;
  // map
  aspect?: number;
  pw?: number;
  ph?: number;
  // char
  color?: string;
  zoom?: number;
  ox?: number;
  oy?: number;
  // sticker
  emoji?: string;
  [k: string]: unknown;
}

export interface ItemRow {
  id: string;
  room_id: string;
  kind: ItemKind;
  z: number;
  locked: boolean;
  hidden: boolean;
  props: Props;
  meta: Record<string, Record<string, unknown>>;
  rev: number;
  created_by: string | null;
  updated_by: string | null;
  updated_at?: string;
}

export interface NewItem {
  id: string;
  kind: ItemKind;
  z: number;
  locked?: boolean;
  hidden?: boolean;
  props: Props;
  meta?: Record<string, Record<string, unknown>>;
}

export interface PatchFields {
  props?: { [K in keyof Props]?: Props[K] | null };
  meta?: Record<string, Record<string, unknown>>;
  z?: number;
  locked?: boolean;
  hidden?: boolean;
}

export type Op =
  | { t: 'add'; item: NewItem }
  | ({ t: 'patch'; id: string } & PatchFields)
  | { t: 'del'; id: string };

export interface RoomSettings {
  grid: { on: boolean; size: number };
  snap: boolean;
  /** Whose turn it is (an initiative entry id) and the round number. */
  initiative?: { round: number; current: string | null };
  [k: string]: unknown;
}

export interface RoomRow {
  id: string;
  slug: string;
  name: string;
  ruleset_id: string;
  settings: RoomSettings;
  rev: number;
  created_by: string | null;
}

export interface MemberRow {
  room_id: string;
  user_id: string;
  role: Role;
  status: MemberStatus;
  display_name: string;
  color: string;
  rev: number;
}

export interface AssetRow {
  room_id: string;
  file: string;
  kind: 'map' | 'token' | 'sticker';
  w: number;
  h: number;
  rev: number;
  created_by: string | null;
}

export interface RollResult {
  /** `dropped`: rolled but not counted (e.g. the lower d20 with advantage). */
  dice: { id: string; sides: number; value: number; dropped?: boolean }[];
  total: number;
  breakdown: string;
  crit?: 'hit' | 'fumble';
  engine?: string;
}

export interface RollRow {
  id: string;
  room_id: string;
  user_id: string;
  label: string;
  spec: Record<string, unknown>;
  result: RollResult;
  visibility: 'all' | 'gm';
  rev: number;
  created_at: string;
}

/** A character sheet. `data` belongs to its ruleset; `visibility: 'gm'` rows (secret NPCs) only reach GMs. */
export interface CharacterRow {
  id: string;
  room_id: string;
  owner_id: string | null;
  ruleset: string;
  visibility: 'party' | 'gm';
  data: Record<string, unknown>;
  rev: number;
  created_at?: string;
  updated_by?: string | null;
  updated_at?: string;
}

/** GM-authored material for the room (a custom sheet template, homebrew). */
export interface ContentRow {
  id: string;
  room_id: string;
  kind: string;
  key: string;
  data: Record<string, unknown>;
  rev: number;
}

/** One creature in the initiative order. Turn and round live in the room settings. */
export interface InitRow {
  id: string;
  room_id: string;
  character_id: string | null;
  item_id: string | null;
  name: string;
  init: number;
  tie: number;
  hidden: boolean;
  rev: number;
  created_by?: string | null;
  created_at?: string;
}

/** One field-level change to a character's data; a null value removes the key. */
export interface CharOp {
  path: (string | number)[];
  value: unknown;
}

export interface Snapshot {
  seq: number;
  room: RoomRow;
  members: MemberRow[];
  items: ItemRow[];
  assets: AssetRow[];
  rolls: RollRow[];
  characters: CharacterRow[];
  content: ContentRow[];
  initiative: InitRow[];
}

/** Events broadcast by database triggers (topics `db` and `gm`). */
export type DbEvent =
  | { kind: 'item'; scope: 'db' | 'gm'; op: 'up'; row: ItemRow; rev: number }
  | { kind: 'item'; scope: 'db' | 'gm'; op: 'del'; id: string; rev: number; reason?: 'hidden' }
  | { kind: 'member'; scope: 'db' | 'gm'; op: 'up'; row: MemberRow; rev: number }
  | { kind: 'member'; scope: 'db' | 'gm'; op: 'del'; user_id: string; rev: number }
  | { kind: 'asset'; scope: 'db' | 'gm'; op: 'up'; row: AssetRow; rev: number }
  | { kind: 'asset'; scope: 'db' | 'gm'; op: 'del'; file: string; assetKind: AssetRow['kind']; rev: number }
  | { kind: 'room'; scope: 'db' | 'gm'; op: 'up'; row: RoomRow; rev: number }
  | { kind: 'roll'; scope: 'db' | 'gm'; op: 'up'; row: RollRow; rev: number }
  | { kind: 'character'; scope: 'db' | 'gm'; op: 'up'; row: CharacterRow; rev: number }
  | { kind: 'character'; scope: 'db' | 'gm'; op: 'del'; id: string; rev: number; reason?: 'hidden' }
  | { kind: 'content'; scope: 'db' | 'gm'; op: 'up'; row: ContentRow; rev: number }
  | { kind: 'content'; scope: 'db' | 'gm'; op: 'del'; id: string; rev: number }
  | { kind: 'init'; scope: 'db' | 'gm'; op: 'up'; row: InitRow; rev: number }
  | { kind: 'init'; scope: 'db' | 'gm'; op: 'del'; id: string; rev: number; reason?: 'hidden' };

export interface PresenceInfo {
  user_id: string;
  name: string;
  color: string;
  role: Role;
}

/** Ephemeral messages on the `live` topic; never stored. */
export type LiveEvent =
  | { event: 'drag'; payload: { u: string; items: { id: string; x: number; y: number; rot?: number }[] } }
  | { event: 'ping'; payload: { u: string; x: number; y: number; color: string } }
  | { event: 'sel'; payload: { u: string; ids: string[] } };

/** Postgres error code raised when RLS refuses a write. */
export const FORBIDDEN = '42501';
