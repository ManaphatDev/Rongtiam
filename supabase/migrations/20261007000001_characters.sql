-- Phase 4: character sheets, GM-authored room content (custom templates, homebrew) and the initiative order.
-- Same conventions as the table: RLS is the permission boundary, BEFORE triggers stamp rev, AFTER triggers
-- broadcast on room:<id>:db (everyone) or room:<id>:gm (GMs only).

-- characters -------------------------------------------------------------------
-- `data` belongs to the ruleset (validated client-side by the ruleset module). Players own party characters;
-- GMs see and edit everything and keep secret NPCs (`visibility = 'gm'`), which only ever travel on the gm topic.
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  ruleset text not null check (ruleset ~ '^[a-z0-9-]{1,40}$'),
  visibility text not null default 'party' check (visibility in ('party', 'gm')),
  data jsonb not null default '{}'
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 256000),
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index characters_room_idx on public.characters (room_id);

-- room_content -----------------------------------------------------------------
-- GM-authored material the whole room uses: a custom sheet template, homebrew spells/feats/items...
create table public.room_content (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9-]{1,40}$'),
  key text not null check (char_length(key) between 1 and 120),
  data jsonb not null default '{}'
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 256000),
  rev bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (room_id, kind, key)
);

-- initiative_entries --------------------------------------------------------------
-- One row per creature in the order. The current turn and round live in rooms.settings.initiative.
create table public.initiative_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  character_id uuid references public.characters (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  init double precision not null default 0,
  -- Tie-breaker (e.g. Dexterity), then creation order.
  tie double precision not null default 0,
  hidden boolean not null default false,
  rev bigint not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index initiative_room_idx on public.initiative_entries (room_id);

-- Permissions ---------------------------------------------------------------------
alter table public.characters enable row level security;
alter table public.room_content enable row level security;
alter table public.initiative_entries enable row level security;

revoke all on public.characters, public.room_content, public.initiative_entries from anon, authenticated;
grant select, insert, delete on public.characters to authenticated;
grant update (data, visibility, owner_id) on public.characters to authenticated;
grant select, insert, update, delete on public.room_content to authenticated;
grant select, insert, delete on public.initiative_entries to authenticated;
grant update (name, init, tie, hidden, item_id) on public.initiative_entries to authenticated;

-- Does the caller own this (party) character?
create or replace function private.owns_character(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.characters ch
    where ch.id = c and ch.owner_id = (select auth.uid()) and ch.visibility = 'party'
  )
$$;
revoke all on function private.owns_character(uuid) from public, anon, authenticated;
grant execute on function private.owns_character(uuid) to authenticated;

create policy characters_select on public.characters for select to authenticated
  using ((select private.is_member(room_id)) and (visibility = 'party' or (select private.is_gm(room_id))));
create policy characters_insert on public.characters for insert to authenticated
  with check (
    (select private.is_member(room_id))
    and ((select private.is_gm(room_id)) or (owner_id = (select auth.uid()) and visibility = 'party'))
  );
create policy characters_update on public.characters for update to authenticated
  using ((select private.is_gm(room_id)) or (owner_id = (select auth.uid()) and visibility = 'party'))
  with check ((select private.is_gm(room_id)) or (owner_id = (select auth.uid()) and visibility = 'party'));
create policy characters_delete on public.characters for delete to authenticated
  using ((select private.is_gm(room_id)) or (owner_id = (select auth.uid()) and visibility = 'party'));

create policy content_select on public.room_content for select to authenticated
  using ((select private.is_member(room_id)));
create policy content_write on public.room_content for all to authenticated
  using ((select private.is_gm(room_id))) with check ((select private.is_gm(room_id)));

-- Players may put their own characters into the order (rolling from their sheet) and change those rows.
create policy initiative_select on public.initiative_entries for select to authenticated
  using ((select private.is_member(room_id)) and (not hidden or (select private.is_gm(room_id))));
create policy initiative_insert on public.initiative_entries for insert to authenticated
  with check (
    (select private.is_member(room_id))
    and ((select private.is_gm(room_id))
      or (not hidden and character_id is not null and (select private.owns_character(character_id))))
  );
create policy initiative_update on public.initiative_entries for update to authenticated
  using ((select private.is_gm(room_id))
    or (not hidden and character_id is not null and (select private.owns_character(character_id))))
  with check ((select private.is_gm(room_id))
    or (not hidden and character_id is not null and (select private.owns_character(character_id))));
create policy initiative_delete on public.initiative_entries for delete to authenticated
  using ((select private.is_gm(room_id))
    or (not hidden and character_id is not null and (select private.owns_character(character_id))));

-- Triggers: rev stamping and broadcast ----------------------------------------------
-- Players can't hand a character to someone else or make it secret: the update policy's check (own + party)
-- refuses it, and room_id/ruleset have no update grant at all.
create or replace function private.characters_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- A player's character always belongs to them; a GM may create one for anybody (or nobody: an NPC).
    if not private.is_gm(new.room_id) then
      new.owner_id := auth.uid();
    end if;
  end if;
  new.rev := private.tick(new.room_id);
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

create or replace function private.characters_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'DELETE' then
    seq := private.tick(old.room_id);
    perform private.emit(old.room_id, case when old.visibility = 'gm' then 'gm' else 'db' end, 'character',
      jsonb_build_object('op', 'del', 'id', old.id, 'rev', seq));
    return old;
  end if;
  if new.visibility = 'gm' then
    perform private.emit(new.room_id, 'gm', 'character', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
    if tg_op = 'UPDATE' and old.visibility <> 'gm' then
      perform private.emit(new.room_id, 'db', 'character',
        jsonb_build_object('op', 'del', 'id', new.id, 'rev', new.rev, 'reason', 'hidden'));
    end if;
  else
    perform private.emit(new.room_id, 'db', 'character', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  end if;
  return new;
end $$;

create trigger characters_before before insert or update on public.characters
  for each row execute function private.characters_before();
create trigger characters_after after insert or update or delete on public.characters
  for each row execute function private.characters_after();

create or replace function private.content_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.room_id <> old.room_id then
    raise exception 'immutable column' using errcode = '42501';
  end if;
  new.rev := private.tick(new.room_id);
  new.updated_at := now();
  return new;
end $$;

create or replace function private.content_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'DELETE' then
    seq := private.tick(old.room_id);
    perform private.emit(old.room_id, 'db', 'content', jsonb_build_object('op', 'del', 'id', old.id, 'rev', seq));
    return old;
  end if;
  perform private.emit(new.room_id, 'db', 'content', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  return new;
end $$;

create trigger content_before before insert or update on public.room_content
  for each row execute function private.content_before();
create trigger content_after after insert or update or delete on public.room_content
  for each row execute function private.content_after();

create or replace function private.initiative_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.room_id <> old.room_id or new.character_id is distinct from old.character_id then
    raise exception 'immutable column' using errcode = '42501';
  end if;
  new.rev := private.tick(new.room_id);
  return new;
end $$;

-- Hidden entries (a GM's ambush) are only sent to GMs, exactly like hidden items.
create or replace function private.initiative_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'DELETE' then
    seq := private.tick(old.room_id);
    perform private.emit(old.room_id, case when old.hidden then 'gm' else 'db' end, 'init',
      jsonb_build_object('op', 'del', 'id', old.id, 'rev', seq));
    return old;
  end if;
  if new.hidden then
    perform private.emit(new.room_id, 'gm', 'init', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
    if tg_op = 'UPDATE' and not old.hidden then
      perform private.emit(new.room_id, 'db', 'init',
        jsonb_build_object('op', 'del', 'id', new.id, 'rev', new.rev, 'reason', 'hidden'));
    end if;
  else
    perform private.emit(new.room_id, 'db', 'init', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  end if;
  return new;
end $$;

create trigger initiative_before before insert or update on public.initiative_entries
  for each row execute function private.initiative_before();
create trigger initiative_after after insert or update or delete on public.initiative_entries
  for each row execute function private.initiative_after();

-- character_patch ----------------------------------------------------------------
-- Field-level edits, so two people editing different parts of one sheet never overwrite each other.
-- Ops: [{"path": ["hp", "current"], "value": 7}, {"path": ["notes"], "value": null}]  (null removes the key).
-- Runs as the caller, so the update is subject to RLS exactly like a direct update.
create or replace function public.character_patch(p_id uuid, p_ops jsonb) returns public.characters
language plpgsql volatile security invoker set search_path = '' as $$
declare
  d jsonb;
  op jsonb;
  path text[];
  i int;
  r public.characters;
begin
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'bad ops' using errcode = '22023';
  end if;
  select c.data into d from public.characters c where c.id = p_id for update;
  if not found then
    raise exception 'forbidden_or_missing' using errcode = '42501';
  end if;
  for op in select value from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(op -> 'path') is distinct from 'array'
       or jsonb_array_length(op -> 'path') not between 1 and 12 then
      raise exception 'bad path' using errcode = '22023';
    end if;
    select array_agg(e #>> '{}' order by n) into path
      from jsonb_array_elements(op -> 'path') with ordinality as t(e, n);
    if op -> 'value' is null or jsonb_typeof(op -> 'value') = 'null' then
      d := d #- path;
    else
      -- Create missing parent objects so deep paths can be set in one go.
      for i in 1 .. array_length(path, 1) - 1 loop
        if jsonb_typeof(d #> path[1:i]) is distinct from 'object' and jsonb_typeof(d #> path[1:i]) is distinct from 'array' then
          d := jsonb_set(d, path[1:i], '{}'::jsonb, true);
        end if;
      end loop;
      d := jsonb_set(d, path, op -> 'value', true);
    end if;
  end loop;
  update public.characters c set data = d where c.id = p_id returning * into r;
  if not found then
    raise exception 'forbidden_or_missing' using errcode = '42501';
  end if;
  return r;
end $$;

-- room_snapshot: now also characters, content and the initiative order (each filtered by RLS) ----------
create or replace function public.room_snapshot(p_room uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'seq', (select c.seq from public.room_clock c where c.room_id = p_room),
    'room', (select to_jsonb(r) from public.rooms r where r.id = p_room),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.room_members m where m.room_id = p_room), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(i)) from public.items i where i.room_id = p_room), '[]'),
    'assets', coalesce((select jsonb_agg(to_jsonb(a)) from public.assets a where a.room_id = p_room), '[]'),
    'rolls', coalesce((
      select jsonb_agg(x.j order by x.created_at)
      from (select to_jsonb(l) j, l.created_at from public.roll_log l
            where l.room_id = p_room order by l.created_at desc limit 50) x), '[]'),
    'characters', coalesce((select jsonb_agg(to_jsonb(c)) from public.characters c where c.room_id = p_room), '[]'),
    'content', coalesce((select jsonb_agg(to_jsonb(k)) from public.room_content k where k.room_id = p_room), '[]'),
    'initiative', coalesce((select jsonb_agg(to_jsonb(e)) from public.initiative_entries e where e.room_id = p_room), '[]')
  )
$$;

revoke all on function public.character_patch(uuid, jsonb) from public, anon;
grant execute on function public.character_patch(uuid, jsonb) to authenticated;
