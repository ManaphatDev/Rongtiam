// Test fixture: a valid level-up draft for any character, taking the first open option everywhere. Not imported
// by the app.
import type { Srd } from '../data/schema';
import { ABILITIES, type Ability } from '../i18n/th';
import type { D2024 } from '../model';
import { emptyLevelDraft, type LevelDraft } from './draft';
import { featBoost, meetsPrerequisite } from './srdText';
import {
  classPicks, expertisePool, fightingStylePool, invocationPool, levelSteps, masteryPool, metamagicPool,
} from './steps';
import { epicBoons, isCaster, needed } from './validate';

/** The abilities from lowest to highest, among those that can still take `by` without passing `max`. */
const lowest = (c: D2024, by: number, max: number): Ability[] =>
  [...ABILITIES].filter((a) => c.abilities[a] + by <= max).sort((a, b) => c.abilities[a] - c.abilities[b]);

export function autoLevel(c: D2024, srd: Srd): LevelDraft {
  const next = c.level + 1;
  const d = emptyLevelDraft(next);
  d.hp = { method: 'average', rolled: null };
  const steps = levelSteps(c, srd);
  if (steps.includes('asi')) d.asi = { kind: 'scores', mode: '1/1', picks: lowest(c, 1, 20).slice(0, 2) };
  if (steps.includes('boon')) {
    const boon = epicBoons(srd).find((b) => !c.feats.includes(b.key) && meetsPrerequisite(b.prerequisite, next, c.abilities, isCaster(c, srd)))!;
    const max = featBoost(boon.desc)?.max ?? 30;
    d.boon = { key: boon.key, ability: lowest(c, 1, max)[0] ?? null };
  }
  if (steps.includes('class')) {
    const p = classPicks(c, srd, next);
    const take = (count: number, pool: string[]) => pool.slice(0, needed(count, pool));
    d.expertise = take(p.expertise, expertisePool(c, p.expertiseFrom));
    if (p.fightingStyle) d.fightingStyle = fightingStylePool(c, srd)[0] ?? null;
    d.metamagic = take(p.metamagic, metamagicPool(c, srd));
    d.masteries = take(p.masteries, masteryPool(c, srd, p.masteryFilter));
    d.invocations = take(p.invocations, invocationPool(c, srd, next));
  }
  return d;
}
