import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { derive } from '../derive';
import { parseCharacter } from '../model';
import { pointBuyStart } from './abilities';
import { build, BuildError } from './build';
import { emptyDraft, type Draft } from './draft';
import { merge } from '../homebrew/merge';
import { autoDraft } from './fixtures';
import { validate } from './validate';

const srd = SrdZ.parse(raw);

function fighter(): Draft {
  const d = emptyDraft();
  Object.assign(d, {
    name: ' Rook ', classKey: 'fighter', background: 'soldier', species: 'human',
    classSkills: ['acrobatics', 'history'], fightingStyle: 'defense', masteries: ['greatsword', 'longsword', 'handaxe'],
    bgAsi: { mode: '2/1', plus2: 'str', plus1: 'con' }, bgTools: ['Dice Set'],
    speciesSkill: 'perception', speciesFeat: 'alert', languages: ['Dwarvish', 'Elvish'],
    scores: { method: 'array', assign: { str: 0, con: 1, dex: 2, wis: 3, int: 4, cha: 5 }, base: pointBuyStart() },
    classEquip: 'A', bgEquip: 'A',
  });
  return d;
}

function wizard(): Draft {
  const d = emptyDraft();
  Object.assign(d, {
    name: 'Mira', classKey: 'wizard', background: 'sage', species: 'elf',
    classSkills: ['investigation', 'medicine'],
    bgAsi: { mode: '2/1', plus2: 'int', plus1: 'con' },
    bgFeat: { list: null, cantrips: ['elementalism', 'fire-bolt'], spell: 'mage-armor', skills: [] },
    speciesOptions: { lineage: 'high-elf' }, speciesSkill: 'perception', languages: ['Elvish', 'Gnomish'],
    scores: { method: 'array', assign: { int: 0, con: 1, dex: 2, wis: 3, cha: 4, str: 5 }, base: pointBuyStart() },
    classEquip: 'A', bgEquip: 'A',
    cantrips: ['acid-splash', 'chill-touch', 'dancing-lights'],
    spells: ['alarm', 'burning-hands', 'charm-person', 'chromatic-orb', 'color-spray', 'comprehend-languages'],
  });
  return d;
}

function rogue(): Draft {
  const d = emptyDraft();
  Object.assign(d, {
    name: 'Vex', classKey: 'rogue', background: 'criminal', species: 'human',
    classSkills: ['acrobatics', 'athletics', 'deception', 'insight'], expertise: ['stealth', 'sleight-of-hand'],
    masteries: ['dagger', 'shortsword'], bgAsi: { mode: '1/1/1' }, speciesSkill: 'perception', speciesFeat: 'savage-attacker',
    languages: ['Giant', 'Goblin', 'Orc'],
    scores: { method: 'array', assign: { dex: 0, con: 1, int: 2, wis: 3, cha: 4, str: 5 }, base: pointBuyStart() },
    classEquip: 'A', bgEquip: 'A',
  });
  return d;
}

describe('build: languages the class grants', () => {
  it('a Rogue knows Thieves Cant, a Druid Druidic', () => {
    expect(build(autoDraft(srd, 'rogue', 'criminal', 'human'), srd).languages).toEqual(['Common', "Thieves' Cant", 'Common Sign Language', 'Draconic', 'Dwarvish']);
    expect(build(autoDraft(srd, 'druid', 'acolyte', 'human'), srd).languages).toEqual(['Common', 'Druidic', 'Common Sign Language', 'Draconic']);
    expect(build(autoDraft(srd, 'fighter', 'soldier', 'human'), srd).languages).toEqual(['Common', 'Common Sign Language', 'Draconic']);
  });
});

describe('build: a feat taken twice', () => {
  it('a Human Acolyte can take Magic Initiate again with another list; both land on the sheet', () => {
    const d = autoDraft(srd, 'fighter', 'acolyte', 'human');
    d.speciesFeat = 'magic-initiate';
    d.speciesFeatPicks = { list: 'wizard', cantrips: ['fire-bolt', 'light'], spell: 'mage-armor', skills: [] };
    const c = build(d, srd);
    expect(c.feats.filter((k) => k === 'magic-initiate')).toHaveLength(2);
    expect(c.features).toContain('Fire Bolt, Light');
    expect(c.features).toContain('Mage Armor');
  });
});

describe('build: picks left over from an earlier choice', () => {
  it('tools picked for a class or background that no longer asks for them are not kept', () => {
    const d = autoDraft(srd, 'fighter', 'acolyte', 'human');
    const before = build(d, srd).tools;
    d.classTools = ['Lute']; // the Fighter has no tool choice (the draft was a Bard before)
    d.bgTools = ['Flute']; // neither has the Acolyte
    expect(build(d, srd).tools).toEqual(before);
  });
});

describe('build: golden characters', () => {
  it('Fighter with chain mail', () => {
    const c = build(fighter(), srd);
    expect(c).toMatchObject({ name: 'Rook', classKey: 'fighter', level: 1, species: 'human', background: 'soldier', armor: 'chain-mail', shield: false });
    expect(c.abilities).toEqual({ str: 17, dex: 13, con: 15, int: 10, wis: 12, cha: 8 });
    expect(Object.keys(c.skills).sort()).toEqual(['acrobatics', 'athletics', 'history', 'intimidation', 'perception']);
    expect(c.weapons).toEqual(['greatsword', 'flail', 'javelin', 'spear', 'shortbow']);
    expect(c.money.gp).toBe(18);
    expect(c.feats).toEqual(['savage-attacker', 'alert', 'defense']);
    expect(c.languages).toEqual(['Common', 'Dwarvish', 'Elvish']);
    expect(c.tools).toEqual(['Dice Set']);
    expect(c.inventory.find((l) => l.name === 'Javelin')).toEqual({ name: 'Javelin', qty: 8, note: '' });
    const dv = derive(c, srd);
    expect(dv).toMatchObject({ ac: 16, maxHp: 12, pb: 2, speed: 30 });
    expect(c.hp.current).toBe(12);
    expect(dv.saves.str).toEqual({ bonus: 5, proficient: true });
    expect(dv.saves.con).toEqual({ bonus: 4, proficient: true });
    expect(dv.skills.athletics.bonus).toBe(5);
    expect(c.features).toContain('Second Wind');
    expect(c.features).toContain('Weapon Mastery: Greatsword, Longsword, Handaxe');
    expect(() => parseCharacter(c)).not.toThrow();
  });

  it('Wizard with a spellbook and Magic Initiate', () => {
    const c = build(wizard(), srd);
    expect(c.abilities).toEqual({ str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 });
    expect(c.spells.known).toEqual([...wizard().cantrips, ...wizard().spells]);
    expect(c.weapons).toEqual(['dagger', 'quarterstaff']);
    expect(c.inventory.find((l) => l.name === 'Robe')?.qty).toBe(2); // the class kit and the background kit both have one
    expect(c.inventory.find((l) => l.name === 'Dagger')?.qty).toBe(2);
    expect(c.money.gp).toBe(13);
    expect(c.tools).toEqual(["Calligrapher's Supplies"]);
    expect(c.feats).toEqual(['magic-initiate']);
    const dv = derive(c, srd);
    expect(dv).toMatchObject({ ac: 11, maxHp: 8 });
    expect(dv.spellcasting).toMatchObject({ dc: 13, attack: 5, cantrips: 3 });
    expect(dv.spellcasting!.slots[0]).toBe(2);
    expect(dv.saves.int).toEqual({ bonus: 5, proficient: true });
    expect(dv.saves.wis).toEqual({ bonus: 3, proficient: true });
    expect(c.features).toContain('High Elf');
    expect(c.features).toContain('Elementalism, Fire Bolt');
    expect(c.features).toContain('Mage Armor');
  });

  it('Rogue: Expertise doubles the bonus; tools and kit items from two sources merge', () => {
    const c = build(rogue(), srd);
    expect(c.skills.stealth).toBe(2);
    expect(c.skills['sleight-of-hand']).toBe(2);
    expect(c.skills.acrobatics).toBe(1);
    expect(c.tools).toEqual(["Thieves' Tools"]);
    expect(c.inventory.find((l) => l.name === "Thieves' Tools")?.qty).toBe(2);
    expect(c.inventory.find((l) => l.name === 'Dagger')?.qty).toBe(4);
    expect(c.money.gp).toBe(24);
    const dv = derive(c, srd);
    expect(dv).toMatchObject({ ac: 14, maxHp: 10 });
    expect(dv.skills.stealth.bonus).toBe(3 + 2 * 2);
  });

  it('Barbarian without armor uses Unarmored Defense', () => {
    const d = autoDraft(srd, 'barbarian', 'soldier', 'human');
    d.classEquip = 'B';
    const c = build(d, srd);
    expect(c.armor).toBeNull();
    const dv = derive(c, srd);
    expect(dv.ac).toBe(10 + dv.mods.dex + dv.mods.con);
  });
});

describe('build: refusing and ignoring', () => {
  it('refuses an incomplete draft and says why', () => {
    expect(() => build(emptyDraft(), srd)).toThrow(BuildError);
    try {
      build(emptyDraft(), srd);
    } catch (e) {
      expect((e as BuildError).issues.length).toBeGreaterThan(3);
      expect((e as BuildError).message).toContain('เลือกอาชีพ');
    }
  });

  it('refuses a skill granted twice', () => {
    const d = fighter();
    d.classSkills = ['athletics', 'history']; // Soldier already gives Athletics
    expect(validate(d, srd).length).toBeGreaterThan(0);
    expect(() => build(d, srd)).toThrow(BuildError);
  });

  it('ignores picks that belong to decisions the class does not have', () => {
    const d = fighter();
    d.order = 'protector';
    d.expertise = ['athletics'];
    d.invocations = ['Armor of Shadows'];
    const c = build(d, srd);
    expect(c.skills.athletics).toBe(1);
    expect(c.features).not.toContain('Divine Order');
    expect(c.features).not.toContain('Armor of Shadows');
  });

  it('trims tool names and drops repeats between the class and the background', () => {
    const d = autoDraft(srd, 'bard', 'criminal', 'human');
    d.classTools = [' Lute ', 'Flute', 'Drum'];
    expect(build(d, srd).tools).toEqual(['Lute', 'Flute', 'Drum', "Thieves' Tools"]);
  });

  it('keeps the draft it was built from', () => {
    const c = build(fighter(), srd);
    expect(c.choices.build).toMatchObject({ v: 1, draft: { classKey: 'fighter', background: 'soldier', species: 'human' } });
  });
});

describe('build: every combination', () => {
  it('builds, parses and derives for every class × background × species', () => {
    for (const cls of srd.classes) for (const bg of srd.backgrounds) for (const sp of srd.species) {
      const label = `${cls.key}/${bg.key}/${sp.key}`;
      const d = autoDraft(srd, cls.key, bg.key, sp.key);
      expect(validate(d, srd), label).toEqual([]);
      const c = build(d, srd);
      expect(() => parseCharacter(c), label).not.toThrow();
      const dv = derive(c, srd);
      expect(c.level, label).toBe(1);
      expect(dv.ac, label).toBeGreaterThanOrEqual(10);
      expect(c.hp.current, label).toBe(dv.maxHp);
      expect(c.features.length, label).toBeLessThanOrEqual(20000);
    }
  }, 60_000);
});

describe('build: start level', () => {
  it('a draft that starts above level 1 is built at 1 with the allowance set', () => {
    const d = autoDraft(srd, 'fighter', 'soldier', 'human');
    expect(build(d, srd).levelAllowed).toBeNull();
    d.startLevel = 5;
    const c = build(d, srd);
    expect(c.level).toBe(1);
    expect(c.levelAllowed).toBe(5);
  });
});

describe('build: homebrew species and background', () => {
  const room = merge(srd, [
    { kind: 'hb-feat', key: 'hb-lucky', data: { name: 'Lucky Star', type: 'origin', prerequisite: null, desc: 'Shine.', repeatable: false, boostAbilities: [], boostMax: 20 } },
    { kind: 'hb-species', key: 'hb-merfolk', data: { name: 'Merfolk', size: 'Medium', speed: 30, traits: [{ name: 'Gills', desc: 'Breathe water.' }] } },
    { kind: 'hb-background', key: 'hb-sailor', data: {
      name: 'Sailor', abilities: ['str', 'dex', 'wis'], feat: 'hb-lucky', skills: ['athletics', 'perception'],
      toolsFixed: [{ name: "Navigator's Tools" }], toolsChooseCount: 0, toolsChooseLabel: null,
      gear: [{ name: 'Rope', qty: 1 }], gearGold: 10, gold: 50,
    } },
  ]).srd;

  it('a Fighter with a homebrew species and background is valid and builds', () => {
    const d = autoDraft(room, 'fighter', 'hb-sailor', 'hb-merfolk');
    expect(validate(d, room)).toEqual([]);
    const c = build(d, room);
    expect(c).toMatchObject({ species: 'hb-merfolk', background: 'hb-sailor' });
    expect(c.feats).toContain('hb-lucky');
    expect(c.tools).toContain("Navigator's Tools");
    expect(c.features).toContain('Gills');
  });

  const bgData = (name: string, feat: string) => ({
    name, abilities: ['str', 'dex', 'wis'], feat, skills: ['athletics', 'perception'],
    toolsFixed: [], toolsChooseCount: 0, toolsChooseLabel: null, gear: [{ name: 'Rope', qty: 1 }], gearGold: 10, gold: 50,
  });
  const originFeat = (name: string) => ({ name, type: 'origin', prerequisite: null, desc: 'Shine.', repeatable: false, boostAbilities: [], boostMax: 20 });

  it('an Origin feat whose name has a parenthesis still builds (the background keeps the feat key)', () => {
    const r = merge(srd, [
      { kind: 'hb-feat', key: 'hb-sea-luck', data: originFeat('Sea Luck (Minor)') },
      { kind: 'hb-background', key: 'hb-deckhand', data: bgData('Deckhand', 'hb-sea-luck') },
    ]).srd;
    const d = autoDraft(r, 'fighter', 'hb-deckhand', 'human');
    expect(validate(d, r)).toEqual([]);
    expect(build(d, r).feats).toContain('hb-sea-luck');
  });

  it('a homebrew Origin feat named like an SRD feat is the one the character gets', () => {
    const r = merge(srd, [
      { kind: 'hb-feat', key: 'hb-alert', data: originFeat('Alert') },
      { kind: 'hb-background', key: 'hb-lookout', data: bgData('Lookout', 'hb-alert') },
    ]).srd;
    const d = autoDraft(r, 'fighter', 'hb-lookout', 'elf');
    expect(validate(d, r)).toEqual([]);
    const feats = build(d, r).feats;
    expect(feats).toContain('hb-alert');
    expect(feats).not.toContain('alert');
  });
});
