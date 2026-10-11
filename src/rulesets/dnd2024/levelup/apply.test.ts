import { describe, expect, it } from 'vitest';
import { build } from '../builder/build';
import { autoDraft } from '../builder/fixtures';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { derive } from '../derive';
import { parseCharacter, type D2024 } from '../model';
import { appendFeatures, boostFor, diffOps, levelUp, LevelUpError } from './apply';
import { emptyLevelDraft, type LevelDraft } from './draft';
import { autoLevel } from './fixtures';
import { pastLevels } from './steps';

const srd = SrdZ.parse(raw);
const made = (k: string): D2024 => build(autoDraft(srd, k, 'soldier', 'human'), srd);
const avg = (forLevel: number): LevelDraft => ({ ...emptyLevelDraft(forLevel), hp: { method: 'average', rolled: null } });

describe('levelUp', () => {
  it('raises the level, stores the gain, heals by what max HP grew, and records the draft', () => {
    const c = made('fighter');
    c.hp.current = 5; // hurt
    const n = levelUp(c, { ...emptyLevelDraft(2), hp: { method: 'roll', rolled: 9 } }, srd, true);
    expect(n.level).toBe(2);
    expect(n.hpGains).toEqual([9]);
    const grew = derive(n, srd).maxHp - derive(c, srd).maxHp;
    expect(n.hp.current).toBe(5 + grew);
    expect(pastLevels(n)).toHaveLength(1);
    expect(n.features).toContain('# เลเวล 2');
    expect(n.features).toContain('Action Surge');
  });

  it('leaves everything else on the sheet alone', () => {
    const c = made('fighter');
    c.notes = 'mine';
    c.inventory.push({ name: 'Lucky coin', qty: 1, note: '' });
    c.money.gp = 99;
    const n = levelUp(c, avg(2), srd, true);
    const ops = diffOps(c, n).map((o) => o.path[0]);
    expect([...new Set(ops)].sort()).toEqual(['choices', 'features', 'hp', 'hpGains', 'level']);
  });

  it('a hand-made level-5 sheet keeps the average for levels 2–5', () => {
    const c = parseCharacter({ classKey: 'fighter', level: 5 });
    const before = derive(c, srd).maxHp;
    const n = levelUp(c, { ...avg(6), asi: { kind: 'scores', mode: '1/1', picks: ['str', 'dex'] } }, srd, true);
    expect(n.hpGains).toEqual([6, 6, 6, 6, 6]);
    expect(derive(n, srd).maxHp - before).toBe(6 + Math.floor((n.abilities.con - 10) / 2));
  });

  it('sets the subclass at 3 and applies ASI, Expertise and Fighting Style', () => {
    const f = levelUp({ ...made('fighter'), level: 2 }, avg(3), srd, true);
    expect(f.subclass).toBe('champion');
    expect(f.features).toContain('Improved Critical');
    const p = levelUp(made('paladin'), { ...avg(2), fightingStyle: 'defense' }, srd, true);
    expect(p.feats).toContain('defense');
    const w = made('wizard');
    const skill = Object.keys(w.skills).find((k) => ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'].includes(k))!;
    expect(levelUp(w, { ...avg(2), expertise: [skill] }, srd, true).skills[skill as 'arcana']).toBe(2);
  });

  it('refuses an invalid draft', () => {
    expect(() => levelUp(made('fighter'), emptyLevelDraft(2), srd, true)).toThrow(LevelUpError);
  });

  it('a feat adds +1 to a score only when it raises scores and the score is one it may raise', () => {
    expect(boostFor(srd, 'alert', 'str')).toBeNull(); // no boost at all
    expect(boostFor(srd, 'grappler', 'str')).toBe('str');
    expect(boostFor(srd, 'grappler', 'wis')).toBeNull();
    expect(boostFor(srd, 'grappler', null)).toBeNull();
    const c = { ...made('wizard'), level: 3 };
    c.abilities.dex = 14;
    const n = levelUp(c, { ...avg(4), asi: { kind: 'feat', key: 'grappler', ability: 'dex' } }, srd, true);
    expect(n.abilities.dex).toBe(15);
  });
});

describe('every class to level 20', () => {
  for (const k of srd.classes.map((x) => x.key)) {
    it(k, () => {
      let c = made(k);
      for (let l = 2; l <= 20; l++) c = parseCharacter(levelUp(c, autoLevel(c, srd), srd, true));
      expect(c.level).toBe(20);
      expect(c.hpGains).toHaveLength(19);
      expect(Object.values(c.abilities).every((v) => v <= 30)).toBe(true);
      expect(c.features.length).toBeLessThanOrEqual(20000);
      expect(c.feats.some((f) => f.startsWith('boon-of-'))).toBe(true);
      expect(derive(c, srd).maxHp).toBeGreaterThan(0);
    });
  }
});

describe('features text and patches', () => {
  it('appends names only when the full text would pass the cap, and never passes it', () => {
    const long = 'x'.repeat(19990);
    expect(appendFeatures('', 'FULL', 'NAMES')).toBe('FULL');
    expect(appendFeatures(long, 'F'.repeat(50), 'NAMES')).toBe(`${long}\n\nNAMES`.slice(0, 20000));
    expect(appendFeatures(long, 'F'.repeat(50), 'N'.repeat(50)).length).toBe(20000);
  });

  it('diffOps writes changed leaves and whole arrays, and null for removed keys', () => {
    expect(diffOps({ a: 1, b: { c: 2, d: [1] }, e: 1 }, { a: 1, b: { c: 3, d: [1, 2] } })).toEqual([
      { path: ['b', 'c'], value: 3 }, { path: ['b', 'd'], value: [1, 2] }, { path: ['e'], value: null },
    ]);
  });
});
