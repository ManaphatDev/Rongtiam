// Everything computed from a D&D 2024 character: pure, so the sheet, token bars and rolls all agree.
import type { Srd, SrdWeapon } from './data/schema';
import { ABILITIES, SKILLS, type Ability, type Skill } from './i18n/th';
import type { D2024 } from './model';

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => Math.ceil(level / 4) + 1;
const fmt = (n: number) => (n === 0 ? '' : n > 0 ? `+${n}` : `${n}`);

export interface Attack {
  key: string;
  name: string;
  ability: Ability;
  proficient: boolean;
  toHit: number;
  /** Dice expressions ready for the dice roller. */
  damage: string;
  versatile: string | null;
  damageType: string;
  range: [number, number] | null;
  properties: string[];
  mastery: string | null;
}

/** A skill the room added (house rules), as the GM defined it. */
export interface RoomSkill {
  key: string;
  name: string;
  ability: Ability;
}

export interface ExtraSkill {
  /** `room:<key>` or `own:<id>`. */
  id: string;
  name: string;
  ability: Ability;
  rank: 0 | 1 | 2;
  bonus: number;
  source: 'room' | 'own';
}

export interface Derived {
  pb: number;
  mods: Record<Ability, number>;
  saves: Record<Ability, { bonus: number; proficient: boolean }>;
  skills: Record<Skill, { bonus: number; ability: Ability; rank: 0 | 1 | 2 }>;
  /** The room's skills, then this character's own. */
  extraSkills: ExtraSkill[];
  passivePerception: number;
  initiative: number;
  ac: number;
  maxHp: number;
  speed: number;
  hitDie: number;
  attacks: Attack[];
  spellcasting: null | {
    ability: Ability;
    dc: number;
    attack: number;
    /** Slots per spell level 1–9. */
    slots: number[];
    pact: { slots: number; level: number } | null;
    cantrips: number;
    prepared: number;
  };
}

/** Martial weapons each class is proficient with (everyone has Simple weapons). */
export function martialProficient(classKey: string, w: SrdWeapon) {
  if (['barbarian', 'fighter', 'paladin', 'ranger'].includes(classKey)) return true;
  if (classKey === 'rogue') return w.properties.includes('finesse') || w.properties.includes('light');
  if (classKey === 'monk') return w.properties.includes('light');
  return false;
}

const num = (s: string | undefined) => Number.parseInt(s ?? '', 10) || 0;

export function derive(c: D2024, srd: Srd, roomSkills: RoomSkill[] = []): Derived {
  const cls = srd.classes.find((x) => x.key === c.classKey);
  const species = srd.species.find((x) => x.key === c.species);
  const pb = proficiencyBonus(c.level);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, mod(c.abilities[a])])) as Record<Ability, number>;

  const saveProf = new Set<Ability>([...(cls?.saves ?? []), ...c.extraSaves]);
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, { bonus: mods[a] + (saveProf.has(a) ? pb : 0), proficient: saveProf.has(a) }])) as Derived['saves'];

  const skills = Object.fromEntries((Object.keys(SKILLS) as Skill[]).map((s) => {
    const rank = (c.skills[s] ?? 0) as 0 | 1 | 2;
    const ability = SKILLS[s].ability;
    return [s, { bonus: mods[ability] + pb * rank, ability, rank }];
  })) as Derived['skills'];

  const extraSkills: ExtraSkill[] = [
    ...roomSkills.map((s) => {
      const rank = (c.roomSkills[s.key] ?? 0) as 0 | 1 | 2;
      return { id: `room:${s.key}`, name: s.name, ability: s.ability, rank, bonus: mods[s.ability] + pb * rank, source: 'room' as const };
    }),
    ...c.customSkills.map((s) => ({ id: `own:${s.id}`, name: s.name, ability: s.ability, rank: s.rank, bonus: mods[s.ability] + pb * s.rank, source: 'own' as const })),
  ];

  // Armor Class: worn armor, or the class's Unarmored Defense, plus a shield.
  const armor = c.armor ? srd.armor.find((a) => a.key === c.armor && a.category !== 'shield') : undefined;
  let ac: number;
  if (armor) ac = armor.base + (armor.dex ? Math.min(mods.dex, armor.cap ?? Infinity) : 0);
  else if (c.classKey === 'barbarian') ac = 10 + mods.dex + mods.con;
  else if (c.classKey === 'monk' && !c.shield) ac = 10 + mods.dex + mods.wis;
  else ac = 10 + mods.dex;
  if (c.shield) ac += srd.armor.find((a) => a.category === 'shield')?.base ?? 2;

  // Hit points: the full die at 1st level, the fixed average after that, Constitution every level (at least 1).
  const hitDie = cls?.hitDie ?? 8;
  const perLevel = (die: number) => Math.max(1, die + mods.con);
  const maxHp = perLevel(hitDie) + (c.level - 1) * perLevel(hitDie / 2 + 1);

  let speed = species?.speed ?? 30;
  if (armor?.strength && c.abilities.str < armor.strength) speed -= 10;

  const attacks: Attack[] = c.weapons.flatMap((k) => {
    const w = srd.weapons.find((x) => x.key === k);
    if (!w) return [];
    const ability: Ability = w.ranged ? 'dex' : w.properties.includes('finesse') && mods.dex > mods.str ? 'dex' : 'str';
    const proficient = w.simple || martialProficient(c.classKey, w);
    const m = mods[ability];
    return [{
      key: w.key, name: w.name, ability, proficient,
      toHit: m + (proficient ? pb : 0),
      damage: `${w.damage}${fmt(m)}`,
      versatile: w.versatile ? `${w.versatile}${fmt(m)}` : null,
      damageType: w.damageType, range: w.range, properties: w.properties, mastery: w.mastery,
    }];
  });

  let spellcasting: Derived['spellcasting'] = null;
  if (cls?.spellAbility && cls.caster !== 'none') {
    const m = mods[cls.spellAbility];
    const at = (col: string) => cls.table[col]?.[c.level - 1];
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
    const pact = cls.caster === 'pact' ? { slots: num(at('Spell Slots')), level: num(at('Slot Level')) } : null;
    spellcasting = {
      ability: cls.spellAbility,
      dc: 8 + pb + m,
      attack: pb + m,
      slots: pact ? Array(9).fill(0) : ordinals.map((o) => num(at(o))),
      pact,
      cantrips: num(at('Cantrips')),
      prepared: num(at('Prepared Spells')),
    };
  }

  return {
    pb, mods, saves, skills, extraSkills,
    passivePerception: 10 + skills.perception.bonus,
    initiative: c.overrides.initiative ?? mods.dex,
    ac: c.overrides.ac ?? ac,
    maxHp: c.overrides.maxHp ?? maxHp,
    speed: c.overrides.speed ?? speed,
    hitDie, attacks, spellcasting,
  };
}
