-- Permission helpers and row-level security. These policies are the real permission boundary:
-- the client UI only mirrors them.

create or replace function private.try_uuid(t text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

create or replace function private.is_member(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = r and m.user_id = (select auth.uid()) and m.status = 'approved'
  )
$$;

create or replace function private.is_gm(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = r and m.user_id = (select auth.uid()) and m.status = 'approved' and m.role = 'gm'
  )
$$;

-- 'room:<uuid>:<scope>' -> uuid, or null for anything else (never raises).
create or replace function private.topic_room(t text) returns uuid
language sql immutable set search_path = '' as $$
  select case when t ~ '^room:[0-9a-f-]{36}:(db|gm|live)$' then private.try_uuid(split_part(t, ':', 2)) end
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.try_uuid(text), private.is_member(uuid), private.is_gm(uuid), private.topic_room(text)
  to authenticated;

alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_clock enable row level security;
alter table public.room_members enable row level security;
alter table public.items enable row level security;
alter table public.assets enable row level security;
alter table public.roll_log enable row level security;

-- Clients never insert/delete rooms directly (create_room RPC does), and may only update these columns.
-- Table privileges are granted explicitly (never relying on project defaults); RLS then filters rows.
revoke all on public.rooms, public.room_secrets, public.room_clock, public.room_members,
  public.items, public.assets, public.roll_log from anon, authenticated;
grant select on public.rooms, public.room_clock to authenticated;
grant update (name, settings, ruleset_id) on public.rooms to authenticated;
grant select, delete on public.room_members to authenticated;
grant update (role, status, display_name, color) on public.room_members to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, delete on public.assets to authenticated;
grant select, insert, delete on public.roll_log to authenticated;

-- rooms
create policy rooms_select on public.rooms for select to authenticated
  using ((select private.is_member(id)));
create policy rooms_update on public.rooms for update to authenticated
  using ((select private.is_gm(id))) with check ((select private.is_gm(id)));

-- room_clock
create policy room_clock_select on public.room_clock for select to authenticated
  using ((select private.is_member(room_id)));

-- room_members (rows are inserted only by request_join / create_room / claim_gm)
create policy members_select on public.room_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_member(room_id)));
create policy members_update on public.room_members for update to authenticated
  using ((select private.is_gm(room_id)) or user_id = (select auth.uid()))
  with check ((select private.is_gm(room_id)) or user_id = (select auth.uid()));
create policy members_delete on public.room_members for delete to authenticated
  using ((select private.is_gm(room_id)) or user_id = (select auth.uid()));

-- items: maps, fog, locking and hiding are GM-only; players may add/move/delete unlocked, visible chars and stickers.
create policy items_select on public.items for select to authenticated
  using ((select private.is_member(room_id)) and (not hidden or (select private.is_gm(room_id))));
create policy items_insert on public.items for insert to authenticated
  with check (
    (select private.is_member(room_id))
    and ((select private.is_gm(room_id)) or (kind in ('char', 'sticker') and not locked and not hidden))
  );
create policy items_update on public.items for update to authenticated
  using (
    (select private.is_member(room_id))
    and ((select private.is_gm(room_id)) or (kind in ('char', 'sticker') and not locked and not hidden))
  )
  with check (
    (select private.is_member(room_id))
    and ((select private.is_gm(room_id)) or (kind in ('char', 'sticker') and not locked and not hidden))
  );
create policy items_delete on public.items for delete to authenticated
  using (
    (select private.is_member(room_id))
    and ((select private.is_gm(room_id)) or (kind in ('char', 'sticker') and not locked and not hidden))
  );

-- assets: any member uploads; the uploader or a GM removes.
create policy assets_select on public.assets for select to authenticated
  using ((select private.is_member(room_id)));
create policy assets_insert on public.assets for insert to authenticated
  with check ((select private.is_member(room_id)));
create policy assets_delete on public.assets for delete to authenticated
  using ((select private.is_gm(room_id)) or created_by = (select auth.uid()));

-- roll_log: GM-only rolls are visible to GMs (and their roller); only GMs may make them.
create policy rolls_select on public.roll_log for select to authenticated
  using (
    (select private.is_member(room_id))
    and (visibility = 'all' or user_id = (select auth.uid()) or (select private.is_gm(room_id)))
  );
create policy rolls_insert on public.roll_log for insert to authenticated
  with check (
    (select private.is_member(room_id))
    and (visibility = 'all' or (select private.is_gm(room_id)))
  );
create policy rolls_delete on public.roll_log for delete to authenticated
  using ((select private.is_gm(room_id)));
