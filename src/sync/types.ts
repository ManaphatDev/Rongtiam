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

export interface Snapshot {
  seq: number;
  room: RoomRow;
  members: MemberRow[];
  items: ItemRow[];
  assets: AssetRow[];
  rolls: RollRow[];
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
  | { kind: 'roll'; scope: 'db' | 'gm'; op: 'up'; row: RollRow; rev: number };

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
