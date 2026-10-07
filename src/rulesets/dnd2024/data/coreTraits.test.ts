import { describe, expect, it } from 'vitest';
import { SKILLS } from '../i18n/th';
import { parseEquipment, parseInvocations, parseSkillChoice, parseTools, repairText, tableRow } from './coreTraits';

const catalog = {
  weapons: [
    { key: 'greatsword', name: 'Greatsword' }, { key: 'javelin', name: 'Javelin' },
    { key: 'dagger', name: 'Dagger' }, { key: 'handaxe', name: 'Handaxe' },
  ],
  armor: [
    { key: 'chain-mail', name: 'Chain Mail' }, { key: 'leather-armor', name: 'Leather Armor' }, { key: 'shield', name: 'Shield' },
  ],
};

describe('tableRow', () => {
  it('reads one row of the markdown table', () => {
    const t = '|Primary Ability|Strength|\n|Skill Proficiencies|Choose 2: A, B|\n|Armor Training|Light armor|';
    expect(tableRow(t, 'Skill Proficiencies')).toBe('Choose 2: A, B');
    expect(tableRow(t, 'Armor Training')).toBe('Light armor');
    expect(tableRow(t, 'Tool Proficiencies')).toBeNull();
  });
});

describe('parseSkillChoice', () => {
  it('reads "Choose N: a, b, or c" into skill keys', () => {
    expect(parseSkillChoice('Choose 2: Animal Handling, Athletics, or Survival', SKILLS))
      .toEqual({ count: 2, from: ['animal-handling', 'athletics', 'survival'] });
  });
  it('reads "Choose any N skills" as every skill', () => {
    const r = parseSkillChoice('Choose any 3 skills', SKILLS)!;
    expect(r.count).toBe(3);
    expect(r.from).toHaveLength(18);
  });
  it('copes with words the PDF split in two', () => {
    expect(parseSkillChoice('Choose 2: Arcana, In sight, or Na ture', SKILLS)!.from).toEqual(['arcana', 'insight', 'nature']);
  });
  it('returns null for text it does not understand', () => {
    expect(parseSkillChoice('Choose 2: Arcana, Juggling', SKILLS)).toBeNull();
    expect(parseSkillChoice('whatever', SKILLS)).toBeNull();
  });
});

describe('parseTools', () => {
  it('reads fixed tools, choices and none', () => {
    expect(parseTools("Thieves' Tools")).toEqual({ fixed: ["Thieves' Tools"], choose: null });
    expect(parseTools('Choose 3 Musical Instruments')).toEqual({ fixed: [], choose: { count: 3, label: 'Musical Instruments' } });
    expect(parseTools('Choose one kind of Gaming Set')).toEqual({ fixed: [], choose: { count: 1, label: 'Gaming Set' } });
    expect(parseTools("Choose one type of Artisan's Tools or Musical Instrument"))
      .toEqual({ fixed: [], choose: { count: 1, label: "Artisan's Tools or Musical Instrument" } });
    expect(parseTools(null)).toEqual({ fixed: [], choose: null });
    expect(parseTools('None')).toEqual({ fixed: [], choose: null });
  });
});

describe('parseEquipment', () => {
  it('reads sets, quantities, gold, and ties weapons and armor to SRD keys', () => {
    const r = parseEquipment("Choose A or B: (A) Chain Mail, Greatsword, 8 Javelins, Dungeoneer's Pack, and 4 GP; or (B) 155 GP", catalog)!;
    expect(r).toEqual([
      {
        id: 'A', gp: 4,
        items: [
          { name: 'Chain Mail', qty: 1, kind: 'armor', key: 'chain-mail' },
          { name: 'Greatsword', qty: 1, kind: 'weapon', key: 'greatsword' },
          { name: 'Javelin', qty: 8, kind: 'weapon', key: 'javelin' },
          { name: "Dungeoneer's Pack", qty: 1, kind: 'gear' },
        ],
      },
      { id: 'B', gp: 155, items: [] },
    ]);
  });
  it('handles three sets, the background markup, a shield, and repairs split words', () => {
    const fixed = new Set<string>();
    const r = parseEquipment('*Choose A or B:* (A) Leather Ar mor, 2 Daggers, Shield, Ar cane Focus (orb), 15 GP; (B) 100 GP; or (C) 5 GP', catalog, fixed)!;
    expect(r.map((o) => o.id)).toEqual(['A', 'B', 'C']);
    expect(r[0].items).toEqual([
      { name: 'Leather Armor', qty: 1, kind: 'armor', key: 'leather-armor' },
      { name: 'Dagger', qty: 2, kind: 'weapon', key: 'dagger' },
      { name: 'Shield', qty: 1, kind: 'shield', key: 'shield' },
      { name: 'Arcane Focus (orb)', qty: 1, kind: 'gear' },
    ]);
    expect(r[0].gp).toBe(15);
    expect([...fixed].sort()).toEqual(['Ar cane → Arcane', 'Ar mor → Armor']);
  });
  it('returns null when a part is not a lettered set', () => {
    expect(parseEquipment('Choose something', catalog)).toBeNull();
    expect(parseEquipment('(A) Dagger; (Z) 5 GP', catalog)).toBeNull();
  });
});

describe('repairText', () => {
  it('fixes known split words and reports them', () => {
    const fixed = new Set<string>();
    expect(repairText('20 Ar rows', fixed)).toBe('20 Arrows');
    expect([...fixed]).toEqual(['Ar rows → Arrows']);
  });
});

describe('parseInvocations', () => {
  it('splits the options and reads prerequisites', () => {
    const text = '### Agonizing Blast\n\n*Prerequisite: Level 2+ Warlock*\n\nChoose one.\n\n### Armor of Shadows\n\nYou can cast Mage Armor.\n';
    expect(parseInvocations(text)).toEqual([
      { name: 'Agonizing Blast', prerequisite: 'Level 2+ Warlock' },
      { name: 'Armor of Shadows', prerequisite: null },
    ]);
  });
});
