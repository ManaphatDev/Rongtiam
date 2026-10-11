// Applies one checked level-up draft to a character, touching only what a level changes (level, HP, scores, feats,
// Expertise, subclass, the features text, the record of choices), and turns the change into per-path sheet patches
// so a concurrent edit of another field is not overwritten.
import type { CharOp } from '../../../sync/types';
import type { Srd } from '../data/schema';
import { derive } from '../derive';
import { ABILITY_TH, SKILLS, type Ability, type Skill } from '../i18n/th';
import type { D2024 } from '../model';
import type { LevelDraft } from './draft';
import { featBoost } from './srdText';
import { classOfChar, pointsAt, label, rawLevels } from './steps';
import { validateLevel } from './validate';

export class LevelUpError extends Error {}

const FEATURES_MAX = 20000;

/** The features text for reaching `level`: SRD features of the class (and subclass), then what was picked. */
export function levelText(c: D2024, d: LevelDraft, srd: Srd, level: number, full: boolean): string {
  const cls = classOfChar(c, srd)!;
  const sub = cls.subclasses.find((s) => s.key === c.subclass);
  const feats = [...cls.features, ...(sub?.features ?? [])].filter((f) => f.levels.includes(level));
  const out = [`# เลเวล ${level}`, ...feats.map((f) => (full ? `${f.name}: ${f.desc}` : f.name))];
  const name = (k: string) => srd.feats.find((f) => f.key === k)?.name ?? k;
  const asi = d.asi;
  if (asi?.kind === 'scores') {
    const by = asi.mode === '2' ? 2 : 1;
    out.push(`ค่าพลัง: ${asi.picks.map((a) => `${ABILITY_TH[a].name} +${by}`).join(', ')}`);
  }
  if (asi?.kind === 'feat' && asi.key) out.push(`Feat: ${name(asi.key)}`);
  if (d.boon?.key) out.push(`Epic Boon: ${name(d.boon.key)}`);
  if (d.fightingStyle) out.push(`Fighting Style: ${name(d.fightingStyle)}`);
  if (d.expertise.length) out.push(`Expertise: ${d.expertise.map((s) => SKILLS[s as Skill]?.th ?? s).join(', ')}`);
  if (d.masteries.length) out.push(`Weapon Mastery: ${d.masteries.map((k) => srd.weapons.find((w) => w.key === k)?.name ?? k).join(', ')}`);
  if (d.invocations.length) out.push(`Eldritch Invocation: ${d.invocations.map(label).join(', ')}`);
  if (d.metamagic.length) out.push(`Metamagic: ${d.metamagic.join(', ')}`);
  return out.join('\n');
}

/** Appends a level's text: in full if it fits under the cap, else the feature names only, never past the cap. */
export function appendFeatures(existing: string, full: string, names: string): string {
  const sep = existing ? '\n\n' : '';
  if (existing.length + sep.length + full.length <= FEATURES_MAX) return existing + sep + full;
  return (existing + sep + names).slice(0, FEATURES_MAX);
}

/** The score a feat's +1 goes to: only when that feat raises scores and `ability` is one it may raise. */
export function boostFor(srd: Srd, featKey: string, ability: Ability | null): Ability | null {
  const boost = featBoost(srd.feats.find((f) => f.key === featKey)?.desc ?? '');
  return boost && ability && boost.abilities.includes(ability) ? ability : null;
}

export function levelUp(c: D2024, d: LevelDraft, srd: Srd, isGM: boolean): D2024 {
  const issues = validateLevel(c, d, srd, isGM);
  if (issues.length) throw new LevelUpError(issues.map((i) => i.message).join('\n'));
  const cls = classOfChar(c, srd)!;
  const level = c.level + 1;
  const n = structuredClone(c);
  n.level = level;

  // Levels before this one keep what they had; a hand-made sheet without gains keeps the average for each.
  const average = cls.hitDie / 2 + 1;
  n.hpGains = [...Array.from({ length: level - 2 }, (_, i) => c.hpGains[i] ?? average), d.hp.method === 'roll' ? d.hp.rolled! : average];

  if (pointsAt(c, level).some((p) => p.kind === 'subclass') && !n.subclass && cls.subclasses[0]) n.subclass = cls.subclasses[0].key;

  if (d.asi?.kind === 'scores') {
    for (const a of d.asi.picks) n.abilities[a] += d.asi.mode === '2' ? 2 : 1;
    n.feats.push('ability-score-improvement');
  } else if (d.asi?.kind === 'feat' && d.asi.key) {
    n.feats.push(d.asi.key);
    const a = boostFor(srd, d.asi.key, d.asi.ability);
    if (a) n.abilities[a] += 1;
  }
  if (d.boon?.key) {
    n.feats.push(d.boon.key);
    const a = boostFor(srd, d.boon.key, d.boon.ability);
    if (a) n.abilities[a] += 1;
  }
  if (d.fightingStyle) n.feats.push(d.fightingStyle);
  for (const s of d.expertise) n.skills[s as Skill] = 2;

  n.features = appendFeatures(c.features, levelText(n, d, srd, level, true), levelText(n, d, srd, level, false));
  n.choices = { ...c.choices, levels: [...rawLevels(c), d] };

  // The new hit points arrive unhurt: current HP grows by what max HP grew (a GM override of max HP gives nothing).
  n.hp.current = c.hp.current + Math.max(0, derive(n, srd).maxHp - derive(c, srd).maxHp);
  return n;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Per-path patches that turn `before` into `after`: objects are walked, arrays and values replaced, null removes. */
export function diffOps(before: unknown, after: unknown, path: (string | number)[] = []): CharOp[] {
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((k) => diffOps(before[k], after[k], [...path, k]));
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [{ path, value: after === undefined ? null : after }];
}
