-- Phase 5b: a D&D 2024 character's level is the GM's call. A player creates characters at most at the room's start
-- level (rooms.settings.startLevel, default 1), levels up one step at a time only up to data.levelAllowed, and can
-- never change levelAllowed. GMs, other rulesets and trusted RPCs (current_user <> 'authenticated') pass.

-- A jsonb number as an int, or the fallback for anything else (missing, null, text, out of int range...).
create or replace function private.json_int(v jsonb, fallback int) returns int
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between -2147483648 and 2147483647
    then floor((v #>> '{}')::numeric)::int else fallback end
$$;
grant execute on function private.json_int(jsonb, int) to authenticated;

-- Security invoker, like members_guard: current_user tells a player's own write from a trusted RPC.
create or replace function private.characters_level_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  lv_old int;
  lv_new int;
  allowed int;
  start_level int;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- Who is exempt is decided from the row as it was (OLD) on update, so a write cannot move itself out of the gate.
  if tg_op = 'UPDATE' then
    if old.ruleset <> 'dnd2024' or private.is_gm(old.room_id) then
      return new;
    end if;
    if new.ruleset is distinct from old.ruleset or new.room_id is distinct from old.room_id then
      raise exception 'ruleset and room cannot change' using errcode = '42501';
    end if;
  elsif new.ruleset <> 'dnd2024' or private.is_gm(new.room_id) then
    return new;
  end if;
  lv_new := private.json_int(new.data -> 'level', 1);

  if tg_op = 'INSERT' then
    select private.json_int(r.settings -> 'startLevel', 1) into start_level from public.rooms r where r.id = new.room_id;
    start_level := coalesce(start_level, 1);
    if lv_new > start_level or private.json_int(new.data -> 'levelAllowed', 1) > start_level then
      raise exception 'level above the room start level' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.data -> 'levelAllowed') is distinct from (old.data -> 'levelAllowed') then
    raise exception 'only a GM can allow levels' using errcode = '42501';
  end if;
  lv_old := private.json_int(old.data -> 'level', 1);
  allowed := private.json_int(old.data -> 'levelAllowed', lv_old);
  if lv_new <> lv_old and (lv_new <> lv_old + 1 or lv_new > allowed) then
    raise exception 'level change not allowed' using errcode = '42501';
  end if;
  return new;
end $$;
grant execute on function private.characters_level_guard() to authenticated;

create trigger characters_level_guard before insert or update on public.characters
  for each row execute function private.characters_level_guard();
