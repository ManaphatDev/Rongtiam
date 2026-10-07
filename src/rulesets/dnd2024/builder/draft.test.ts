import { describe, expect, it } from 'vitest';
import { DraftZ, emptyDraft } from './draft';

describe('emptyDraft', () => {
  it('is blank and complete', () => {
    const d = emptyDraft();
    expect(d.classKey).toBeNull();
    expect(d.background).toBeNull();
    expect(d.species).toBeNull();
    expect(d.languages).toEqual([]);
    expect(d.bgAsi).toEqual({ mode: '2/1', plus2: null, plus1: null });
    expect(d.scores.method).toBe('array');
    expect(d.rolled).toBeNull();
    expect(d.name).toBe('');
  });

  it('two drafts never share nested values', () => {
    const a = emptyDraft();
    a.bgFeat.cantrips.push('light');
    a.scores.assign.str = 0;
    a.speciesOptions.lineage = 'drow';
    const b = emptyDraft();
    expect(b.bgFeat.cantrips).toEqual([]);
    expect(b.scores.assign).toEqual({});
    expect(b.speciesOptions).toEqual({});
  });

  it('rejects data of the wrong shape', () => {
    expect(DraftZ.safeParse({ classKey: 5 }).success).toBe(false);
    expect(DraftZ.safeParse({ rolled: [1, 2, 3] }).success).toBe(false);
    expect(DraftZ.safeParse({ bgAsi: { mode: '3/0' } }).success).toBe(false);
  });
});
