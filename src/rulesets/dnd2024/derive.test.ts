import { describe, expect, it } from 'vitest';
import { SrdZ } from './data/schema';
import raw from './data/srd.json';
import { derive, mod, proficiencyBonus } from './derive';
import { newCharacter, parseCharacter, type D2024 } from './model';

const srd = SrdZ.parse(raw);
const make = (patch: Partial<D2024>) => parseCharacter({ ...newCharacter(), ...patch });

describe('basics', () => {
  it('modifiers and proficiency bonus', () => {
    expect([1, 8, 9, 10, 11, 15, 20, 30].map(mod)).toEqual([-5, -1, -1, 0, 0, 2, 5, 10]);
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it('a new character is valid and parses old or partial data with defaults', () => {
    expect(parseCharacter(newCharacter()).level).toBe(1);
    const old = parseCharacter({ name: 'Old', abilities: { str: 14 } });
    expect(old.abilities).toEqual({ str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
    expect(old.hp.current).toBe(0);
    expect(() => parseCharacter({ level: 99 })).toThrow();
  });
});

describe('golden characters', () => {
  it('Fighter 1 in chain mail with a shield', () => {
    const d = derive(make({
      name: 'Brakka', classKey: 'fighter', level: 1, species: 'human', background: 'soldier',
      abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 13, cha: 10 },
      skills: { athletics: 1, intimidation: 1 }, armor: 'chain-mail', shield: true, weapons: ['longsword', 'longbow'],
    }), srd);
    expect(d.ac).toBe(18);
    expect(d.maxHp).toBe(12);
    expect(d.pb).toBe(2);
    expect(d.saves).toMatchObject({ str: { bonus: 5, proficient: true }, con: { bonus: 4, proficient: true }, dex: { bonus: 1, proficient: false } });
    expect(d.skills.athletics.bonus).toBe(5);
    expect(d.initiative).toBe(1);
    expect(d.speed).toBe(30);
    expect(d.spellcasting).toBeNull();
    const longsword = d.attacks.find((a) => a.key === 'longsword')!;
    expect(longsword).toMatchObject({ toHit: 5, damage: '1d8+3', versatile: '1d10+3', ability: 'str' });
    const longbow = d.attacks.find((a) => a.key === 'longbow')!;
    expect(longbow).toMatchObject({ toHit: 3, damage: '1d8+1', ability: 'dex' });
  });

  it('Wizard 5 has 4/3/2 slots and the right save DC', () => {
    const d = derive(make({
      name: 'Ilse', classKey: 'wizard', level: 5, species: 'elf', background: 'sage',
      abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 },
    }), srd);
    expect(d.spellcasting).toMatchObject({ ability: 'int', dc: 15, attack: 7, slots: [4, 3, 2, 0, 0, 0, 0, 0, 0] });
    expect(d.maxHp).toBe(32); // 6 + 2 at 1st, then 4 levels × (4 + 2)
    expect(d.ac).toBe(12);
    expect(d.pb).toBe(3);
    expect(d.saves.int).toMatchObject({ bonus: 7, proficient: true });
  });

  it('Rogue 3 with Expertise doubles the proficiency bonus', () => {
    const d = derive(make({
      name: 'Pip', classKey: 'rogue', level: 3, species: 'halfling', background: 'criminal',
      abilities: { str: 10, dex: 17, con: 12, int: 13, wis: 12, cha: 14 },
      skills: { stealth: 2, 'sleight-of-hand': 2, perception: 1, deception: 1 }, armor: 'leather-armor', weapons: ['rapier', 'shortbow'],
    }), srd);
    expect(d.skills.stealth.bonus).toBe(7);
    expect(d.skills.perception.bonus).toBe(3);
    expect(d.skills.athletics.bonus).toBe(0);
    expect(d.passivePerception).toBe(13);
    expect(d.ac).toBe(14);
    expect(d.attacks.find((a) => a.key === 'rapier')).toMatchObject({ ability: 'dex', toHit: 5, damage: '1d8+3' });
  });

  it('Monk 2 unarmored adds Wisdom to AC, but not with a shield', () => {
    const base = {
      name: 'Sen', classKey: 'monk', level: 2, species: 'human', background: 'acolyte',
      abilities: { str: 10, dex: 16, con: 13, int: 10, wis: 15, cha: 8 },
    } as const;
    expect(derive(make(base), srd).ac).toBe(15);
    expect(derive(make({ ...base, shield: true }), srd).ac).toBe(15); // 10 + 3 + 2 (shield), Unarmored Defense lost
    expect(derive(make(base), srd).maxHp).toBe(8 + 1 + 5 + 1);
  });

  it('Barbarian Unarmored Defense keeps working with a shield', () => {
    const d = derive(make({
      name: 'Ruk', classKey: 'barbarian', level: 1, abilities: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 10 }, shield: true,
    }), srd);
    expect(d.ac).toBe(10 + 2 + 3 + 2);
  });

  it('medium armor caps Dexterity at +2; heavy armor without the Strength slows you', () => {
    const d = derive(make({ abilities: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 }, armor: 'breastplate' }), srd);
    expect(d.ac).toBe(16);
    const slow = derive(make({ abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, armor: 'plate-armor' }), srd);
    expect(slow.ac).toBe(18);
    expect(slow.speed).toBe(20);
  });

  it('manual overrides win over computed values', () => {
    const d = derive(make({ overrides: { ac: 21, maxHp: 99, speed: 40, initiative: 7 } }), srd);
    expect([d.ac, d.maxHp, d.speed, d.initiative]).toEqual([21, 99, 40, 7]);
  });

  it('Warlock pact slots come from the pact columns', () => {
    const d = derive(make({ classKey: 'warlock', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } }), srd);
    expect(d.spellcasting).toMatchObject({ ability: 'cha', dc: 15, pact: { slots: 2, level: 3 } });
  });
});

describe('room and personal skills', () => {
  const roomSkills = [{ key: 'piloting', name: 'ขับยาน', ability: 'dex' as const }];
  const c = make({
    level: 5, abilities: { str: 10, dex: 16, con: 10, int: 14, wis: 10, cha: 10 },
    roomSkills: { piloting: 2 },
    customSkills: [{ id: 'a1', name: 'ดนตรีพื้นบ้าน', ability: 'cha', rank: 1 }, { id: 'a2', name: 'ตำราโบราณ', ability: 'int', rank: 0 }],
  });

  it('room skills use the chosen ability and the character\'s rank', () => {
    const d = derive(c, srd, roomSkills);
    expect(d.extraSkills.find((s) => s.id === 'room:piloting')).toMatchObject({ name: 'ขับยาน', ability: 'dex', rank: 2, bonus: 3 + 3 * 2, source: 'room' });
  });

  it('personal skills work the same way and stay with the character', () => {
    const d = derive(c, srd, roomSkills);
    expect(d.extraSkills.find((s) => s.id === 'own:a1')).toMatchObject({ name: 'ดนตรีพื้นบ้าน', ability: 'cha', rank: 1, bonus: 0 + 3, source: 'own' });
    expect(d.extraSkills.find((s) => s.id === 'own:a2')?.bonus).toBe(2);
  });

  it('a room skill the character has no rank in is untrained; a removed room skill disappears', () => {
    expect(derive(make({}), srd, roomSkills).extraSkills[0]).toMatchObject({ rank: 0, bonus: 0 });
    expect(derive(c, srd, []).extraSkills.map((s) => s.id)).toEqual(['own:a1', 'own:a2']);
  });
});
