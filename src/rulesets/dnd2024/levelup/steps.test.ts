import { describe, expect, it } from 'vitest';
import { build } from '../builder/build';
import { autoDraft } from '../builder/fixtures';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { parseCharacter } from '../model';
import { classPicks, expertisePool, invocationPool, levelSteps, masteryPool, metamagicPool, pastPicks } from './steps';

const srd = SrdZ.parse(raw);
const made = (k: string) => build(autoDraft(srd, k, 'soldier', 'human'), srd);
const at = (k: string, level: number) => ({ ...made(k), level });

describe('levelSteps', () => {
  it('a Fighter at level 2 only picks HP', () => {
    expect(levelSteps(made('fighter'), srd)).toEqual(['hp', 'review']);
  });

  it('subclass at 3, ASI at 4, Epic Boon at 19', () => {
    expect(levelSteps(at('fighter', 2), srd)).toEqual(['hp', 'subclass', 'review']);
    expect(levelSteps(at('fighter', 3), srd)).toEqual(['hp', 'asi', 'class', 'review']); // Weapon Mastery 3 → 4
    expect(levelSteps(at('wizard', 18), srd)).toEqual(['hp', 'boon', 'review']);
  });

  it('class picks come from the overlay and the table', () => {
    expect(classPicks(made('sorcerer'), srd, 2)).toMatchObject({ metamagic: 2 });
    expect(classPicks(made('paladin'), srd, 2)).toMatchObject({ fightingStyle: true });
    expect(classPicks(at('warlock', 1), srd, 2)).toMatchObject({ invocations: 2 }); // 1 → 3
    expect(classPicks(at('fighter', 3), srd, 4)).toMatchObject({ masteries: 1, masteryFilter: 'any' });
    expect(classPicks(made('wizard'), srd, 2)).toMatchObject({ expertise: 1, expertiseFrom: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'] });
  });

  it('matches the snapshot for every class and level', () => {
    const table = Object.fromEntries(srd.classes.map((k) => [k.key,
      Array.from({ length: 19 }, (_, i) => `${i + 2}:${levelSteps(at(k.key, i + 1), srd).join(',')}`)]));
    expect(table).toMatchSnapshot();
  });
});

describe('pools', () => {
  it('expertise offers proficient skills that are not Expertise yet, within `from`', () => {
    const c = parseCharacter({ classKey: 'wizard', skills: { arcana: 1, stealth: 1, history: 2 } });
    expect(expertisePool(c, null).sort()).toEqual(['arcana', 'stealth']);
    expect(expertisePool(c, ['arcana', 'history'])).toEqual(['arcana']);
  });

  it('picks the sheet already has are not offered again', () => {
    const w = made('warlock');
    const known = pastPicks(w).invocations;
    expect(known).toHaveLength(1);
    expect(invocationPool(w, srd, 2)).not.toContain(known[0]);
    const f = made('fighter');
    expect(masteryPool(f, srd, 'any')).not.toContain(pastPicks(f).masteries[0]);
    expect(metamagicPool(made('sorcerer'), srd)).toHaveLength(10);
  });

  it('a hand-made sheet with no choices has no past picks', () => {
    expect(pastPicks(parseCharacter({ classKey: 'warlock', level: 4 }))).toEqual({ masteries: [], invocations: [], metamagic: [] });
  });
});
