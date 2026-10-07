// Reading a Draft against the SRD and the overlay: which class, background and species it names, which skills it
// grants, how many spells it should pick. Pure; shared by validate(), build() and the step components.
import type { Srd, SrdWeapon } from '../data/schema';
import { martialProficient } from '../derive';
import type { Ability } from '../i18n/th';
import { CLASS_RULES, SPECIES_RULES, type ChoicePoint, type MasteryFilter } from '../overlay';
import { baseScores } from './abilities';
import type { Draft } from './draft';

export type FeatList = 'cleric' | 'druid' | 'wizard';
export const FEAT_LISTS: FeatList[] = ['cleric', 'druid', 'wizard'];

/** An Origin feat as a background or species names it. `list` is Magic Initiate's spell list when it is fixed. */
export interface FeatRef { key: string; name: string; list: FeatList | null }

export const classOf = (d: Draft, srd: Srd) => srd.classes.find((c) => c.key === d.classKey);
export const backgroundOf = (d: Draft, srd: Srd) => srd.backgrounds.find((b) => b.key === d.background);
export const speciesOf = (d: Draft, srd: Srd) => srd.species.find((s) => s.key === d.species);
export const classRulesOf = (d: Draft) => CLASS_RULES.find((r) => r.key === d.classKey);
export const speciesRulesOf = (d: Draft) => SPECIES_RULES.find((r) => r.key === d.species);

/** "Magic Initiate (Cleric)" → the feat and its fixed list. */
export function featRef(text: string, srd: Srd): FeatRef | null {
  const feat = srd.feats.find((f) => f.name === text.split('(')[0].trim());
  if (!feat) return null;
  const inner = /\((.+)\)/.exec(text)?.[1]?.trim().toLowerCase();
  return { key: feat.key, name: feat.name, list: FEAT_LISTS.find((l) => l === inner) ?? null };
}
export const backgroundFeat = (d: Draft, srd: Srd) => {
  const bg = backgroundOf(d, srd);
  return bg ? featRef(bg.feat, srd) : null;
};
export const speciesFeatRef = (d: Draft, srd: Srd): FeatRef | null => {
  const f = srd.feats.find((x) => x.key === d.speciesFeat);
  return f ? { key: f.key, name: f.name, list: null } : null;
};
export const originFeats = (srd: Srd) => srd.feats.filter((f) => f.type === 'origin');
export const fightingStyleFeats = (srd: Srd) => srd.feats.filter((f) => f.type === 'fighting style');

/** The class's level-1 decisions. */
export const level1Points = (d: Draft): ChoicePoint[] => classRulesOf(d)?.choices.filter((p) => p.level === 1) ?? [];

export interface SkillSources { bg: string[]; cls: string[]; sp: string[]; feat: string[] }
/**
 * Where each skill proficiency comes from, in priority order: the background's fixed skills win over the class's
 * picks, which win over the species skill, which wins over Skilled. A pick that repeats a higher one is a clash.
 */
export function skillSources(d: Draft, srd: Srd): SkillSources {
  const species = speciesRulesOf(d);
  return {
    bg: backgroundOf(d, srd)?.skills ?? [],
    cls: classOf(d, srd) ? d.classSkills : [],
    sp: species?.choices.some((c) => c.kind === 'skill') && d.speciesSkill ? [d.speciesSkill] : [],
    feat: species?.choices.some((c) => c.kind === 'originFeat') && d.speciesFeat === 'skilled' ? d.speciesFeatPicks.skills : [],
  };
}
export const proficientSkills = (d: Draft, srd: Srd): string[] => [...new Set(Object.values(skillSources(d, srd)).flat())];

/** The six scores after the background's bonus; null while the scores or the background are incomplete. */
export function finalAbilities(d: Draft, srd: Srd): Record<Ability, number> | null {
  const base = baseScores(d.scores, d.rolled);
  const bg = backgroundOf(d, srd);
  if (!base || !bg) return null;
  const out = { ...base };
  if (d.bgAsi.mode === '1/1/1') for (const a of bg.abilities) out[a] += 1;
  else if (d.bgAsi.plus2 && d.bgAsi.plus1) {
    out[d.bgAsi.plus2] += 2;
    out[d.bgAsi.plus1] += 1;
  }
  return out;
}

const num = (s: string | undefined) => Number.parseInt(s ?? '', 10) || 0;

/** Cantrips to pick: the class table's level-1 value, plus what a chosen order adds (Thaumaturge, Magician). */
export function cantripTarget(d: Draft, srd: Srd): number {
  const cls = classOf(d, srd);
  if (!cls) return 0;
  const order = level1Points(d).find((p) => p.kind === 'order');
  const extra = order?.kind === 'order' ? order.options.find((o) => o.id === d.order)?.extraCantrips ?? 0 : 0;
  return num(cls.table['Cantrips']?.[0]) + extra;
}
/** Level-1 spells to pick: the table's prepared spells, or the Wizard's spellbook. */
export function spellTarget(d: Draft, srd: Srd): number {
  const cls = classOf(d, srd);
  return cls ? classRulesOf(d)?.spellbook ?? num(cls.table['Prepared Spells']?.[0]) : 0;
}
export const needsSpellStep = (d: Draft, srd: Srd) => cantripTarget(d, srd) + spellTarget(d, srd) > 0;
export const listSpells = (list: string, level: 0 | 1, srd: Srd) => srd.spells.filter((s) => s.classes.includes(list) && s.level === level);
export const classSpells = (d: Draft, srd: Srd, level: 0 | 1) => listSpells(d.classKey ?? '', level, srd);

/** Weapons a Weapon Mastery pick may name. */
export function weaponPool(d: Draft, srd: Srd, filter: MasteryFilter): SrdWeapon[] {
  return srd.weapons.filter((w) => filter === 'any' || (filter === 'melee' ? !w.ranged : w.simple || martialProficient(d.classKey ?? '', w)));
}
