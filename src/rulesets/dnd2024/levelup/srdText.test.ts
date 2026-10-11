import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { CLASS_RULES } from '../overlay';
import { featBoost, invocationOpen, meetsPrerequisite, metamagicOptions, plainName } from './srdText';

const srd = SrdZ.parse(raw);
const feat = (k: string) => srd.feats.find((f) => f.key === k)!;
const scores = (over: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>> = {}) =>
  ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...over });

describe('SRD prose for the level-up', () => {
  it('lists the ten Metamagic options', () => {
    expect(metamagicOptions(srd)).toEqual([
      'Careful Spell', 'Distant Spell', 'Empowered Spell', 'Extended Spell', 'Heightened Spell',
      'Quickened Spell', 'Seeking Spell', 'Subtle Spell', 'Transmuted Spell', 'Twinned Spell',
    ]);
  });

  it('reads what a feat adds to ability scores', () => {
    expect(featBoost(feat('grappler').desc)).toEqual({ abilities: ['str', 'dex'], max: 20 });
    for (const b of srd.feats.filter((f) => f.type === 'epic boon')) {
      expect(featBoost(b.desc), b.key).toEqual({ abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'], max: 30 });
    }
    expect(featBoost(feat('alert').desc)).toBeNull();
  });

  it('checks level, ability and spellcasting prerequisites', () => {
    const g = feat('grappler').prerequisite;
    expect(meetsPrerequisite(g, 4, scores({ dex: 13 }), false)).toBe(true);
    expect(meetsPrerequisite(g, 3, scores({ dex: 13 }), false)).toBe(false);
    expect(meetsPrerequisite(g, 4, scores({ str: 12, dex: 12 }), false)).toBe(false);
    expect(meetsPrerequisite(feat('boon-of-spell-recall').prerequisite, 19, scores(), false)).toBe(false);
    expect(meetsPrerequisite(feat('boon-of-spell-recall').prerequisite, 19, scores(), true)).toBe(true);
    expect(meetsPrerequisite(null, 1, scores(), false)).toBe(true);
  });

  it('opens invocations by Warlock level and by the invocation they need', () => {
    expect(invocationOpen(null, 1, [])).toBe(true);
    expect(invocationOpen('Level 5+ Warlock', 4, [])).toBe(false);
    expect(invocationOpen('Level 5+ Warlock', 5, [])).toBe(true);
    expect(invocationOpen('Level 5+ Warlock, Pact of the Blade Invocation', 5, [])).toBe(false);
    expect(invocationOpen('Level 5+ Warlock, Pact of the Blade Invocation', 5, ['Pact of the Blade'])).toBe(true);
    expect(invocationOpen('Level 2+ Warlock, a Warlock Cantrip That Deals Damage', 2, [])).toBe(true); // spells are the player's
  });

  it('every invocation prerequisite names a level or an invocation the reader understands', () => {
    const names = srd.classes.find((c) => c.key === 'warlock')!.invocations.map((i) => plainName(i.name));
    for (const i of srd.classes.find((c) => c.key === 'warlock')!.invocations) {
      const inv = /,\s*(.+?) Invocation$/i.exec(i.prerequisite ?? '')?.[1];
      if (inv) expect(names, i.name).toContain(inv);
    }
  });

  it('strips markdown from names', () => {
    expect(plainName('**Lessons of the First Ones**')).toBe('Lessons of the First Ones');
  });

  it('the Wizard Scholar picks only from its six skills', () => {
    const scholar = CLASS_RULES.find((r) => r.key === 'wizard')!.choices.find((p) => p.feature === 'Scholar');
    expect(scholar).toMatchObject({ kind: 'expertise', count: 1, from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'] });
  });
});
