// Turns a valid draft into the character data the sheet stores. Effects land in the fields the sheet already has
// (abilities, skills, armor, weapons, inventory, money, spells.known, feats, languages, tools); what the player chose
// is also kept whole in choices.build for the level-up work that comes next. Feature effects beyond what derive()
// computes are not applied: their text goes into `features`.
import type { Srd } from '../data/schema';
import { derive } from '../derive';
import { SKILLS, type Skill } from '../i18n/th';
import { D2024Z, type D2024 } from '../model';
import { COMMON_LANGUAGE } from '../overlay';
import type { Draft, FeatPicks } from './draft';
import { emptyPicks } from './draft';
import { kitOf } from './equipment';
import {
  backgroundFeat, backgroundOf, classOf, finalAbilities, level1Points, needsSpellStep, proficientSkills, speciesOf,
  speciesRulesOf, type FeatList,
} from './helpers';
import { validate, type Issue } from './validate';

export class BuildError extends Error {
  constructor(public issues: Issue[]) {
    super(issues.map((i) => i.message).join('; '));
  }
}

/** The model's limit for the `features` text. */
const FEATURES_MAX = 20000;
const uniqueNames = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map((x) => x.trim().slice(0, 80)).filter((x) => x && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
};

function featBlock(srd: Srd, key: string, picks: FeatPicks, list: FeatList | null): string[] {
  const feat = srd.feats.find((f) => f.key === key);
  if (!feat) return [];
  const lines = [`${feat.name}: ${feat.desc}`];
  const spell = (k: string) => srd.spells.find((s) => s.key === k)?.name ?? k;
  const use = list ?? picks.list;
  if (key === 'magic-initiate' && use) {
    lines.push(`เวทจาก Magic Initiate (${use}): ${picks.cantrips.map(spell).join(', ')}; เลเวล 1: ${picks.spell ? spell(picks.spell) : '-'}`);
  }
  if (key === 'skilled') lines.push(`สกิลจาก Skilled: ${picks.skills.map((s) => SKILLS[s as Skill].th).join(', ')}`);
  return lines;
}

function featuresText(d: Draft, srd: Srd): string {
  const cls = classOf(d, srd)!;
  const bg = backgroundOf(d, srd)!;
  const sp = speciesOf(d, srd)!;
  const bgFeat = backgroundFeat(d, srd)!;
  const out: string[] = [`# เผ่า: ${sp.name}`];
  for (const t of sp.traits) out.push(`${t.name}: ${t.desc}`);
  for (const c of speciesRulesOf(d)?.choices ?? []) {
    if (c.kind === 'option') out.push(`${c.label}ที่เลือก: ${c.options.find((o) => o.id === d.speciesOptions[c.id])?.name}`);
    if (c.kind === 'skill' && d.speciesSkill) out.push(`สกิลจากเผ่า: ${SKILLS[d.speciesSkill as Skill].th}`);
    if (c.kind === 'originFeat' && d.speciesFeat) out.push(...featBlock(srd, d.speciesFeat, d.speciesFeatPicks, null));
  }
  out.push('', `# ฉากหลัง: ${bg.name}`, ...featBlock(srd, bgFeat.key, d.bgFeat, bgFeat.list));
  out.push('', `# อาชีพ: ${cls.name} (เลเวล 1)`, `การฝึกอาวุธ: ${cls.training.weapons}`, `การฝึกเกราะ: ${cls.training.armor}`);
  for (const p of level1Points(d)) {
    if (p.kind === 'fightingStyle' && d.fightingStyle) out.push(...featBlock(srd, d.fightingStyle, emptyPicks(), null));
    if (p.kind === 'masteries') out.push(`Weapon Mastery: ${d.masteries.map((k) => srd.weapons.find((w) => w.key === k)?.name ?? k).join(', ')}`);
    if (p.kind === 'expertise') out.push(`Expertise: ${d.expertise.map((s) => SKILLS[s as Skill].th).join(', ')}`);
    if (p.kind === 'order') out.push(`${p.feature}: ${p.options.find((o) => o.id === d.order)?.name}`);
    if (p.kind === 'invocations') out.push(`Eldritch Invocations: ${d.invocations.join(', ')}`);
  }
  for (const f of cls.features.filter((x) => x.levels.includes(1))) out.push('', `${f.name}: ${f.desc}`);
  const text = out.join('\n');
  return text.length > FEATURES_MAX ? `${text.slice(0, FEATURES_MAX - 1)}…` : text;
}

export function build(d: Draft, srd: Srd): D2024 {
  const issues = validate(d, srd);
  if (issues.length) throw new BuildError(issues);
  const cls = classOf(d, srd)!;
  const bg = backgroundOf(d, srd)!;
  const points = level1Points(d);
  const has = (kind: string) => points.some((p) => p.kind === kind);
  const kit = kitOf([cls.equipmentOptions.find((o) => o.id === d.classEquip)!, bg.equipmentOptions.find((o) => o.id === d.bgEquip)!]);

  const skills: Record<string, 1 | 2> = {};
  for (const s of proficientSkills(d, srd)) skills[s] = 1;
  if (has('expertise')) for (const s of d.expertise) skills[s] = 2;

  const feats = [backgroundFeat(d, srd)!.key];
  if (speciesRulesOf(d)?.choices.some((c) => c.kind === 'originFeat') && d.speciesFeat) feats.push(d.speciesFeat);
  if (has('fightingStyle') && d.fightingStyle) feats.push(d.fightingStyle);

  const c = D2024Z.parse({
    name: d.name.trim(),
    classKey: cls.key,
    level: 1,
    species: d.species,
    background: bg.key,
    abilities: finalAbilities(d, srd),
    skills,
    armor: kit.armor,
    shield: kit.shield,
    weapons: kit.weapons,
    inventory: kit.inventory,
    money: { gp: kit.gp },
    spells: { known: needsSpellStep(d, srd) ? [...d.cantrips, ...d.spells] : [] },
    feats,
    languages: [COMMON_LANGUAGE, ...d.languages],
    tools: uniqueNames([...cls.tools.fixed, ...d.classTools, ...bg.tools.fixed, ...d.bgTools]),
    features: featuresText(d, srd),
    notes: d.notes,
    choices: { build: { v: 1, draft: JSON.parse(JSON.stringify(d)) } },
  });
  c.hp.current = derive(c, srd).maxHp;
  return c;
}
