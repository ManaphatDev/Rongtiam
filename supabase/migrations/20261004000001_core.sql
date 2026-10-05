-- Core tables for rooms, membership, table items, uploaded assets and the shared roll log.
-- Every write bumps the room's revision counter (room_clock.seq) so clients can order events.

create schema if not exists private;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 60),
  ruleset_id text not null default 'none' check (char_length(ruleset_id) <= 40),
  settings jsonb not null default '{"grid":{"on":false,"size":70},"snap":true}'
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) < 20000),
  rev bigint not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Only security-definer functions ever touch this table.
create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  gm_key_hash text not null
);

create table public.room_clock (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  seq bigint not null default 0
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'player' check (role in ('gm', 'player')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'banned')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.items (
  id uuid primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  kind text not null check (kind in ('map', 'char', 'sticker', 'fog')),
  z double precision not null default 0,
  locked boolean not null default false,
  hidden boolean not null default false,
  props jsonb not null default '{}'
    check (jsonb_typeof(props) = 'object' and octet_length(props::text) < 200000),
  meta jsonb not null default '{}'
    check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) < 20000),
  rev bigint not null default 0,
  created_by uuid,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index items_room_idx on public.items (room_id);

-- One row per uploaded image per use. `file` is the object name inside the room folder.
create table public.assets (
  room_id uuid not null references public.rooms (id) on delete cascade,
  file text not null check (file ~ '^[0-9a-f]{64}\.(webp|jpg|png)$'),
  kind text not null check (kind in ('map', 'token', 'sticker')),
  w int not null check (w between 1 and 10000),
  h int not null check (h between 1 and 10000),
  rev bigint not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (room_id, file, kind)
);

create table public.roll_log (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  label text not null check (char_length(label) <= 120),
  spec jsonb not null default '{}' check (octet_length(spec::text) < 20000),
  result jsonb not null check (octet_length(result::text) < 60000),
  visibility text not null default 'all' check (visibility in ('all', 'gm')),
  rev bigint not null default 0,
  created_at timestamptz not null default now()
);
create index roll_log_room_idx on public.roll_log (room_id, created_at desc);
