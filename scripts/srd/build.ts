// Normalises the raw Open5e SRD 5.2 snapshot (data/srd/raw/<date>/) into src/rulesets/dnd2024/data/srd.json,
// validates it with zod, and reports gaps (missing Thai names, unparsed fields). Run: node scripts/srd/build.ts [date]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SrdZ, type Srd } from '../../src/rulesets/dnd2024/data/schema.ts';
import { parseEquipment, parseInvocations, parseSkillChoice, parseTools, tableRow } from '../../src/rulesets/dnd2024/data/coreTraits.ts';
import { BACKGROUNDS_TH, CLASSES_TH, SKILLS, SPECIES_TH } from '../../src/rulesets/dnd2024/i18n/th.ts';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const root = join(import.meta.dirname, '..', '..');
const rawRoot = join(root, 'data', 'srd', 'raw');
const date = process.argv[2] ?? readdirSync(rawRoot).sort().at(-1)!;
const load = (f: string): Raw[] => JSON.parse(readFileSync(join(rawRoot, date, `${f}.json`), 'utf8'));
const PREFIX = 'srd-2024_';
/** Only SRD 5.2 rows (the API mixes in other documents for some endpoints). */
const own = (rows: Raw[]) => rows.filter((r) => String(r.key).startsWith(PREFIX));
const slug = (key: string) => key.slice(PREFIX.length);
const gaps: string[] = [];
/** Split words the PDF extraction left in the equipment text; reported at the end of the build. */
const repaired = new Set<string>();

const ABILITY_BY_NAME: Record<string, string> = {
  strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};
const ability = (name: string) => ABILITY_BY_NAME[name.trim().toLowerCase()];
/** The SRD tables list the casting ability in prose; this is the rule. */
const SPELL_ABILITY: Record<string, string> = {
  bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha', ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int',
};

function features(list: Raw[]) {
  return list
    .filter((f) => f.feature_type !== 'CLASS_TABLE_DATA')
    .map((f) => ({
      key: slug(f.key),
      name: f.name,
      levels: [...new Set<number>((f.gained_at ?? []).map((g: Raw) => g.level))].filter((l) => l >= 1 && l <= 20).sort((a, b) => a - b),
      desc: f.desc ?? '',
    }));
}

function table(list: Raw[]) {
  const out: Record<string, string[]> = {};
  for (const f of list) {
    if (!f.data_for_class_table?.length) continue;
    const col = Array<string>(20).fill('');
    for (const d of f.data_for_class_table) if (d.level >= 1 && d.level <= 20) col[d.level - 1] = String(d.column_value ?? '');
    out[f.name] = col;
  }
  return out;
}

// Weapons and armor come first: the classes' and backgrounds' starting equipment is matched against them.
const weapons: Srd['weapons'] = own(load('weapons')).map((w) => {
  const props = (w.properties ?? []) as Raw[];
  const plain = props.filter((p) => p.property.type !== 'Mastery');
  return {
    key: slug(w.key),
    name: w.name,
    simple: !!w.is_simple,
    ranged: w.range > 0 && !plain.some((p) => /thrown/i.test(p.property.name)),
    damage: w.damage_dice,
    damageType: w.damage_type?.name ?? '',
    properties: plain.map((p) => String(p.property.name).toLowerCase()),
    versatile: plain.find((p) => /versatile/i.test(p.property.name))?.detail ?? null,
    range: w.range > 0 ? [w.range, w.long_range || w.range] as [number, number] : null,
    mastery: props.find((p) => p.property.type === 'Mastery')?.property.name ?? null,
  };
});

const armor: Srd['armor'] = own(load('armor')).map((a) => ({
  key: slug(a.key),
  name: a.name,
  category: (/shield/i.test(a.category) ? 'shield' : String(a.category).toLowerCase()) as 'light',
  base: a.ac_base,
  dex: !!a.ac_add_dexmod,
  cap: a.ac_cap_dexmod ?? null,
  strength: a.strength_score_required ?? null,
  stealthDisadvantage: !!a.grants_stealth_disadvantage,
}));

const rawClasses = own(load('classes'));
const classes: Srd['classes'] = rawClasses.filter((c) => !c.subclass_of).map((c) => {
  const key = slug(c.key);
  if (!CLASSES_TH[key]) gaps.push(`class ${key}: no Thai name`);
  const core: string = c.features.find((f: Raw) => f.feature_type === 'CORE_TRAITS_TABLE')?.desc ?? '';
  const skillChoice = parseSkillChoice(tableRow(core, 'Skill Proficiencies') ?? '', SKILLS);
  const equipmentOptions = parseEquipment(tableRow(core, 'Starting Equipment') ?? '', { weapons, armor }, repaired);
  if (!skillChoice) gaps.push(`class ${key}: skill choice "${tableRow(core, 'Skill Proficiencies')}"`);
  if (!equipmentOptions) gaps.push(`class ${key}: starting equipment`);
  return {
    key,
    name: c.name,
    hitDie: Number(String(c.hit_dice).replace(/\D/g, '')),
    saves: c.saving_throws.map((s: Raw) => ability(s.name)),
    caster: String(c.caster_type).toLowerCase() as 'none',
    spellAbility: (SPELL_ABILITY[key] ?? null) as 'int' | null,
    table: table(c.features),
    features: features(c.features),
    skillChoice: skillChoice ?? { count: 1, from: [] },
    training: { weapons: tableRow(core, 'Weapon Proficiencies') ?? '', armor: tableRow(core, 'Armor Training') ?? '' },
    tools: parseTools(tableRow(core, 'Tool Proficiencies')),
    equipmentOptions: equipmentOptions ?? [],
    invocations: key === 'warlock' ? parseInvocations(c.features.find((f: Raw) => f.name === 'Eldritch Invocation Options')?.desc ?? '') : [],
    subclasses: rawClasses.filter((s) => (s.subclass_of?.key ?? s.subclass_of) === c.key).map((s) => ({
      key: slug(s.key), name: s.name, desc: s.desc ?? '', features: features(s.features),
    })),
  };
});

const species: Srd['species'] = own(load('species')).filter((s) => !s.is_subspecies).map((s) => {
  const key = slug(s.key);
  if (!SPECIES_TH[key]) gaps.push(`species ${key}: no Thai name`);
  const trait = (type: string) => s.traits.find((t: Raw) => t.type === type)?.desc ?? '';
  const speed = Number(/\d+/.exec(trait('SPEED'))?.[0] ?? 30);
  return {
    key,
    name: s.name,
    size: trait('SIZE').split('(')[0].trim() || 'Medium',
    speed,
    traits: s.traits.filter((t: Raw) => t.type !== 'SIZE' && t.type !== 'SPEED').map((t: Raw) => ({ name: t.name, desc: t.desc })),
  };
});

const SKILL_BY_EN = Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [v.en.toLowerCase(), k]));
const backgrounds: Srd['backgrounds'] = own(load('backgrounds')).map((b) => {
  const key = slug(b.key);
  if (!BACKGROUNDS_TH[key]) gaps.push(`background ${key}: no Thai name`);
  const benefit = (type: string) => b.benefits.find((x: Raw) => x.type === type)?.desc ?? '';
  const skills = benefit('skill_proficiency').split(/,| and /).map((x: string) => SKILL_BY_EN[x.trim().toLowerCase()]).filter(Boolean);
  if (skills.length !== 2) gaps.push(`background ${key}: skills "${benefit('skill_proficiency')}"`);
  const equipmentOptions = parseEquipment(benefit('equipment'), { weapons, armor }, repaired);
  if (!equipmentOptions) gaps.push(`background ${key}: starting equipment`);
  return {
    key,
    name: b.name,
    abilities: benefit('ability_score').split(',').map((x: string) => ability(x)),
    feat: benefit('feat'),
    skills,
    tool: benefit('tool_proficiency'),
    equipment: benefit('equipment'),
    tools: parseTools(benefit('tool_proficiency')),
    equipmentOptions: equipmentOptions ?? [],
  };
});

const feats: Srd['feats'] = own(load('feats')).map((f) => ({
  key: slug(f.key),
  name: f.name,
  type: String(f.type ?? 'GENERAL').toLowerCase(),
  prerequisite: f.has_prerequisite ? f.prerequisite ?? '' : null,
  desc: [f.desc, ...(f.benefits ?? []).map((x: Raw) => x.desc)].filter(Boolean).join('\n\n'),
}));

const CASTING: Record<string, string> = { action: 'Action', bonus_action: 'Bonus Action', reaction: 'Reaction' };
const spells: Srd['spells'] = own(load('spells')).map((s) => ({
  key: slug(s.key),
  name: s.name,
  level: s.level,
  school: s.school?.name ?? s.school ?? '',
  classes: (s.classes ?? []).map((c: Raw) => slug(c.key)),
  castingTime: CASTING[s.casting_time] ?? String(s.casting_time ?? '').replace(/_/g, ' '),
  range: s.range_text ?? '',
  components: [s.verbal && 'V', s.somatic && 'S', s.material && `M${s.material_specified ? ` (${s.material_specified})` : ''}`].filter(Boolean).join(', '),
  duration: s.duration ?? '',
  concentration: !!s.concentration,
  ritual: !!s.ritual,
  save: s.saving_throw_ability ? ability(s.saving_throw_ability) ?? null : null,
  attack: !!s.attack_roll,
  damage: s.damage_roll || null,
  damageTypes: s.damage_types ?? [],
  desc: s.desc ?? '',
  higher: s.higher_level || null,
})) as Srd['spells'];

// Known errors in the Open5e data, checked against the SRD 5.2 text. Each is applied and reported on every build.
const CORRECTIONS: { what: string; apply: () => boolean }[] = [
  {
    what: 'fighter saving throws are Strength and Constitution (Open5e lists Dexterity)',
    apply: () => {
      const c = classes.find((x) => x.key === 'fighter');
      if (!c || c.saves.includes('con')) return false;
      c.saves = ['str', 'con'];
      return true;
    },
  },
  {
    what: 'the Shield is its own category, not heavy armor',
    apply: () => {
      const a = armor.find((x) => x.key === 'shield');
      if (!a || a.category === 'shield') return false;
      a.category = 'shield';
      return true;
    },
  },
  {
    what: 'Bard Subclass is gained at level 3 (Open5e leaves the level blank)',
    apply: () => {
      const f = classes.find((c) => c.key === 'bard')?.features.find((x) => x.name === 'Bard Subclass');
      if (!f || f.levels.length) return false;
      f.levels = [3];
      return true;
    },
  },
  {
    what: 'Bard Expertise comes again at level 9 (the feature text says so; Open5e lists only level 2)',
    apply: () => {
      const f = classes.find((c) => c.key === 'bard')?.features.find((x) => x.name === 'Expertise');
      if (!f || f.levels.includes(9)) return false;
      f.levels = [...f.levels, 9];
      return true;
    },
  },
  {
    what: 'Sorcerer Metamagic grows again at level 17 (the feature text says so; Open5e lists 2 and 10)',
    apply: () => {
      const f = classes.find((c) => c.key === 'sorcerer')?.features.find((x) => x.name === 'Metamagic');
      if (!f || f.levels.includes(17)) return false;
      f.levels = [...f.levels, 17];
      return true;
    },
  },
  {
    what: 'the Dart is a Ranged weapon in the SRD weapons table (Open5e drops its range because it has Thrown)',
    apply: () => {
      const w = weapons.find((x) => x.key === 'dart');
      if (!w || w.ranged) return false;
      w.ranged = true;
      return true;
    },
  },
];
const applied = CORRECTIONS.filter((c) => c.apply()).map((c) => c.what);

const unread = gaps.filter((g) => /skill choice|starting equipment/.test(g));
if (unread.length) throw new Error(`SRD text not understood:\n  ${unread.join('\n  ')}`);

const data = SrdZ.parse({
  source: `System Reference Document 5.2 (CC-BY-4.0), via Open5e, snapshot ${date}`,
  classes, species, backgrounds, feats, spells, weapons, armor,
});
const out = join(root, 'src', 'rulesets', 'dnd2024', 'data', 'srd.json');
writeFileSync(out, JSON.stringify(data));
console.log(Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}: ${(v as unknown[]).length}`).join(', '));
console.log(applied.length ? `corrected:\n  ${applied.join('\n  ')}` : 'no corrections needed');
console.log(gaps.length ? `gaps:\n  ${gaps.join('\n  ')}` : 'no gaps');
console.log(repaired.size ? `repaired text:\n  ${[...repaired].join('\n  ')}` : 'no text repaired');
