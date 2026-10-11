import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, errCode, newUser, type Db } from './harness';

let db: Db;
let gm: string, alice: string;
let room: string;

type Char = { id: string; data: Record<string, unknown> };
const insert = (uid: string, data: Record<string, unknown>, ruleset = 'dnd2024') =>
  as(db, uid).query<Char>(
    `insert into public.characters (room_id, ruleset, data) values ($1, $2, $3::jsonb) returning id, data`,
    [room, ruleset, JSON.stringify(data)],
  ).then((r) => r[0]);
const patch = (uid: string, id: string, ops: unknown[]) =>
  as(db, uid).query<Char>('select id, data from public.character_patch($1, $2::jsonb)', [id, JSON.stringify(ops)]).then((r) => r[0]);
const setStart = (n: number) =>
  as(db, gm).query(`update public.rooms set settings = settings || jsonb_build_object('startLevel', $2::int) where id = $1`, [room, n]);

beforeAll(async () => {
  db = await createDb();
  [gm, alice] = [await newUser(db), await newUser(db)];
  const created = await as(db, gm).rpc<{ room_id: string; slug: string }>('create_room', ['ห้องเลเวล', 'GM', '#e5484d']);
  room = created.room_id;
  await as(db, alice).rpc('request_join', [created.slug, 'Alice', '#46a758']);
  await as(db, gm).query(`update public.room_members set status = 'approved' where user_id = $1`, [alice]);
}, 60_000);

describe('level gate', () => {
  it('a player creates characters only up to the room start level', async () => {
    expect((await insert(alice, { name: 'A' })).data).toEqual({ name: 'A' });
    expect(await errCode(insert(alice, { name: 'B', level: 2 }))).toBe('42501');
    expect(await errCode(insert(alice, { name: 'B', level: 1, levelAllowed: 3 }))).toBe('42501');
    await setStart(3);
    expect((await insert(alice, { name: 'C', level: 1, levelAllowed: 3 })).data.levelAllowed).toBe(3);
    expect((await insert(alice, { name: 'D', level: 3 })).data.level).toBe(3);
    await setStart(1);
  });

  it('a player levels up one step at a time, only as far as the GM allowed', async () => {
    const c = await insert(alice, { name: 'Hero', level: 1 });
    expect(await errCode(patch(alice, c.id, [{ path: ['level'], value: 2 }]))).toBe('42501');
    await patch(gm, c.id, [{ path: ['levelAllowed'], value: 3 }]);
    expect(await errCode(patch(alice, c.id, [{ path: ['level'], value: 3 }]))).toBe('42501'); // skipping a level
    expect((await patch(alice, c.id, [{ path: ['level'], value: 2 }, { path: ['hpGains'], value: [6] }])).data.level).toBe(2);
    expect((await patch(alice, c.id, [{ path: ['level'], value: 3 }])).data.level).toBe(3);
    expect(await errCode(patch(alice, c.id, [{ path: ['level'], value: 4 }]))).toBe('42501');
    expect(await errCode(patch(alice, c.id, [{ path: ['level'], value: 2 }]))).toBe('42501'); // no going down
  });

  it('a player cannot change the allowance, but may edit everything else', async () => {
    const c = await insert(alice, { name: 'Hero', level: 1 });
    expect(await errCode(patch(alice, c.id, [{ path: ['levelAllowed'], value: 5 }]))).toBe('42501');
    expect((await patch(alice, c.id, [{ path: ['notes'], value: 'hi' }])).data.notes).toBe('hi');
  });

  it('a player cannot raise the level with a direct update either', async () => {
    const c = await insert(alice, { name: 'Direct', level: 1 });
    expect(await errCode(as(db, alice).query(`update public.characters set data = data || '{"level":5}'::jsonb where id = $1`, [c.id]))).toBe('42501');
  });

  it('a player cannot remove the allowance the GM set', async () => {
    const c = await insert(alice, { name: 'Hero', level: 1 });
    await patch(gm, c.id, [{ path: ['levelAllowed'], value: 3 }]);
    expect(await errCode(patch(alice, c.id, [{ path: ['levelAllowed'], value: null }]))).toBe('42501');
  });

  it('an absurd stored allowance does not break the sheet and counts as none', async () => {
    const c = await insert(alice, { name: 'Hero', level: 1 });
    await as(db, gm).query(`update public.characters set data = data || '{"levelAllowed":1000000000000}'::jsonb where id = $1`, [c.id]);
    expect((await patch(alice, c.id, [{ path: ['notes'], value: 'still editable' }])).data.notes).toBe('still editable');
    expect(await errCode(patch(alice, c.id, [{ path: ['level'], value: 2 }]))).toBe('42501');
  });

  it('a player cannot move a character out of dnd2024', async () => {
    const c = await insert(alice, { name: 'Hero', level: 1 });
    expect(await errCode(as(db, alice).query(`update public.characters set ruleset = 'custom' where id = $1`, [c.id]))).toBe('42501');
  });

  it('a GM may set any level', async () => {
    const c = await insert(gm, { name: 'NPC', level: 12 });
    expect((await patch(gm, c.id, [{ path: ['level'], value: 3 }])).data.level).toBe(3);
  });

  it('other rulesets are not checked, and junk levels count as 1', async () => {
    expect((await insert(alice, { level: 9 }, 'custom')).data.level).toBe(9);
    expect((await insert(alice, { level: 'lots' })).data.level).toBe('lots');
  });
});
