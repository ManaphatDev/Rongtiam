// The unfinished level-up, kept in this browser per character, so closing the panel or reloading mid-roll neither
// loses it nor buys a second HP roll. A draft for another level, or anything unreadable, is dropped.
import { z } from 'zod';
import { LevelDraftZ, emptyLevelDraft, type LevelDraft } from './draft';

export interface SavedLevel { step: number; draft: LevelDraft }

const SavedZ = z.object({ v: z.literal(1), step: z.number().int().min(0).max(10), draft: LevelDraftZ });
const key = (id: string) => `rongtiam:levelup:${id}`;

export function loadLevelDraft(id: string, forLevel: number): SavedLevel {
  try {
    const text = localStorage.getItem(key(id));
    if (text) {
      const r = SavedZ.safeParse(JSON.parse(text));
      if (r.success && r.data.draft.forLevel === forLevel) return { step: r.data.step, draft: r.data.draft };
    }
  } catch {
    // unreadable or blocked storage: start over
  }
  return { step: 0, draft: emptyLevelDraft(forLevel) };
}

export function saveLevelDraft(id: string, s: SavedLevel): void {
  try {
    localStorage.setItem(key(id), JSON.stringify({ v: 1, ...s }));
  } catch {
    // private mode / quota: the draft just won't survive a reload
  }
}

export function clearLevelDraft(id: string): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // ignore
  }
}
