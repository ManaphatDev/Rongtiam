import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { emptyDraft } from './draft';
import { autoDraft } from './fixtures';
import { clearDraft, loadDraft, saveDraft } from './persist';

const srd = SrdZ.parse(raw);
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('draft persistence', () => {
  it('starts blank when nothing is stored', () => {
    expect(loadDraft('r1', srd)).toEqual({ step: 0, draft: emptyDraft() });
  });

  it('round-trips a draft and the step it was on', () => {
    const draft = autoDraft(srd, 'wizard', 'sage', 'elf');
    saveDraft('r1', { step: 4, draft });
    expect(loadDraft('r1', srd)).toEqual({ step: 4, draft });
  });

  it('keeps each room\'s draft apart, and clearing removes it', () => {
    saveDraft('r1', { step: 1, draft: { ...emptyDraft(), name: 'One' } });
    saveDraft('r2', { step: 2, draft: { ...emptyDraft(), name: 'Two' } });
    expect(loadDraft('r1', srd).draft.name).toBe('One');
    clearDraft('r1');
    expect(loadDraft('r1', srd)).toEqual({ step: 0, draft: emptyDraft() });
    expect(loadDraft('r2', srd).draft.name).toBe('Two');
  });

  it('starts blank for corrupt or wrongly shaped storage', () => {
    store.set('rongtiam:builder:r1', '{not json');
    expect(loadDraft('r1', srd).step).toBe(0);
    store.set('rongtiam:builder:r1', JSON.stringify({ v: 1, step: 2, draft: { classKey: 7 } }));
    expect(loadDraft('r1', srd)).toEqual({ step: 0, draft: emptyDraft() });
    store.set('rongtiam:builder:r1', JSON.stringify({ v: 2, step: 2, draft: emptyDraft() }));
    expect(loadDraft('r1', srd)).toEqual({ step: 0, draft: emptyDraft() });
    store.set('rongtiam:builder:r1', JSON.stringify({ v: 1, step: 99, draft: emptyDraft() }));
    expect(loadDraft('r1', srd).step).toBe(0);
  });

  it('drops a draft that names a class, background or species the SRD does not have', () => {
    for (const patch of [{ classKey: 'artificer' }, { background: 'hermit' }, { species: 'tabaxi' }]) {
      saveDraft('r1', { step: 3, draft: { ...emptyDraft(), ...patch } });
      expect(loadDraft('r1', srd)).toEqual({ step: 0, draft: emptyDraft() });
    }
  });

  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => saveDraft('r1', { step: 0, draft: emptyDraft() })).not.toThrow();
    expect(() => clearDraft('r1')).not.toThrow();
    expect(loadDraft('r1', srd)).toEqual({ step: 0, draft: emptyDraft() });
  });
});
