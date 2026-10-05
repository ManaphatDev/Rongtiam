-- Room lifecycle RPCs (security definer, validate everything themselves) and the
-- table-ops/snapshot RPCs (security invoker, so RLS applies exactly as for direct queries).

create or replace function private.new_gm_key() returns text
language sql volatile security definer set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')
$$;

create or replace function private.hash_key(k text) returns text
language sql immutable security definer set search_path = '' as $$
  select encode(extensions.digest(k, 'sha256'), 'hex')
$$;

revoke all on function private.new_gm_key(), private.hash_key(text) from public, anon, authenticated;

create or replace function private.check_profile(p_name text, p_color text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid color' using errcode = '22023';
  end if;
end $$;

-- Creates a room with the caller as GM. Returns the GM key once; only its hash is stored.
create or replace function public.create_room(p_name text, p_display_name text, p_color text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  s text;
  b bytea;
  k text;
  alphabet constant text := '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'invalid room name' using errcode = '22023';
  end if;
  perform private.check_profile(p_display_name, p_color);
  if (select count(*) from public.rooms where created_by = uid) >= 20 then
    raise exception 'room limit reached' using errcode = 'P0001';
  end if;

  loop
    b := extensions.gen_random_bytes(10);
    s := '';
    for i in 0..9 loop
      s := s || substr(alphabet, (get_byte(b, i) % 58) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where slug = s);
  end loop;

  k := private.new_gm_key();
  insert into public.rooms (slug, name, created_by) values (s, btrim(p_name), uid) returning id into rid;
  insert into public.room_secrets (room_id, gm_key_hash) values (rid, private.hash_key(k));
  insert into public.room_clock (room_id) values (rid);
  insert into public.room_members (room_id, user_id, role, status, display_name, color, approved_at)
    values (rid, uid, 'gm', 'approved', btrim(p_display_name), p_color, now());
  return jsonb_build_object('room_id', rid, 'slug', s, 'gm_key', k);
end $$;

-- What a visitor needs before joining: the room's id/name and their own membership (if any).
create or replace function public.room_public_info(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'room_id', r.id,
    'name', r.name,
    'status', m.status,
    'role', m.role
  )
  from public.rooms r
  left join public.room_members m on m.room_id = r.id and m.user_id = (select auth.uid())
  where r.slug = p_slug
$$;

-- Ask to join. Approved members just get their status back; banned users are refused.
create or replace function public.request_join(p_slug text, p_display_name text, p_color text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  st text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.check_profile(p_display_name, p_color);
  select id into rid from public.rooms where slug = p_slug;
  if rid is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  select status into st from public.room_members where room_id = rid and user_id = uid;
  if st = 'banned' then
    raise exception 'banned' using errcode = '42501';
  elsif st = 'approved' then
    return st;
  end if;
  if st is null and (select count(*) from public.room_members where room_id = rid and status = 'pending') >= 30 then
    raise exception 'too many pending requests' using errcode = 'P0001';
  end if;
  insert into public.room_members (room_id, user_id, role, status, display_name, color)
    values (rid, uid, 'player', 'pending', btrim(p_display_name), p_color)
    on conflict (room_id, user_id) do update
      set display_name = excluded.display_name, color = excluded.color;
  return 'pending';
end $$;

-- Become a GM of the room with the secret GM key (e.g. from another device).
create or replace function public.claim_gm(p_slug text, p_key text, p_display_name text, p_color text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.check_profile(p_display_name, p_color);
  select r.id into rid
  from public.rooms r join public.room_secrets s on s.room_id = r.id
  where r.slug = p_slug and s.gm_key_hash = private.hash_key(coalesce(p_key, ''));
  if rid is null then
    raise exception 'invalid gm key' using errcode = '42501';
  end if;
  insert into public.room_members (room_id, user_id, role, status, display_name, color, approved_at)
    values (rid, uid, 'gm', 'approved', btrim(p_display_name), p_color, now())
    on conflict (room_id, user_id) do update set role = 'gm', status = 'approved';
  return rid;
end $$;

create or replace function public.rotate_gm_key(p_room uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  k text := private.new_gm_key();
begin
  if not private.is_gm(p_room) then
    raise exception 'gm only' using errcode = '42501';
  end if;
  update public.room_secrets set gm_key_hash = private.hash_key(k) where room_id = p_room;
  return k;
end $$;

-- Apply a batch of item ops atomically. Runs as the caller, so RLS decides what is allowed.
-- Ops: {t:'add', item:{id,kind,z,locked,hidden,props,meta}}
--      {t:'patch', id, props?, meta?, z?, locked?, hidden?}  (props merge; a null value removes the key;
--                                                           meta merges one level deep per namespace)
--      {t:'del', id}
create or replace function public.apply_ops(p_room uuid, p_ops jsonb) returns setof public.items
language plpgsql volatile security invoker set search_path = '' as $$
declare
  op jsonb;
  r public.items;
  n int;
begin
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'bad ops' using errcode = '22023';
  end if;
  for op in select value from jsonb_array_elements(p_ops) loop
    case op ->> 't'
      when 'add' then
        insert into public.items (id, room_id, kind, z, locked, hidden, props, meta)
        values (
          (op -> 'item' ->> 'id')::uuid,
          p_room,
          op -> 'item' ->> 'kind',
          coalesce((op -> 'item' ->> 'z')::float8, 0),
          coalesce((op -> 'item' ->> 'locked')::boolean, false),
          coalesce((op -> 'item' ->> 'hidden')::boolean, false),
          jsonb_strip_nulls(coalesce(op -> 'item' -> 'props', '{}')),
          coalesce(op -> 'item' -> 'meta', '{}')
        )
        returning * into r;
        return next r;
      when 'patch' then
        update public.items i set
          props = case when op ? 'props' then jsonb_strip_nulls(i.props || (op -> 'props')) else i.props end,
          meta = case when op ? 'meta' then i.meta || coalesce((
            select jsonb_object_agg(e.key,
              case when jsonb_typeof(e.value) = 'object' and jsonb_typeof(i.meta -> e.key) = 'object'
                then (i.meta -> e.key) || e.value else e.value end)
            from jsonb_each(op -> 'meta') e), '{}') else i.meta end,
          z = coalesce((op ->> 'z')::float8, i.z),
          locked = coalesce((op ->> 'locked')::boolean, i.locked),
          hidden = coalesce((op ->> 'hidden')::boolean, i.hidden)
        where i.id = (op ->> 'id')::uuid and i.room_id = p_room
        returning * into r;
        get diagnostics n = row_count;
        if n = 0 then
          raise exception 'forbidden_or_missing' using errcode = '42501';
        end if;
        return next r;
      when 'del' then
        -- Deleting something already gone (or not deletable) is a no-op; only rows actually deleted are returned.
        delete from public.items i where i.id = (op ->> 'id')::uuid and i.room_id = p_room
        returning * into r;
        if found then
          return next r;
        end if;
      else
        raise exception 'bad op' using errcode = '22023';
    end case;
  end loop;
end $$;

-- Everything a member may see, read in one statement (one consistent snapshot).
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
            where l.room_id = p_room order by l.created_at desc limit 50) x), '[]')
  )
$$;

revoke all on function
  public.create_room(text, text, text), public.room_public_info(text), public.request_join(text, text, text),
  public.claim_gm(text, text, text, text), public.rotate_gm_key(uuid), public.apply_ops(uuid, jsonb),
  public.room_snapshot(uuid), private.check_profile(text, text)
  from public, anon;
grant execute on function
  public.create_room(text, text, text), public.room_public_info(text), public.request_join(text, text, text),
  public.claim_gm(text, text, text, text), public.rotate_gm_key(uuid), public.apply_ops(uuid, jsonb),
  public.room_snapshot(uuid), private.check_profile(text, text)
  to authenticated;
