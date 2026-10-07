import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { SKILLS } from '../i18n/th';
import { COMMON_LANGUAGE, EXTRA_LANGUAGES, STANDARD_LANGUAGES } from './languages';
import { SPECIES_RULES } from './index';

const srd = SrdZ.parse(raw);

describe('species overlay', () => {
  it('has an entry for every SRD species', () => {
    expect(SPECIES_RULES.map((r) => r.key).sort()).toEqual(srd.species.map((s) => s.key).sort());
  });

  it('every choice belongs to a real trait whose text names the options', () => {
    for (const r of SPECIES_RULES) {
      const sp = srd.species.find((s) => s.key === r.key)!;
      for (const c of r.choices) {
        const trait = sp.traits.find((t) => t.name === c.trait);
        expect(trait, `${r.key}: no trait "${c.trait}"`).toBeTruthy();
        if (c.kind === 'option') for (const o of c.options) expect(trait!.desc, `${r.key}: ${o.name}`).toContain(o.name);
        if (c.kind === 'skill' && c.from !== 'any') for (const s of c.from) expect(Object.keys(SKILLS)).toContain(s);
      }
    }
  });

  it('option ids are unique inside a choice', () => {
    for (const r of SPECIES_RULES) for (const c of r.choices) {
      if (c.kind === 'option') expect(new Set(c.options.map((o) => o.id)).size, `${r.key}.${c.id}`).toBe(c.options.length);
    }
  });

  it('the species that choose, choose what the SRD text says', () => {
    const rules = (k: string) => SPECIES_RULES.find((r) => r.key === k)!;
    expect(rules('elf').choices.map((c) => c.kind).sort()).toEqual(['option', 'skill']);
    expect(rules('human').choices.map((c) => c.kind).sort()).toEqual(['originFeat', 'skill']);
    expect(rules('dwarf').choices).toEqual([]);
    expect(rules('dragonborn').choices[0]).toMatchObject({ kind: 'option', id: 'ancestry' });
    expect((rules('dragonborn').choices[0] as { options: unknown[] }).options).toHaveLength(10);
  });
});

describe('languages', () => {
  it('Common is fixed and two more are chosen from the standard list', () => {
    expect(COMMON_LANGUAGE).toBe('Common');
    expect(EXTRA_LANGUAGES).toBe(2);
    expect(STANDARD_LANGUAGES).not.toContain('Common');
    expect(new Set(STANDARD_LANGUAGES).size).toBe(STANDARD_LANGUAGES.length);
    expect(STANDARD_LANGUAGES.length).toBeGreaterThanOrEqual(9);
  });
});
