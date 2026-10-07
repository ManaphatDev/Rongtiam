// The wizard's state: everything the player has picked so far. It is kept in localStorage (persist.ts), checked by
// validate(), and turned into a character by build(). Choices that depend on the class (skills, masteries...) are
// reset by the UI whenever the class changes; validate() and build() also ignore picks the class doesn't ask for.
import { z } from 'zod';
import { AbilityZ } from '../data/schema';
import { emptyScores } from './abilities';

/** What an Origin feat asks for: Magic Initiate's spell list and spells, Skilled's skills. */
export const FeatPicksZ = z.object({
  list: z.enum(['cleric', 'druid', 'wizard']).nullable(),
  cantrips: z.array(z.string()),
  spell: z.string().nullable(),
  skills: z.array(z.string()),
});
export type FeatPicks = z.infer<typeof FeatPicksZ>;
export const emptyPicks = (): FeatPicks => ({ list: null, cantrips: [], spell: null, skills: [] });

const ScoresZ = z.object({
  method: z.enum(['array', 'pointbuy', 'roll']),
  assign: z.partialRecord(AbilityZ, z.number().int().min(0).max(5)),
  base: z.record(AbilityZ, z.number().int()),
});
const AsiZ = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('2/1'), plus2: AbilityZ.nullable(), plus1: AbilityZ.nullable() }),
  z.object({ mode: z.literal('1/1/1') }),
]);

const strings = () => z.array(z.string()).default(() => []);
const maybe = () => z.string().nullable().default(null);

export const DraftZ = z.object({
  // class
  classKey: maybe(),
  classSkills: strings(),
  classTools: strings(),
  fightingStyle: maybe(),
  masteries: strings(),
  expertise: strings(),
  order: maybe(),
  invocations: strings(),
  // background
  background: maybe(),
  bgAsi: AsiZ.default(() => ({ mode: '2/1' as const, plus2: null, plus1: null })),
  bgTools: strings(),
  bgFeat: FeatPicksZ.default(emptyPicks),
  // species
  species: maybe(),
  speciesOptions: z.record(z.string(), z.string()).default(() => ({})),
  speciesSkill: maybe(),
  speciesFeat: maybe(),
  speciesFeatPicks: FeatPicksZ.default(emptyPicks),
  languages: strings(),
  // ability scores (the six rolled totals live apart from the method so switching method can't buy a re-roll)
  scores: ScoresZ.default(emptyScores),
  rolled: z.array(z.number().int()).length(6).nullable().default(null),
  // equipment, spells, details
  classEquip: maybe(),
  bgEquip: maybe(),
  cantrips: strings(),
  spells: strings(),
  name: z.string().max(60).default(''),
  notes: z.string().max(2000).default(''),
});
export type Draft = z.infer<typeof DraftZ>;

export const emptyDraft = (): Draft => DraftZ.parse({});
