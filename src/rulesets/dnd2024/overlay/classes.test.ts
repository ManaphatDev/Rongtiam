import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { CLASS_RULES } from './index';

const srd = SrdZ.parse(raw);

describe('class overlay', () => {
  it('covers every SRD class exactly once', () => {
    expect(CLASS_RULES.map((r) => r.key).sort()).toEqual(srd.classes.map((c) => c.key).sort());
  });

  it('every decision names a real feature that the class gains at that level', () => {
    for (const r of CLASS_RULES) {
      const cls = srd.classes.find((c) => c.key === r.key)!;
      for (const p of r.choices) {
        const same = cls.features.filter((f) => f.name === p.feature);
        expect(same.length, `${r.key}: no feature "${p.feature}"`).toBeGreaterThan(0);
        expect(same.some((f) => f.levels.includes(p.level)), `${r.key}: "${p.feature}" is not gained at level ${p.level}`).toBe(true);
      }
    }
  });

  it('counts agree with the class table where the table has a column for them', () => {
    for (const r of CLASS_RULES) {
      const cls = srd.classes.find((c) => c.key === r.key)!;
      for (const p of r.choices) {
        if (p.level !== 1) continue;
        if (p.kind === 'masteries' && cls.table['Weapon Mastery']) expect(Number(cls.table['Weapon Mastery'][0]), r.key).toBe(p.count);
        if (p.kind === 'invocations' && cls.table['Eldritch Invocations']) expect(Number(cls.table['Eldritch Invocations'][0]), r.key).toBe(p.count);
      }
    }
  });

  it('order options are named in the feature text, and the spellbook is only the Wizard\'s', () => {
    for (const r of CLASS_RULES) {
      const cls = srd.classes.find((c) => c.key === r.key)!;
      for (const p of r.choices) {
        if (p.kind !== 'order') continue;
        const text = cls.features.find((f) => f.name === p.feature)!.desc;
        for (const o of p.options) expect(text, `${r.key}: ${o.name}`).toContain(o.name);
      }
    }
    expect(CLASS_RULES.filter((r) => r.spellbook).map((r) => [r.key, r.spellbook])).toEqual([['wizard', 6]]);
  });

  it('every class chooses a subclass at 3 and takes an Epic Boon at 19', () => {
    for (const r of CLASS_RULES) {
      expect(r.choices.filter((p) => p.kind === 'subclass').map((p) => p.level), r.key).toEqual([3]);
      expect(r.choices.find((p) => p.kind === 'asi' && p.epicBoon)?.level, r.key).toBe(19);
    }
  });

  it('level-1 decisions are the ones the builder will ask for', () => {
    const one = (k: string) => CLASS_RULES.find((r) => r.key === k)!.choices.filter((p) => p.level === 1).map((p) => p.kind).sort();
    expect(one('fighter')).toEqual(['fightingStyle', 'masteries']);
    expect(one('rogue')).toEqual(['expertise', 'masteries']);
    expect(one('cleric')).toEqual(['order']);
    expect(one('warlock')).toEqual(['invocations']);
    expect(one('wizard')).toEqual([]);
    expect(one('paladin')).toEqual(['masteries']);
  });

  it('progression of decisions per class (snapshot)', () => {
    const lines = Object.fromEntries(CLASS_RULES.map((r) => [r.key, r.choices.map((p) => {
      const extra = p.kind === 'masteries' ? ` ${p.filter} x${p.count}` : 'count' in p ? ` x${p.count}` : p.kind === 'asi' && p.epicBoon ? ' epic' : '';
      return `L${p.level} ${p.kind}${extra}`;
    })]));
    expect(lines).toMatchSnapshot();
  });
});
