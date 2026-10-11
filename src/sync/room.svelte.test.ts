import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend';
import { RoomStore } from './room.svelte';

function storeWith(upsertContent: Backend['upsertContent']) {
  const onError = vi.fn();
  const backend = { roomId: 'r1', upsertContent, disconnect: () => {} } as unknown as Backend;
  const store = new RoomStore(backend, { id: 'u1', name: 'GM', role: 'gm', color: '#fff' } as never, onError);
  return { store, onError };
}

describe('RoomStore.saveContent', () => {
  it('resolves true when the write goes through', async () => {
    const { store, onError } = storeWith(async () => {});
    expect(await store.saveContent('hb-item', 'hb-x', { name: 'x' })).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the error and resolves false when the write fails', async () => {
    const { store, onError } = storeWith(async () => {
      throw { code: '42501', message: 'forbidden_or_missing' };
    });
    expect(await store.saveContent('hb-item', 'hb-x', { name: 'x' })).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
});
