import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, errCode, messages, newUser, type Db } from './harness';

let db: Db;
let gm: string, alice: string, bob: string, outsider: string;
let room: string;

type Char = { id: string; owner_id: string | null; visibility: string; data: Record<string, unknown> };

const insertChar = (uid: string, fields: Record<string, unknown> = {}) =>
  as(db, uid).query<Char>(
    `insert into public.characters (room_id, ruleset, visibility, owner_id, data)
     values ($1, $2, $3, $4, $5::jsonb) returning *`,
    [room, fields.ruleset ?? 'dnd2024', fields.visibility ?? 'party', fields.owner_id ?? null, JSON.stringify(fields.data ?? { name: 'Hero' })],
  ).then((r) => r[0]);
const patch = (uid: string, id: string, ops: unknown[]) =>
  as(db, uid).query<Char>('select * from public.character_patch($1, $2::jsonb)', [id, JSON.stringify(ops)]).then((r) => r[0]);

beforeAll(async () => {
  db = await createDb();
  [gm, alice, bob, outsider] = [await newUser(db), await newUser(db), await newUser(db), await newUser(db)];
  const created = await as(db, gm).rpc<{ room_id: string; slug: string }>('create_room', ['ห้องตัวละคร', 'GM', '#e5484d']);
  room = created.room_id;
  for (const [u, n] of [[alice, 'Alice'], [bob, 'Bob']]) {
    await as(db, u).rpc('request_join', [created.slug, n, '#46a758']);
    await as(db, gm).query(`update public.room_members set status = 'approved' where user_id = $1`, [u]);
  }
}, 60_000);

describe('characters', () => {
  let aliceChar: Char;

  it('a player creates their own party character, whatever owner they claim', async () => {
    aliceChar = await insertChar(alice, { owner_id: bob });
    expect(aliceChar).toMatchObject({ owner_id: alice, visibility: 'party' });
    expect(await errCode(insertChar(alice, { visibility: 'gm' }))).toBe('42501');
    expect(await errCode(insertChar(outsider))).toBe('42501');
  });

  it('other players can read it but not change or delete it', async () => {
    const b = as(db, bob);
    expect(await b.query('select id from public.characters where id = $1', [aliceChar.id])).toHaveLength(1);
    expect(await errCode(patch(bob, aliceChar.id, [{ path: ['name'], value: 'Mine' }]))).toBe('42501');
    expect(await b.query('delete from public.characters where id = $1 returning id', [aliceChar.id])).toHaveLength(0);
    expect(await as(db, outsider).query('select id from public.characters')).toHaveLength(0);
  });

  it('patches touch only their path: deep paths are created, null removes, other fields survive', async () => {
    await patch(alice, aliceChar.id, [{ path: ['hp', 'current'], value: 7 }, { path: ['abilities', 'str'], value: 15 }]);
    // A second editor (the GM) changes another field in the meantime.
    await patch(gm, aliceChar.id, [{ path: ['hp', 'max'], value: 12 }]);
    const r = await patch(alice, aliceChar.id, [{ path: ['notes'], value: 'brave' }, { path: ['abilities'], value: null }]);
    expect(r.data).toEqual({ name: 'Hero', hp: { current: 7, max: 12 }, notes: 'brave' });
  });

  it('patch validates its input', async () => {
    expect(await errCode(patch(alice, aliceChar.id, [{ path: [], value: 1 }]))).toBe('22023');
    expect(await errCode(patch(alice, aliceChar.id, [{ value: 1 }]))).toBe('22023');
    expect(await errCode(patch(alice, crypto.randomUUID(), [{ path: ['x'], value: 1 }]))).toBe('42501');
  });

  it('only a GM changes owner or visibility; nobody changes room or ruleset', async () => {
    const a = as(db, alice);
    expect(await errCode(a.query(`update public.characters set owner_id = $2 where id = $1`, [aliceChar.id, bob]))).toBe('42501');
    expect(await errCode(a.query(`update public.characters set visibility = 'gm' where id = $1`, [aliceChar.id]))).toBe('42501');
    expect(await errCode(as(db, gm).query(`update public.characters set ruleset = 'custom' where id = $1`, [aliceChar.id]))).toBe('42501');
    await as(db, gm).query(`update public.characters set owner_id = $2 where id = $1`, [aliceChar.id, bob]);
    expect((await patch(bob, aliceChar.id, [{ path: ['name'], value: 'Passed on' }])).data.name).toBe('Passed on');
    expect(await errCode(patch(alice, aliceChar.id, [{ path: ['name'], value: 'Back' }]))).toBe('42501');
  });

  it('secret NPCs never reach players: not in queries, snapshots, or the shared topic', async () => {
    const before = (await messages(db)).at(-1)?.id ?? 0;
    const npc = await insertChar(gm, { visibility: 'gm', data: { name: 'Lich' } });
    await patch(gm, npc.id, [{ path: ['hp'], value: 90 }]);
    for (const u of [alice, bob]) {
      expect(await as(db, u).query('select id from public.characters where id = $1', [npc.id])).toHaveLength(0);
      const snap = await as(db, u).rpc<{ characters: { id: string }[] }>('room_snapshot', [room]);
      expect(snap.characters.map((c) => c.id)).not.toContain(npc.id);
    }
    const gmSnap = await as(db, gm).rpc<{ characters: { id: string }[] }>('room_snapshot', [room]);
    expect(gmSnap.characters.map((c) => c.id)).toContain(npc.id);
    const leaked = (await messages(db, before)).filter((m) => m.topic !== `room:${room}:gm` && JSON.stringify(m.payload).includes(npc.id));
    expect(leaked).toEqual([]);
  });

  it('turning a party character secret tells players it is gone', async () => {
    const c = await insertChar(gm, { data: { name: 'Guide' } });
    const mark = (await messages(db)).at(-1)!.id;
    await as(db, gm).query(`update public.characters set visibility = 'gm' where id = $1`, [c.id]);
    const seen = (await messages(db, mark)).filter((m) => m.topic === `room:${room}:db` && m.event === 'character');
    expect(seen.map((m) => [m.payload.op, m.payload.reason])).toEqual([['del', 'hidden']]);
  });
});

describe('initiative', () => {
  let bobChar: Char;
  const add = (uid: string, fields: Record<string, unknown>) =>
    as(db, uid).query<{ id: string }>(
      `insert into public.initiative_entries (room_id, character_id, name, init, hidden) values ($1, $2, $3, $4, $5) returning id`,
      [room, fields.character_id ?? null, fields.name ?? 'X', fields.init ?? 10, fields.hidden ?? false],
    ).then((r) => r[0]);

  beforeAll(async () => {
    bobChar = await insertChar(bob, { data: { name: 'Bob the Brave' } });
  });

  it('players add and reroll only their own characters', async () => {
    const e = await add(bob, { character_id: bobChar.id, name: 'Bob the Brave', init: 14 });
    await as(db, bob).query('update public.initiative_entries set init = 18 where id = $1', [e.id]);
    expect(await errCode(add(alice, { character_id: bobChar.id }))).toBe('42501');
    expect(await errCode(add(alice, { name: 'Goblin' }))).toBe('42501');
    expect(await as(db, alice).query('update public.initiative_entries set init = 1 where id = $1 returning id', [e.id])).toHaveLength(0);
  });

  it('a GM adds monsters, and hidden ones stay off the shared topic and out of players\' reads', async () => {
    const before = (await messages(db)).at(-1)?.id ?? 0;
    const ambush = await add(gm, { name: 'Hidden Goblin', hidden: true, init: 20 });
    expect(await as(db, alice).query('select id from public.initiative_entries where id = $1', [ambush.id])).toHaveLength(0);
    const leaked = (await messages(db, before)).filter((m) => m.topic !== `room:${room}:gm` && JSON.stringify(m.payload).includes(ambush.id));
    expect(leaked).toEqual([]);
    expect(await errCode(add(bob, { character_id: bobChar.id, hidden: true }))).toBe('42501');
  });

  it('removing a character removes it from the order', async () => {
    await as(db, bob).query('delete from public.characters where id = $1', [bobChar.id]);
    expect(await as(db, gm).query('select id from public.initiative_entries where character_id = $1', [bobChar.id])).toHaveLength(0);
  });
});

describe('room content', () => {
  it('GMs write templates and homebrew; players only read them', async () => {
    await as(db, gm).query(`insert into public.room_content (room_id, kind, key, data) values ($1, 'template', 'main', '{"sections":[]}')`, [room]);
    expect(await as(db, alice).query('select key from public.room_content')).toEqual([{ key: 'main' }]);
    expect(await errCode(as(db, alice).query(
      `insert into public.room_content (room_id, kind, key, data) values ($1, 'homebrew', 'x', '{}')`, [room]))).toBe('42501');
    expect(await as(db, alice).query(`update public.room_content set data = '{}' returning id`)).toHaveLength(0);
  });
});
