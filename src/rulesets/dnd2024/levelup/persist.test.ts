import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLevelDraft } from './draft';
import { clearLevelDraft, loadLevelDraft, saveLevelDraft } from './persist';

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

describe('level-up draft storage', () => {
  it('keeps a draft per character for the level it was made for', () => {
    const draft = { ...emptyLevelDraft(3), hp: { method: 'roll' as const, rolled: 7 } };
    saveLevelDraft('c1', 3, { step: 1, draft });
    expect(loadLevelDraft('c1', 3)).toEqual({ step: 1, draft });
    expect(loadLevelDraft('c2', 3)).toEqual({ step: 0, draft: emptyLevelDraft(3) });
  });

  it('drops a draft made for another level, junk, and cleared drafts', () => {
    saveLevelDraft('c1', 3, { step: 2, draft: emptyLevelDraft(3) });
    expect(loadLevelDraft('c1', 4)).toEqual({ step: 0, draft: emptyLevelDraft(4) });
    localStorage.setItem('rongtiam:levelup:c1:3', '{nope');
    expect(loadLevelDraft('c1', 3)).toEqual({ step: 0, draft: emptyLevelDraft(3) });
    saveLevelDraft('c1', 3, { step: 1, draft: emptyLevelDraft(3) });
    clearLevelDraft('c1', 3);
    expect(loadLevelDraft('c1', 3).step).toBe(0);
  });

  it("keeps the next level's draft apart from the one just confirmed", () => {
    const hp = { method: 'roll' as const, rolled: 5 };
    saveLevelDraft('c1', 3, { step: 1, draft: { ...emptyLevelDraft(3), hp } });
    saveLevelDraft('c1', 4, { step: 0, draft: emptyLevelDraft(4) });
    expect(loadLevelDraft('c1', 3).draft.hp).toEqual(hp);
    clearLevelDraft('c1', 4);
    expect(loadLevelDraft('c1', 3).draft.hp).toEqual(hp);
  });
});
