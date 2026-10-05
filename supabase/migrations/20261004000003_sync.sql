-- Revision stamping and realtime fan-out.
-- Writes go through RLS-checked SQL; AFTER triggers broadcast the committed rows with realtime.send.
-- Topics: room:<id>:db (members, read-only), room:<id>:gm (GMs only, read-only), room:<id>:live (members, read/write).

create or replace function private.tick(r uuid) returns bigint
language sql volatile security definer set search_path = '' as $$
  update public.room_clock set seq = seq + 1 where room_id = r returning seq
$$;

create or replace function private.emit(r uuid, scope text, event text, payload jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform realtime.send(payload, event, 'room:' || r::text || ':' || scope, true);
end $$;

revoke all on function private.tick(uuid), private.emit(uuid, text, text, jsonb) from public, anon, authenticated;

-- rooms ----------------------------------------------------------------------
create or replace function private.rooms_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.rev := private.tick(new.id);
  end if;
  return new;
end $$;

create or replace function private.rooms_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit(new.id, 'db', 'room', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  return new;
end $$;

create trigger rooms_before before update on public.rooms for each row execute function private.rooms_before();
create trigger rooms_after after update on public.rooms for each row execute function private.rooms_after();

-- room_members ---------------------------------------------------------------
-- Runs as the caller (not security definer): direct client updates run as `authenticated`,
-- while the trusted RPCs (claim_gm, request_join) run as the function owner and skip the check.
create or replace function private.members_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.room_id <> old.room_id or new.user_id <> old.user_id then
    raise exception 'immutable column' using errcode = '42501';
  end if;
  -- Non-GMs may only rename/recolour themselves.
  if current_user = 'authenticated' and not private.is_gm(old.room_id)
     and (new.role <> old.role or new.status <> old.status) then
    raise exception 'only a GM can change roles or membership' using errcode = '42501';
  end if;
  return new;
end $$;
grant execute on function private.members_guard() to authenticated;

create or replace function private.members_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    new.approved_at := now();
  end if;
  new.rev := private.tick(new.room_id);
  return new;
end $$;

create or replace function private.members_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'DELETE' then
    seq := private.tick(old.room_id);
    perform private.emit(old.room_id, case when old.status = 'approved' then 'db' else 'gm' end, 'member',
      jsonb_build_object('op', 'del', 'user_id', old.user_id, 'rev', seq));
    return old;
  end if;
  -- Pending requests only concern GMs; everything that involves an approved member goes to the whole room.
  if new.status in ('approved', 'banned') or (tg_op = 'UPDATE' and old.status = 'approved') then
    perform private.emit(new.room_id, 'db', 'member', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  else
    perform private.emit(new.room_id, 'gm', 'member', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  end if;
  return new;
end $$;

create trigger members_guard before update on public.room_members
  for each row execute function private.members_guard();
create trigger members_before before insert or update on public.room_members
  for each row execute function private.members_before();
create trigger members_after after insert or update or delete on public.room_members
  for each row execute function private.members_after();

-- items ----------------------------------------------------------------------
create or replace function private.items_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.room_id <> old.room_id or new.kind <> old.kind) then
    raise exception 'immutable column' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  new.rev := private.tick(new.room_id);
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

-- Hidden items are only ever sent on the GM topic, so players' clients never receive them.
create or replace function private.items_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'DELETE' then
    seq := private.tick(old.room_id);
    perform private.emit(old.room_id, case when old.hidden then 'gm' else 'db' end, 'item',
      jsonb_build_object('op', 'del', 'id', old.id, 'rev', seq));
    return old;
  end if;
  if new.hidden then
    perform private.emit(new.room_id, 'gm', 'item', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
    if tg_op = 'UPDATE' and not old.hidden then
      perform private.emit(new.room_id, 'db', 'item',
        jsonb_build_object('op', 'del', 'id', new.id, 'rev', new.rev, 'reason', 'hidden'));
    end if;
  else
    perform private.emit(new.room_id, 'db', 'item', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  end if;
  return new;
end $$;

create trigger items_before before insert or update on public.items
  for each row execute function private.items_before();
create trigger items_after after insert or update or delete on public.items
  for each row execute function private.items_after();

-- assets ---------------------------------------------------------------------
create or replace function private.assets_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.rev := private.tick(new.room_id);
  return new;
end $$;

create or replace function private.assets_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  seq bigint;
begin
  if tg_op = 'DELETE' then
    seq := private.tick(old.room_id);
    perform private.emit(old.room_id, 'db', 'asset',
      jsonb_build_object('op', 'del', 'file', old.file, 'kind', old.kind, 'rev', seq));
    return old;
  end if;
  perform private.emit(new.room_id, 'db', 'asset', jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  return new;
end $$;

create trigger assets_before before insert on public.assets
  for each row execute function private.assets_before();
create trigger assets_after after insert or delete on public.assets
  for each row execute function private.assets_after();

-- roll_log -------------------------------------------------------------------
create or replace function private.rolls_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.rev := private.tick(new.room_id);
  return new;
end $$;

create or replace function private.rolls_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit(new.room_id, case when new.visibility = 'gm' then 'gm' else 'db' end, 'roll',
    jsonb_build_object('op', 'up', 'row', to_jsonb(new), 'rev', new.rev));
  -- Keep the newest 500 rolls per room.
  delete from public.roll_log
  where id in (
    select id from public.roll_log where room_id = new.room_id order by created_at desc offset 500
  );
  return new;
end $$;

create trigger rolls_before before insert on public.roll_log
  for each row execute function private.rolls_before();
create trigger rolls_after after insert on public.roll_log
  for each row execute function private.rolls_after();

-- Realtime authorization (private channels) ----------------------------------
create policy room_topics_read on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (
      (split_part((select realtime.topic()), ':', 3) in ('db', 'live')
        and (select private.is_member(private.topic_room((select realtime.topic())))))
      or (split_part((select realtime.topic()), ':', 3) = 'gm'
        and (select private.is_gm(private.topic_room((select realtime.topic())))))
    )
  );

create policy room_live_write on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 3) = 'live'
    and (select private.is_member(private.topic_room((select realtime.topic()))))
  );
