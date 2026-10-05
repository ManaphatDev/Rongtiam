import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, errCode, messages, newUser, type Db } from './harness';

let db: Db;
let gmId: string, playerId: string, outsiderId: string;
let room: string, slug: string, gmKey: string;

const char = (id: string, extra: Record<string, unknown> = {}) =>
  ({ t: 'add', item: { id, kind: 'char', z: 1, props: { x: 0, y: 0, size: 60, name: 'Hero' }, ...extra } });

beforeAll(async () => {
  db = await createDb();
  gmId = await newUser(db);
  playerId = await newUser(db);
  outsiderId = await newUser(db);
  const created = await as(db, gmId).rpc<{ room_id: string; slug: string; gm_key: string }>(
    'create_room', ['ห้องทดสอบ', 'GM', '#e5484d']);
  room = created.room_id;
  slug = created.slug;
  gmKey = created.gm_key;
}, 60_000);

describe('rooms and joining', () => {
  it('create_room makes the caller an approved GM and never stores the raw key', async () => {
    expect(slug).toMatch(/^[1-9A-HJ-NP-Za-km-z]{10}$/);
    expect(gmKey.length).toBeGreaterThanOrEqual(32);
    const info = await as(db, gmId).rpc<{ status: string; role: string }>('room_public_info', [slug]);
    expect(info).toMatchObject({ status: 'approved', role: 'gm' });
    const stored = await db.query<{ gm_key_hash: string }>('select gm_key_hash from public.room_secrets');
    expect(stored.rows[0].gm_key_hash).not.toBe(gmKey);
  });

  it('pending users see nothing until approved', async () => {
    const p = as(db, playerId);
    expect(await p.rpc('request_join', [slug, 'Player', '#46a758'])).toBe('pending');
    expect(await p.query('select * from public.rooms')).toHaveLength(0);
    expect(await p.query('select * from public.items')).toHaveLength(0);
    const snap = await p.rpc<{ room: unknown; items: unknown[] }>('room_snapshot', [room]);
    expect(snap.room).toBeNull();
    expect(snap.items).toEqual([]);
  });

  it('a pending user cannot approve themselves', async () => {
    const code = await errCode(as(db, playerId).query(
      `update public.room_members set status = 'approved' where user_id = $1`, [playerId]));
    expect(code).toBe('42501');
  });

  it('the GM approves, and the join request was only announced on the GM topic', async () => {
    const msgs = await messages(db);
    const req = msgs.filter((m) => m.event === 'member' && (m.payload.row as { user_id?: string })?.user_id === playerId);
    expect(req.length).toBeGreaterThan(0);
    expect(req.every((m) => m.topic === `room:${room}:gm`)).toBe(true);

    await as(db, gmId).query(`update public.room_members set status = 'approved' where user_id = $1`, [playerId]);
    const info = await as(db, playerId).rpc<{ status: string }>('room_public_info', [slug]);
    expect(info.status).toBe('approved');
  });

  it('a wrong GM key is refused; the right one grants GM', async () => {
    const o = as(db, outsiderId);
    expect(await errCode(o.rpc('claim_gm', [slug, 'nope', 'X', '#111111']))).toBe('42501');
    expect(await o.rpc('claim_gm', [slug, gmKey, 'GM2', '#111111'])).toBe(room);
    const info = await o.rpc<{ role: string }>('room_public_info', [slug]);
    expect(info.role).toBe('gm');
  });

  it('only GMs can rotate the key', async () => {
    expect(await errCode(as(db, playerId).rpc('rotate_gm_key', [room]))).toBe('42501');
  });
});

describe('items', () => {
  const ids = {
    map: crypto.randomUUID(),
    char: crypto.randomUUID(),
    locked: crypto.randomUUID(),
    hidden: crypto.randomUUID(),
  };

  it('players cannot add maps or fog', async () => {
    const p = as(db, playerId);
    expect(await errCode(p.ops(room, [{ t: 'add', item: { id: crypto.randomUUID(), kind: 'map', z: 0, props: {} } }]))).toBe('42501');
    expect(await errCode(p.ops(room, [{ t: 'add', item: { id: crypto.randomUUID(), kind: 'fog', z: 0, props: {} } }]))).toBe('42501');
  });

  it('players can add and move characters, but not lock or hide them', async () => {
    const p = as(db, playerId);
    const [added] = await p.ops(room, [char(ids.char)]);
    expect(added).toMatchObject({ id: ids.char, created_by: playerId });
    const [moved] = await p.ops(room, [{ t: 'patch', id: ids.char, props: { x: 50 } }]);
    expect((moved as { props: { x: number; name: string } }).props).toMatchObject({ x: 50, name: 'Hero' });
    expect(await errCode(p.ops(room, [{ t: 'patch', id: ids.char, locked: true }]))).toBe('42501');
    expect(await errCode(p.ops(room, [{ t: 'patch', id: ids.char, hidden: true }]))).toBe('42501');
    expect(await errCode(p.ops(room, [char(crypto.randomUUID(), { locked: true })]))).toBe('42501');
  });

  it('a null in a patch removes the key, and meta merges per namespace', async () => {
    const g = as(db, gmId);
    await g.ops(room, [{ t: 'patch', id: ids.char, meta: { core: { hp: 7, max: 10 } } }]);
    const [r] = await g.ops(room, [{ t: 'patch', id: ids.char, props: { name: null }, meta: { core: { hp: 3 } } }]);
    const row = r as { props: Record<string, unknown>; meta: { core: Record<string, number> } };
    expect('name' in row.props).toBe(false);
    expect(row.meta.core).toEqual({ hp: 3, max: 10 });
  });

  it('kind cannot be changed', async () => {
    const code = await errCode(as(db, gmId).query(`update public.items set kind = 'map' where id = $1`, [ids.char]));
    expect(code).toBe('42501');
  });

  it('GM-locked items are off limits to players', async () => {
    const g = as(db, gmId);
    await g.ops(room, [char(ids.locked, { locked: true }), { t: 'add', item: { id: ids.map, kind: 'map', z: 0, props: { x: 0, y: 0, size: 500 } } }]);
    const p = as(db, playerId);
    expect(await errCode(p.ops(room, [{ t: 'patch', id: ids.locked, props: { x: 9 } }]))).toBe('42501');
    expect(await errCode(p.ops(room, [{ t: 'patch', id: ids.map, props: { x: 9 } }]))).toBe('42501');
    // A refused delete is a no-op that returns no row.
    expect(await p.ops(room, [{ t: 'del', id: ids.locked }])).toEqual([]);
    expect(await g.query('select id from public.items where id = $1', [ids.locked])).toHaveLength(1);
  });

  it('a failing op rolls back the whole batch', async () => {
    const p = as(db, playerId);
    const fresh = crypto.randomUUID();
    expect(await errCode(p.ops(room, [char(fresh), { t: 'patch', id: ids.locked, props: { x: 1 } }]))).toBe('42501');
    expect(await as(db, gmId).query('select id from public.items where id = $1', [fresh])).toHaveLength(0);
  });

  it('hidden items never reach players: not in queries, snapshots, or the shared topic', async () => {
    const before = (await messages(db)).at(-1)?.id ?? 0;
    const g = as(db, gmId);
    await g.ops(room, [{ t: 'add', item: { id: ids.hidden, kind: 'sticker', z: 5, hidden: true, props: { x: 1, y: 1, size: 40, emoji: '💀' } } }]);
    await g.ops(room, [{ t: 'patch', id: ids.hidden, props: { x: 2 } }]);
    const p = as(db, playerId);
    expect(await p.query('select id from public.items where id = $1', [ids.hidden])).toHaveLength(0);
    const snap = await p.rpc<{ items: { id: string }[] }>('room_snapshot', [room]);
    expect(snap.items.map((i) => i.id)).not.toContain(ids.hidden);
    const leaked = (await messages(db, before)).filter((m) => m.topic !== `room:${room}:gm` && JSON.stringify(m.payload).includes(ids.hidden));
    expect(leaked).toEqual([]);

    // Hiding a visible item tells players it is gone; unhiding sends it on the shared topic again.
    const mark = (await messages(db)).at(-1)!.id;
    await g.ops(room, [{ t: 'patch', id: ids.char, hidden: true }]);
    await g.ops(room, [{ t: 'patch', id: ids.char, hidden: false }]);
    const seen = (await messages(db, mark)).filter((m) => m.topic === `room:${room}:db` && m.event === 'item');
    expect(seen.map((m) => [m.payload.op, m.payload.reason ?? null])).toEqual([['del', 'hidden'], ['up', null]]);
  });

  it('every write gets a strictly increasing rev', async () => {
    const msgs = (await messages(db)).filter((m) => m.topic.startsWith(`room:${room}`));
    const revs = msgs.map((m) => m.payload.rev as number);
    for (let i = 1; i < revs.length; i++) expect(revs[i]).toBeGreaterThanOrEqual(revs[i - 1]);
    const snap = await as(db, gmId).rpc<{ seq: number }>('room_snapshot', [room]);
    expect(snap.seq).toBe(Math.max(...revs));
  });

  it('players cannot change room settings (the update silently matches nothing)', async () => {
    await as(db, playerId).query(`update public.rooms set settings = '{"grid":{"on":true,"size":5},"snap":false}' where id = $1`, [room]);
    const [r] = await as(db, gmId).query<{ settings: { snap: boolean } }>('select settings from public.rooms where id = $1', [room]);
    expect(r.settings.snap).toBe(true);
  });
});

describe('rolls', () => {
  it('only GMs make GM-only rolls, and players cannot read them', async () => {
    const roll = (vis: string) => [`insert into public.roll_log (room_id, user_id, label, result, visibility) values ($1, $2, 'd20', '{"total":20,"dice":[],"breakdown":"20"}', $3)`, [room, playerId, vis]] as const;
    expect(await errCode(as(db, playerId).query(...roll('gm')))).toBe('42501');
    await as(db, playerId).query(...roll('all'));
    await as(db, gmId).query(roll('gm')[0], [room, gmId, 'gm']);
    const seen = await as(db, playerId).query<{ visibility: string; user_id: string }>('select visibility, user_id from public.roll_log');
    expect(seen.map((r) => r.visibility)).toEqual(['all']);
    // user_id is stamped by the server, not trusted from the client.
    const [gmRoll] = await as(db, gmId).query<{ user_id: string }>(`select user_id from public.roll_log where visibility = 'gm'`);
    expect(gmRoll.user_id).toBe(gmId);
  });
});

describe('realtime and storage authorization', () => {
  async function canRead(uid: string, scope: string) {
    const topic = `room:${room}:${scope}`;
    await db.query(`insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'probe', '{}')`, [topic]);
    const rows = await as(db, uid, topic).query('select 1 from realtime.messages where topic = $1', [topic]);
    return rows.length > 0;
  }
  async function canWrite(uid: string, scope: string) {
    const topic = `room:${room}:${scope}`;
    const code = await errCode(as(db, uid, topic).query(
      `insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'x', '{}')`, [topic]));
    return code === undefined;
  }

  it('members read db/live, only GMs read gm, and only live is writable', async () => {
    expect(await canRead(playerId, 'db')).toBe(true);
    expect(await canRead(playerId, 'live')).toBe(true);
    expect(await canRead(playerId, 'gm')).toBe(false);
    expect(await canRead(gmId, 'gm')).toBe(true);
    expect(await canWrite(playerId, 'live')).toBe(true);
    expect(await canWrite(playerId, 'db')).toBe(false);
    expect(await canWrite(gmId, 'gm')).toBe(false);
  });

  it('non-members get nothing', async () => {
    const stranger = await newUser(db);
    expect(await canRead(stranger, 'db')).toBe(false);
    expect(await canWrite(stranger, 'live')).toBe(false);
  });

  it('members may upload into their room folder only', async () => {
    const name = `${room}/${'a'.repeat(64)}.webp`;
    await as(db, playerId).query(`insert into storage.objects (bucket_id, name) values ('room-assets', $1)`, [name]);
    const stranger = await newUser(db);
    expect(await errCode(as(db, stranger).query(`insert into storage.objects (bucket_id, name) values ('room-assets', $1)`, [`${room}/${'b'.repeat(64)}.webp`]))).toBe('42501');
    expect(await errCode(as(db, playerId).query(`insert into storage.objects (bucket_id, name) values ('room-assets', $1)`, [`${room}/../x.webp`]))).toBe('42501');
    expect(await as(db, stranger).query(`select 1 from storage.objects where name = $1`, [name])).toHaveLength(0);
  });
});

describe('kick', () => {
  it('a kicked player can no longer write', async () => {
    await as(db, gmId).query('delete from public.room_members where user_id = $1 and room_id = $2', [playerId, room]);
    expect(await errCode(as(db, playerId).ops(room, [char(crypto.randomUUID())]))).toBe('42501');
  });

  it('a banned player cannot ask to join again', async () => {
    const p = as(db, playerId);
    await p.rpc('request_join', [slug, 'Player', '#46a758']);
    await as(db, gmId).query(`update public.room_members set status = 'banned' where user_id = $1`, [playerId]);
    expect(await errCode(p.rpc('request_join', [slug, 'Player', '#46a758']))).toBe('42501');
  });
});
