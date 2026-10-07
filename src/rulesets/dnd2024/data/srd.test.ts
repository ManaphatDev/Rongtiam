import { describe, expect, it } from 'vitest';
import { BACKGROUNDS_TH, CLASSES_TH, SPECIES_TH } from '../i18n/th';
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
});
