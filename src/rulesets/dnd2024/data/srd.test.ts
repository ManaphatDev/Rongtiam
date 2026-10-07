import { describe, expect, it } from 'vitest';
import { BACKGROUNDS_TH, CLASSES_TH, SKILLS, SPECIES_TH } from '../i18n/th';
import { SrdZ } from './schema';
import raw from './srd.json';

const srd = SrdZ.parse(raw);
const cls = (k: string) => srd.classes.find((c) => c.key === k)!;
const weapon = (k: string) => srd.weapons.find((w) => w.key === k)!;
const armor = (k: string) => srd.armor.find((a) => a.key === k)!;

describe('SRD 5.2 dataset', () => {
  it('passes the schema and has the core content', () => {
    expect(srd.classes).toHaveLength(12);
    expect(srd.species).toHaveLength(9);
    expect(srd.backgrounds).toHaveLength(4);
    expect(srd.spells.length).toBeGreaterThan(300);
    expect(srd.source).toMatch(/CC-BY-4\.0/);
  });

  it('every class, species and background has a Thai name', () => {
    for (const c of srd.classes) expect(CLASSES_TH[c.key], c.key).toBeTruthy();
    for (const s of srd.species) expect(SPECIES_TH[s.key], s.key).toBeTruthy();
    for (const b of srd.backgrounds) expect(BACKGROUNDS_TH[b.key], b.key).toBeTruthy();
  });

  it('classes carry the numbers the sheet computes with', () => {
    expect(cls('fighter')).toMatchObject({ hitDie: 10, caster: 'none', spellAbility: null });
    expect([...cls('fighter').saves].sort()).toEqual(['con', 'str']);
    expect(cls('wizard')).toMatchObject({ hitDie: 6, caster: 'full', spellAbility: 'int' });
    expect(cls('wizard').table['1st'].slice(0, 5)).toEqual(['2', '3', '4', '4', '4']);
    expect(cls('wizard').table['3rd'][4]).toBe('2');
    expect(cls('warlock').caster).toBe('pact');
    expect(cls('paladin').caster).toBe('half');
    expect(cls('rogue').subclasses.map((s) => s.key)).toContain('thief');
    expect(cls('fighter').features.find((f) => /second wind/i.test(f.name))?.levels).toContain(1);
  });

  it('weapons and armor parse their properties', () => {
    expect(weapon('rapier')).toMatchObject({ simple: false, ranged: false, damage: '1d8', damageType: 'Piercing' });
    expect(weapon('rapier').properties).toContain('finesse');
    expect(weapon('dagger')).toMatchObject({ ranged: false, simple: true });
    expect(weapon('dagger').properties).toEqual(expect.arrayContaining(['finesse', 'light', 'thrown']));
    expect(weapon('longbow')).toMatchObject({ ranged: true, range: [150, 600] });
    expect(weapon('longsword').versatile).toBe('1d10');
    expect(armor('chain-mail')).toMatchObject({ category: 'heavy', base: 16, dex: false, strength: 13 });
    expect(armor('breastplate')).toMatchObject({ category: 'medium', base: 14, dex: true, cap: 2 });
    expect(armor('shield')).toMatchObject({ category: 'shield', base: 2 });
  });

  it('backgrounds give three abilities, a feat and two skills', () => {
    const acolyte = srd.backgrounds.find((b) => b.key === 'acolyte')!;
    expect(acolyte.abilities).toEqual(['int', 'wis', 'cha']);
    expect(acolyte.skills).toEqual(['insight', 'religion']);
    expect(acolyte.feat).toMatch(/Magic Initiate/);
  });

  it('every class has structured core traits and equipment sets ending in gold', () => {
    for (const c of srd.classes) {
      expect(c.skillChoice.count, c.key).toBeGreaterThan(0);
      for (const s of c.skillChoice.from) expect(Object.keys(SKILLS), `${c.key}: ${s}`).toContain(s);
      expect(c.equipmentOptions.length, c.key).toBeGreaterThanOrEqual(2);
      expect(c.equipmentOptions.at(-1)!.items, `${c.key}: last set is gold only`).toEqual([]);
      expect(c.training.weapons, c.key).toBeTruthy();
    }
    expect(cls('fighter').skillChoice.count).toBe(2);
    expect(cls('rogue').skillChoice.count).toBe(4);
    expect(cls('bard').skillChoice.from).toHaveLength(18);
    expect(cls('fighter').equipmentOptions[0]).toMatchObject({ id: 'A', gp: 4 });
    expect(cls('fighter').equipmentOptions[0].items[0]).toEqual({ name: 'Chain Mail', qty: 1, kind: 'armor', key: 'chain-mail' });
    expect(cls('fighter').equipmentOptions.map((o) => o.id)).toEqual(['A', 'B', 'C']);
    expect(cls('rogue').tools).toEqual({ fixed: ["Thieves' Tools"], choose: null });
    expect(cls('bard').tools.choose).toEqual({ count: 3, label: 'Musical Instruments' });
  });

  it('equipment weapons and armor point at real SRD items', () => {
    const sources = [...srd.classes.flatMap((c) => c.equipmentOptions), ...srd.backgrounds.flatMap((b) => b.equipmentOptions)];
    for (const o of sources) {
      for (const it of o.items) {
        if (it.kind === 'weapon') expect(srd.weapons.some((w) => w.key === it.key), it.name).toBe(true);
        if (it.kind === 'armor' || it.kind === 'shield') expect(srd.armor.some((a) => a.key === it.key), it.name).toBe(true);
      }
    }
  });

  it('backgrounds carry tools and equipment sets', () => {
    const soldier = srd.backgrounds.find((b) => b.key === 'soldier')!;
    expect(soldier.tools.choose).toEqual({ count: 1, label: 'Gaming Set' });
    expect(soldier.equipmentOptions.map((o) => o.id)).toEqual(['A', 'B']);
    expect(soldier.equipmentOptions[1]).toEqual({ id: 'B', items: [], gp: 50 });
    expect(srd.backgrounds.find((b) => b.key === 'criminal')!.tools.fixed).toEqual(["Thieves' Tools"]);
  });

  it('the Warlock lists invocations, five of them open at level 1', () => {
    const open = cls('warlock').invocations.filter((i) => !i.prerequisite).map((i) => i.name);
    expect(cls('warlock').invocations.length).toBeGreaterThan(20);
    expect(open).toEqual(['Armor of Shadows', 'Eldritch Mind', 'Pact of the Blade', 'Pact of the Chain', 'Pact of the Tome']);
    expect(cls('fighter').invocations).toEqual([]);
  });

  it('class feature levels carry the corrections Open5e needed', () => {
    const levels = (c: string, f: string) => cls(c).features.filter((x) => x.name === f).flatMap((x) => x.levels);
    expect(levels('bard', 'Bard Subclass')).toEqual([3]);
    expect(levels('bard', 'Expertise')).toEqual([2, 9]);
    expect(levels('sorcerer', 'Metamagic')).toEqual([2, 10, 17]);
  });
});
