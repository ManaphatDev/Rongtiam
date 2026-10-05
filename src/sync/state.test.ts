import { describe, expect, it } from 'vitest';
import { RoomState } from './state';
import type { ItemRow, Snapshot } from './types';

const room = { id: 'r1', slug: 's', name: 'Room', ruleset_id: 'none', settings: { grid: { on: false, size: 70 }, snap: true }, rev: 0, created_by: null };

const row = (id: string, rev: number, props: ItemRow['props'] = { x: 0, y: 0, size: 50 }, extra: Partial<ItemRow> = {}): ItemRow => ({
  id, room_id: 'r1', kind: 'char', z: 1, locked: false, hidden: false, props, meta: {}, rev,
  created_by: null, updated_by: null, ...extra,
});

const snap = (seq: number, items: ItemRow[]): Snapshot => ({ seq, room, members: [], items, assets: [], rolls: [] });

describe('RoomState snapshot + buffer', () => {
  it('replays only events newer than the snapshot', () => {
    const s = new RoomState();
    s.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 3, { x: 1, y: 0, size: 50 }), rev: 3 });
    s.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 7, { x: 9, y: 0, size: 50 }), rev: 7 });
    s.loadSnapshot(snap(5, [row('a', 5, { x: 5, y: 0, size: 50 })]));
    expect(s.get('a')?.props.x).toBe(9);
  });

  it('does not resurrect an item deleted while the snapshot loaded', () => {
    const s = new RoomState();
    s.handle({ kind: 'item', scope: 'db', op: 'del', id: 'a', rev: 6 });
    s.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 4), rev: 4 });
    s.loadSnapshot(snap(5, [row('a', 5)]));
    expect(s.get('a')).toBeUndefined();
    s.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 5), rev: 5 });
    expect(s.get('a')).toBeUndefined();
  });

  it('ignores stale updates', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(10, [row('a', 10, { x: 10, y: 0, size: 50 })]));
    s.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 8, { x: 8, y: 0, size: 50 }), rev: 8 });
    expect(s.get('a')?.props.x).toBe(10);
  });

  it('lets an unhidden item come back for players but keeps it for GMs', () => {
    const player = new RoomState(() => false);
    player.loadSnapshot(snap(1, [row('a', 1)]));
    player.handle({ kind: 'item', scope: 'db', op: 'del', id: 'a', rev: 2, reason: 'hidden' });
    expect(player.get('a')).toBeUndefined();
    player.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 3), rev: 3 });
    expect(player.get('a')).toBeDefined();

    const gm = new RoomState(() => true);
    gm.loadSnapshot(snap(1, [row('a', 1)]));
    gm.handle({ kind: 'item', scope: 'gm', op: 'up', row: row('a', 2, undefined, { hidden: true }), rev: 2 });
    gm.handle({ kind: 'item', scope: 'db', op: 'del', id: 'a', rev: 2, reason: 'hidden' });
    expect(gm.get('a')?.hidden).toBe(true);
  });
});

describe('RoomState pending layer', () => {
  it('shows pending patches over confirmed rows and clears them on ack', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1)]));
    const seq = s.localPatch('a', { props: { x: 42 } });
    expect(s.get('a')?.props.x).toBe(42);
    s.ack([{ id: 'a', seq, t: 'patch' }], [row('a', 2, { x: 42, y: 0, size: 50 })]);
    expect(s.hasPending('a')).toBe(false);
    expect(s.get('a')?.props.x).toBe(42);
  });

  it('keeps a newer pending change when an older batch is acknowledged', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1)]));
    const first = s.localPatch('a', { props: { x: 1 } });
    s.localPatch('a', { props: { x: 2 } });
    s.ack([{ id: 'a', seq: first, t: 'patch' }], [row('a', 2, { x: 1, y: 0, size: 50 })]);
    expect(s.get('a')?.props.x).toBe(2);
  });

  it('reverts on reject', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1, { x: 0, y: 0, size: 50 })]));
    s.localPatch('a', { props: { x: 99 }, locked: true });
    s.reject(['a']);
    expect(s.get('a')?.props.x).toBe(0);
    expect(s.get('a')?.locked).toBe(false);
  });

  it('removes keys patched to null', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1, { x: 0, y: 0, size: 50, name: 'Bob' })]));
    s.localPatch('a', { props: { name: null } });
    expect('name' in s.get('a')!.props).toBe(false);
  });

  it('pending adds and deletes affect ids()', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1)]));
    s.localAdd({ id: 'b', kind: 'sticker', z: 2, props: { x: 1, y: 1, size: 10 } });
    s.localDel('a');
    expect(s.ids().sort()).toEqual(['b']);
  });

  it('a delete refused by the server brings the item back', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1)]));
    const seq = s.localDel('a');
    s.ack([{ id: 'a', seq, t: 'del' }], []);
    expect(s.get('a')).toBeDefined();
  });

  it('a delete accepted by the server tombstones the item', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1)]));
    const seq = s.localDel('a');
    s.ack([{ id: 'a', seq, t: 'del' }], [row('a', 1)]);
    s.handle({ kind: 'item', scope: 'db', op: 'up', row: row('a', 1), rev: 1 });
    expect(s.get('a')).toBeUndefined();
  });

  it('merges meta per namespace', () => {
    const s = new RoomState();
    s.loadSnapshot(snap(1, [row('a', 1, undefined, { meta: { core: { hp: 5, max: 10 } } })]));
    s.localPatch('a', { meta: { core: { hp: 3 } } });
    expect(s.get('a')?.meta.core).toEqual({ hp: 3, max: 10 });
  });
});
