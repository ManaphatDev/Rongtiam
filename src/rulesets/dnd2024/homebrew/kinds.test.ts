import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import {
  HB_KEY, HB_SCHEMAS, isHomebrew, kindOfRow, rowKind, slugKey, toSrdBackground, toSrdFeat, toSrdSpell, toSrdWeapon,
} from './kinds';

const srd = SrdZ.parse(raw);

export const sword = {
  name: 'Flame Tongue', simple: false, ranged: false, damage: '1d8', damageType: 'Slashing', properties: ['versatile'],
  versatile: '1d10', rangeNormal: null, rangeLong: null, mastery: 'Sap', bonus: 1,
};

describe('homebrew kinds', () => {
  it('maps row kinds both ways and recognises homebrew keys', () => {
    expect(rowKind('weapon')).toBe('hb-weapon');
    expect(kindOfRow('hb-background')).toBe('background');
    expect(kindOfRow('homebrew')).toBeNull();
    expect(kindOfRow('hb-class')).toBeNull();
    expect(isHomebrew('hb-x')).toBe(true);
    expect(isHomebrew('longsword')).toBe(false);
  });

  it('no SRD key starts with hb-', () => {
    const keys = [srd.weapons, srd.armor, srd.spells, srd.feats, srd.species, srd.backgrounds].flat().map((x) => x.key);
    expect(keys.filter(isHomebrew)).toEqual([]);
  });

  it('slugKey makes a fresh hb- key from a name', () => {
    expect(slugKey('Flame Tongue!', [])).toBe('hb-flame-tongue');
    expect(slugKey('Flame Tongue', ['hb-flame-tongue'])).toBe('hb-flame-tongue-2');
    expect(slugKey('ดาบไฟ', [])).toBe('hb-item');
    expect(HB_KEY.test(slugKey('x'.repeat(200), []))).toBe(true);
  });

  it('a weapon needs real dice and a bonus of 0..3', () => {
    expect(HB_SCHEMAS.weapon.safeParse(sword).success).toBe(true);
    expect(HB_SCHEMAS.weapon.safeParse({ ...sword, damage: 'lots' }).success).toBe(false);
    expect(HB_SCHEMAS.weapon.safeParse({ ...sword, bonus: 4 }).success).toBe(false);
    expect(HB_SCHEMAS.weapon.safeParse({ ...sword, name: '' }).success).toBe(false);
    expect(HB_SCHEMAS.weapon.safeParse({ ...sword, name: 'x'.repeat(81) }).success).toBe(false);
  });

  it('a weapon becomes an SRD weapon with a range tuple', () => {
    const d = HB_SCHEMAS.weapon.parse({ ...sword, ranged: true, rangeNormal: 30, rangeLong: 120 });
    expect(toSrdWeapon('hb-flame-tongue', d)).toMatchObject({ key: 'hb-flame-tongue', name: 'Flame Tongue', range: [30, 120], bonus: 1, properties: ['versatile'] });
    expect(SrdZ.shape.weapons.element.safeParse(toSrdWeapon('hb-x', HB_SCHEMAS.weapon.parse(sword))).success).toBe(true);
  });

  it('a feat keeps its structured boost and repeatable flag; no abilities means no boost', () => {
    const feat = { name: 'Lucky Star', type: 'general', prerequisite: null, desc: 'Shine.', repeatable: false, boostAbilities: ['wis'], boostMax: 20 };
    expect(toSrdFeat('hb-lucky', HB_SCHEMAS.feat.parse(feat))).toMatchObject({ key: 'hb-lucky', type: 'general', boost: { abilities: ['wis'], max: 20 }, repeatable: false });
    expect(toSrdFeat('hb-lucky', HB_SCHEMAS.feat.parse({ ...feat, boostAbilities: [] })).boost).toBeNull();
    expect(HB_SCHEMAS.feat.safeParse({ ...feat, type: 'class' }).success).toBe(false);
  });

  it('a background needs three different abilities and two different real skills', () => {
    const bg = {
      name: 'Sailor', abilities: ['str', 'dex', 'wis'], feat: 'alert', skills: ['athletics', 'perception'],
      toolsFixed: [{ name: "Navigator's Tools" }], toolsChooseCount: 0, toolsChooseLabel: null,
      gear: [{ name: 'Rope', qty: 1 }], gearGold: 10, gold: 50,
    };
    expect(HB_SCHEMAS.background.safeParse(bg).success).toBe(true);
    expect(HB_SCHEMAS.background.safeParse({ ...bg, abilities: ['str', 'str', 'wis'] }).success).toBe(false);
    expect(HB_SCHEMAS.background.safeParse({ ...bg, skills: ['athletics', 'flying'] }).success).toBe(false);
    const b = toSrdBackground('hb-sailor', HB_SCHEMAS.background.parse(bg), 'Alert');
    expect(b).toMatchObject({ key: 'hb-sailor', feat: 'Alert', skills: ['athletics', 'perception'], tools: { fixed: ["Navigator's Tools"], choose: null } });
    expect(b.equipmentOptions).toEqual([
      { id: 'A', items: [{ name: 'Rope', qty: 1, kind: 'gear' }], gp: 10 },
      { id: 'B', items: [], gp: 50 },
    ]);
    expect(SrdZ.shape.backgrounds.element.safeParse(b).success).toBe(true);
  });

  it('a spell lists only real class keys, and its damage type becomes lower case', () => {
    const spell = {
      name: 'Fire Bolt Plus', level: 0, school: 'Evocation', classes: ['wizard'], castingTime: '1 action', range: '120 feet',
      components: 'V, S', duration: 'Instantaneous', concentration: false, ritual: false, save: null, attack: true,
      damage: '1d10', damageType: 'Fire', desc: 'Hurl fire.', higher: null,
    };
    expect(HB_SCHEMAS.spell.safeParse(spell).success).toBe(true);
    expect(HB_SCHEMAS.spell.safeParse({ ...spell, classes: ['Wizard'] }).success).toBe(false);
    expect(HB_SCHEMAS.spell.safeParse({ ...spell, classes: [''] }).success).toBe(false);
    expect(HB_SCHEMAS.spell.safeParse({ ...spell, classes: [] }).success).toBe(false);
    const s = toSrdSpell('hb-fire-bolt-plus', HB_SCHEMAS.spell.parse(spell));
    expect(s).toMatchObject({ key: 'hb-fire-bolt-plus', classes: ['wizard'], damageTypes: ['fire'] });
    expect(SrdZ.shape.spells.element.safeParse(s).success).toBe(true);
  });
});
