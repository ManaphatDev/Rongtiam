import { describe, expect, it, vi } from 'vitest';
import { OpQueue } from './opqueue';
import { applyPatch, RoomState } from './state';
import type { ItemRow, Op } from './types';

const base = (id: string, rev = 1): ItemRow => ({
  id, room_id: 'r1', kind: 'char', z: 1, locked: false, hidden: false, props: { x: 0, y: 0, size: 50 }, meta: {},
  rev, created_by: null, updated_by: null,
});

function fakeServer(initial: ItemRow[]) {
  const rows = new Map(initial.map((r) => [r.id, r]));
  let rev = 10;
  const calls: Op[][] = [];
  const send = vi.fn(async (ops: Op[]) => {
    calls.push(ops);
    const out: ItemRow[] = [];
    for (const op of ops) {
      if (op.t === 'add') {
        const r = { ...base(op.item.id), ...op.item, meta: op.item.meta ?? {}, locked: !!op.item.locked, hidden: !!op.item.hidden, rev: ++rev };
        rows.set(r.id, r);
        out.push(r);
      } else if (op.t === 'patch') {
        const { t: _t, id, ...f } = op;
        const cur = rows.get(id);
        if (!cur) throw { code: '42501', message: 'forbidden_or_missing' };
        const r = { ...applyPatch(cur, f), rev: ++rev };
        rows.set(id, r);
        out.push(r);
      } else {
        const r = rows.get(op.id);
        if (r) out.push(r);
        rows.delete(op.id);
      }
    }
    return out;
  });
  return { send, calls, rows };
}

function setup(initial: ItemRow[] = [base('a')]) {
  const state = new RoomState();
  state.loadSnapshot({ seq: 1, room: { id: 'r1', slug: 's', name: 'n', ruleset_id: 'none', settings: { grid: { on: false, size: 70 }, snap: true }, rev: 0, created_by: null }, members: [], items: initial, assets: [], rolls: [], characters: [], content: [], initiative: [] });
  const server = fakeServer(initial);
  return { state, server };
}

describe('OpQueue', () => {
  it('coalesces delayed patches to the same item into one op', async () => {
    const { state, server } = setup();
    const q = new OpQueue(state, { send: server.send });
    q.patch('a', { props: { x: 1 } }, 150);
    q.patch('a', { props: { y: 2 } }, 150);
    q.patch('a', { props: { x: 3 } }, 150);
    await q.drain();
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]).toEqual([{ t: 'patch', id: 'a', props: { x: 3, y: 2 } }]);
    expect(state.get('a')?.props).toMatchObject({ x: 3, y: 2 });
    expect(state.hasPending('a')).toBe(false);
  });

  it('folds patches into a queued add', async () => {
    const { state, server } = setup([]);
    const q = new OpQueue(state, { send: server.send });
    q.add({ id: 'n', kind: 'sticker', z: 1, props: { x: 0, y: 0, size: 10 } }, 50);
    q.patch('n', { props: { x: 5 } });
    await q.drain();
    expect(server.calls.flat()).toEqual([{ t: 'add', item: { id: 'n', kind: 'sticker', z: 1, props: { x: 5, y: 0, size: 10 }, meta: {}, locked: undefined, hidden: undefined } }]);
  });

  it('merges patches across other items but never across a delete of the same item', async () => {
    const { state, server } = setup([base('a'), base('b'), base('c')]);
    const q = new OpQueue(state, { send: server.send });
    q.patch('a', { props: { x: 1 } }, 50);
    q.del('b');
    q.patch('a', { props: { x: 2 } }, 50);
    q.del('a');
    q.patch('c', { props: { x: 3 } }, 50);
    await q.drain();
    expect(server.calls.flat()).toEqual([
      { t: 'patch', id: 'a', props: { x: 2 } },
      { t: 'del', id: 'b' },
      { t: 'del', id: 'a' },
      { t: 'patch', id: 'c', props: { x: 3 } },
    ]);
  });

  it('rolls back and reports a refused batch without retrying', async () => {
    const { state } = setup();
    const send = vi.fn(async () => { throw { code: '42501', message: 'forbidden_or_missing' }; });
    const onRejected = vi.fn();
    const q = new OpQueue(state, { send, onRejected, backoff: [1, 1] });
    q.patch('a', { props: { x: 77 } });
    expect(state.get('a')?.props.x).toBe(77);
    await q.drain();
    expect(send).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ code: '42501' }), ['a']);
    expect(state.get('a')?.props.x).toBe(0);
  });

  it('retries network errors then succeeds', async () => {
    const { state, server } = setup();
    let fail = 2;
    const send = vi.fn(async (ops: Op[]) => {
      if (fail-- > 0) throw new TypeError('Failed to fetch');
      return server.send(ops);
    });
    const q = new OpQueue(state, { send, backoff: [1, 1, 1] });
    q.patch('a', { props: { x: 5 } });
    await q.drain();
    expect(send).toHaveBeenCalledTimes(3);
    expect(state.get('a')?.props.x).toBe(5);
    expect(state.hasPending('a')).toBe(false);
  });
});
