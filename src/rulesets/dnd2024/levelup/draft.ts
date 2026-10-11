// What the player has picked for one level-up. Kept in localStorage per character (persist.ts), checked by
// validateLevel() and applied by levelUp(); the applied drafts are kept on the sheet in `choices.levels`.
import { z } from 'zod';
import { AbilityZ } from '../data/schema';

const AsiZ = z.discriminatedUnion('kind', [
  /** The Ability Score Improvement feat: +2 to one score ('2') or +1 to two ('1/1'). */
  z.object({ kind: z.literal('scores'), mode: z.enum(['2', '1/1']), picks: z.array(AbilityZ).max(2) }),
  /** Another general feat, and the score it raises when it raises one. */
  z.object({ kind: z.literal('feat'), key: z.string().nullable(), ability: AbilityZ.nullable() }),
]);

export const LevelDraftZ = z.object({
  v: z.literal(1).default(1),
  /** The level this draft takes the character to; a draft for another level is thrown away. */
  forLevel: z.number().int().min(2).max(20),
  hp: z.object({ method: z.enum(['average', 'roll']).nullable(), rolled: z.number().int().nullable() })
    .default(() => ({ method: null, rolled: null })),
  asi: AsiZ.nullable().default(null),
  boon: z.object({ key: z.string().nullable(), ability: AbilityZ.nullable() }).nullable().default(null),
  expertise: z.array(z.string()).default(() => []),
  fightingStyle: z.string().nullable().default(null),
  metamagic: z.array(z.string()).default(() => []),
  masteries: z.array(z.string()).default(() => []),
  invocations: z.array(z.string()).default(() => []),
});
export type LevelDraft = z.infer<typeof LevelDraftZ>;

export const emptyLevelDraft = (forLevel: number): LevelDraft => LevelDraftZ.parse({ forLevel });
