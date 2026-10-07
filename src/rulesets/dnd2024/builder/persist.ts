// The unfinished character, kept in this browser (per room) so closing the panel or the tab doesn't lose it.
// Anything unreadable, or naming something the SRD no longer has, is dropped: a blank draft is always safe.
import { z } from 'zod';
import type { Srd } from '../data/schema';
import { DraftZ, emptyDraft, type Draft } from './draft';

export interface Saved { step: number; draft: Draft }

const SavedZ = z.object({ v: z.literal(1), step: z.number().int().min(0).max(20), draft: DraftZ });
const key = (roomId: string) => `rongtiam:builder:${roomId}`;
const blank = (): Saved => ({ step: 0, draft: emptyDraft() });

const knownKeys = (d: Draft, srd: Srd) =>
  (d.classKey === null || srd.classes.some((c) => c.key === d.classKey))
  && (d.background === null || srd.backgrounds.some((b) => b.key === d.background))
  && (d.species === null || srd.species.some((s) => s.key === d.species));

export function loadDraft(roomId: string, srd: Srd): Saved {
  try {
    const text = localStorage.getItem(key(roomId));
    if (text) {
      const r = SavedZ.safeParse(JSON.parse(text));
      if (r.success && knownKeys(r.data.draft, srd)) return { step: r.data.step, draft: r.data.draft };
    }
  } catch {
    // unreadable or blocked storage: start over
  }
  return blank();
}

export function saveDraft(roomId: string, s: Saved): void {
  try {
    localStorage.setItem(key(roomId), JSON.stringify({ v: 1, ...s }));
  } catch {
    // private mode / quota: the draft just won't survive a reload
  }
}

export function clearDraft(roomId: string): void {
  try {
    localStorage.removeItem(key(roomId));
  } catch {
    // ignore
  }
}
