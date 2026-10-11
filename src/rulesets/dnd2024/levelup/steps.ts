// What the next level asks of the player, read from the class overlay and the SRD class table, and what is still
// open to pick. Pure; shared by validateLevel(), levelUp() and the step components.
import { z } from 'zod';
import { fightingStyleFeats } from '../builder/helpers';
import type { Srd } from '../data/schema';
import { martialProficient } from '../derive';
import type { Skill } from '../i18n/th';
import type { D2024 } from '../model';
import { CLASS_RULES, type ChoicePoint, type MasteryFilter } from '../overlay';
import { LevelDraftZ, type LevelDraft } from './draft';
import { invocationOpen, metamagicOptions, plainName } from './srdText';

export type LevelStepId = 'hp' | 'subclass' | 'asi' | 'boon' | 'class' | 'review';

export const classOfChar = (c: D2024, srd: Srd) => srd.classes.find((k) => k.key === c.classKey);
export const pointsAt = (c: D2024, level: number): ChoicePoint[] =>
  CLASS_RULES.find((r) => r.key === c.classKey)?.choices.filter((p) => p.level === level) ?? [];

const num = (s: string | undefined) => Number.parseInt(s ?? '', 10) || 0;
/** How much a class-table column grows on reaching `level`. */
const growth = (table: Record<string, string[]>, col: string, level: number) =>
  Math.max(0, num(table[col]?.[level - 1]) - num(table[col]?.[level - 2]));

export interface ClassPicks {
  expertise: number;
  expertiseFrom: Skill[] | null;
  fightingStyle: boolean;
  metamagic: number;
  masteries: number;
  masteryFilter: MasteryFilter;
  invocations: number;
}

/** The class-specific things reaching `level` adds: overlay choice points, and what grows in the class table. */
export function classPicks(c: D2024, srd: Srd, level: number): ClassPicks {
  const cls = classOfChar(c, srd);
  const pts = pointsAt(c, level);
  const exp = pts.find((p) => p.kind === 'expertise');
  const mastery = CLASS_RULES.find((r) => r.key === c.classKey)?.choices.find((p) => p.kind === 'masteries');
  return {
    expertise: exp?.kind === 'expertise' ? exp.count : 0,
    expertiseFrom: exp?.kind === 'expertise' ? exp.from ?? null : null,
    fightingStyle: pts.some((p) => p.kind === 'fightingStyle'),
    metamagic: pts.reduce((n, p) => n + (p.kind === 'metamagic' ? p.count : 0), 0),
    masteries: mastery && cls ? growth(cls.table, 'Weapon Mastery', level) : 0,
    masteryFilter: mastery?.kind === 'masteries' ? mastery.filter : 'any',
    invocations: cls ? growth(cls.table, 'Eldritch Invocations', level) : 0,
  };
}
const hasClassPicks = (p: ClassPicks) => p.fightingStyle || p.expertise + p.metamagic + p.masteries + p.invocations > 0;

/** The wizard steps for reaching level + 1, in order. */
export function levelSteps(c: D2024, srd: Srd): LevelStepId[] {
  const next = c.level + 1;
  const pts = pointsAt(c, next);
  const out: LevelStepId[] = ['hp'];
  if (pts.some((p) => p.kind === 'subclass')) out.push('subclass');
  if (pts.some((p) => p.kind === 'asi' && !p.epicBoon)) out.push('asi');
  if (pts.some((p) => p.kind === 'asi' && p.epicBoon)) out.push('boon');
  if (hasClassPicks(classPicks(c, srd, next))) out.push('class');
  out.push('review');
  return out;
}

// What the sheet records of earlier choices: the builder's draft (5a) and the level drafts (5b). A hand-made sheet
// has neither, and anything unreadable counts as nothing picked.
const PastZ = z.object({
  build: z.object({
    draft: z.object({
      masteries: z.array(z.string()).catch(() => []),
      invocations: z.array(z.string()).catch(() => []),
    }).catch(() => ({ masteries: [], invocations: [] })),
  }).optional().catch(undefined),
  // Each entry on its own: one unreadable level must not erase the history of the others.
  levels: z.array(z.unknown()).catch(() => [] as unknown[]),
});
const past = (c: D2024) => {
  const p = PastZ.parse(c.choices ?? {});
  return { ...p, levels: p.levels.flatMap((l) => { const r = LevelDraftZ.safeParse(l); return r.success ? [r.data] : []; }) };
};

export const pastLevels = (c: D2024): LevelDraft[] => past(c).levels;
/** The recorded levels exactly as stored, unreadable entries included, so recording a new level loses nothing. */
export const rawLevels = (c: D2024): unknown[] => PastZ.parse(c.choices ?? {}).levels;

export function pastPicks(c: D2024): { masteries: string[]; invocations: string[]; metamagic: string[] } {
  const p = past(c);
  return {
    masteries: [...(p.build?.draft.masteries ?? []), ...p.levels.flatMap((l) => l.masteries)],
    invocations: [...(p.build?.draft.invocations ?? []), ...p.levels.flatMap((l) => l.invocations)],
    metamagic: p.levels.flatMap((l) => l.metamagic),
  };
}

/** Skills the character is proficient in but not expert at, within `from` when the feature limits it. */
export const expertisePool = (c: D2024, from: Skill[] | null): string[] =>
  Object.entries(c.skills).filter(([k, r]) => r === 1 && (!from || from.includes(k as Skill))).map(([k]) => k);

export const fightingStylePool = (c: D2024, srd: Srd): string[] =>
  fightingStyleFeats(srd).map((f) => f.key).filter((k) => !c.feats.includes(k));

export const metamagicPool = (c: D2024, srd: Srd): string[] => {
  const known = pastPicks(c).metamagic;
  return metamagicOptions(srd).filter((m) => !known.includes(m));
};

export function masteryPool(c: D2024, srd: Srd, filter: MasteryFilter): string[] {
  const known = pastPicks(c).masteries;
  return srd.weapons
    .filter((w) => filter === 'any' || (filter === 'melee' ? !w.ranged : w.simple || martialProficient(c.classKey, w)))
    .map((w) => w.key)
    .filter((k) => !known.includes(k));
}

export function invocationPool(c: D2024, srd: Srd, level: number): string[] {
  const known = pastPicks(c).invocations;
  return (classOfChar(c, srd)?.invocations ?? [])
    .filter((i) => !known.includes(i.name) && invocationOpen(i.prerequisite, level, known))
    .map((i) => i.name);
}

/** A display label for an invocation or option name. */
export const label = plainName;
