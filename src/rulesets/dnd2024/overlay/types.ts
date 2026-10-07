// Hand-written rules data the SRD only gives as prose. Each decision names the SRD feature it comes from, and the
// overlay tests check that name (and the level) against srd.json, so a typo can't hide.
import type { Skill } from '../i18n/th';

/** Which weapons a Weapon Mastery pick may name: any Simple/Martial, only melee ones, or ones the class is proficient with. */
export type MasteryFilter = 'any' | 'melee' | 'proficient';

export type ChoiceBody =
  | { kind: 'fightingStyle' }
  | { kind: 'masteries'; filter: MasteryFilter; count: number }
  | { kind: 'expertise'; count: number }
  /** Divine Order, Primal Order. `extraCantrips` raises the number of cantrips the character picks. */
  | { kind: 'order'; options: { id: string; name: string; extraCantrips?: number }[] }
  | { kind: 'invocations'; count: number }
  | { kind: 'metamagic'; count: number }
  | { kind: 'subclass' }
  | { kind: 'asi'; epicBoon?: boolean };

export type ChoicePoint = { level: number; feature: string } & ChoiceBody;

export interface ClassRules {
  key: string;
  /** The decisions the player makes, by level (1-20). Counts that sit in the class table (cantrips, prepared spells) are read from it. */
  choices: ChoicePoint[];
  /** Spells in a level-1 spellbook (Wizard). */
  spellbook?: number;
}

export type SpeciesChoice =
  /** A lineage / ancestry / legacy: pick one named option of the trait. */
  | { id: string; kind: 'option'; trait: string; label: string; options: { id: string; name: string }[] }
  /** A skill proficiency: from a list, or any. */
  | { id: 'skill'; kind: 'skill'; trait: string; from: Skill[] | 'any' }
  /** An Origin feat of the player's choice. */
  | { id: 'feat'; kind: 'originFeat'; trait: string };

export interface SpeciesRules {
  key: string;
  choices: SpeciesChoice[];
}
