// Is this draft a legal level-1 character? Returns every problem, tagged with the wizard step that owns it, in
// step order. The wizard enables "next" when the current step has none; build() refuses a draft that has any.
import type { Srd } from '../data/schema';
import { SKILLS } from '../i18n/th';
import { STANDARD_LANGUAGES } from '../overlay';
import { POINT_BUY_BUDGET, baseScores } from './abilities';
import type { Draft, FeatPicks } from './draft';
import {
  backgroundFeat, backgroundOf, cantripTarget, classOf, classSpells, fightingStyleFeats, finalAbilities, level1Points,
  languagePicks, listSpells, needsSpellStep, originFeats, proficientSkills, skillSources, speciesFeatRef, speciesOf, speciesRulesOf,
  spellTarget, weaponPool, type FeatRef,
} from './helpers';

export type StepId = 'class' | 'background' | 'species' | 'languages' | 'scores' | 'equipment' | 'spells' | 'details';
export interface Issue { step: StepId; message: string }

const SKILL_KEYS = Object.keys(SKILLS);
const distinct = (xs: string[]) => new Set(xs).size === xs.length;
/** `xs` is exactly `n` different members of `pool`. */
const exactly = (xs: string[], n: number, pool: string[]) => xs.length === n && distinct(xs) && xs.every((x) => pool.includes(x));
const names = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
const namesOk = (xs: string[], n: number) => {
  const t = names(xs);
  return t.length === n && new Set(t.map((x) => x.toLowerCase())).size === n;
};

function featPickMessages(feat: FeatRef | null, picks: FeatPicks, srd: Srd, taken: string[]): string[] {
  if (!feat) return [];
  if (feat.key === 'magic-initiate') {
    const list = feat.list ?? picks.list;
    if (!list) return ['เลือกรายชื่อเวทของ Magic Initiate (Cleric, Druid หรือ Wizard)'];
    const out: string[] = [];
    if (!exactly(picks.cantrips, 2, listSpells(list, 0, srd).map((s) => s.key))) out.push('Magic Initiate: เลือก cantrip 2 อย่าง');
    if (!picks.spell || !listSpells(list, 1, srd).some((s) => s.key === picks.spell)) out.push('Magic Initiate: เลือกเวทเลเวล 1 หนึ่งอย่าง');
    return out;
  }
  if (feat.key === 'skilled') {
    if (!exactly(picks.skills, 3, SKILL_KEYS)) return ['Skilled: เลือกสกิล 3 อย่าง'];
    return picks.skills.some((s) => taken.includes(s)) ? ['Skilled: มีสกิลซ้ำกับที่ได้มาแล้ว ให้เลือกใหม่'] : [];
  }
  return [];
}

function classMessages(d: Draft, srd: Srd): string[] {
  const cls = classOf(d, srd);
  if (!cls) return ['เลือกอาชีพ'];
  const out: string[] = [];
  const src = skillSources(d, srd);
  if (!exactly(d.classSkills, cls.skillChoice.count, cls.skillChoice.from)) out.push(`เลือกสกิลของอาชีพให้ครบ ${cls.skillChoice.count} อย่าง`);
  else if (d.classSkills.some((s) => src.bg.includes(s))) out.push('สกิลของอาชีพซ้ำกับสกิลของฉากหลัง ให้เลือกใหม่');
  if (cls.tools.choose && !namesOk(d.classTools, cls.tools.choose.count)) {
    out.push(`ระบุเครื่องมือ (${cls.tools.choose.label}) ให้ครบ ${cls.tools.choose.count} อย่าง และห้ามซ้ำกัน`);
  }
  for (const p of level1Points(d)) {
    if (p.kind === 'fightingStyle' && !fightingStyleFeats(srd).some((f) => f.key === d.fightingStyle)) out.push('เลือก Fighting Style');
    if (p.kind === 'masteries' && !exactly(d.masteries, p.count, weaponPool(d, srd, p.filter).map((w) => w.key))) {
      out.push(`เลือกอาวุธสำหรับ Weapon Mastery ให้ครบ ${p.count} ชนิด`);
    }
    if (p.kind === 'expertise' && !exactly(d.expertise, p.count, proficientSkills(d, srd))) {
      out.push(`เลือกสกิลที่เชี่ยวชาญ (Expertise) ให้ครบ ${p.count} อย่าง จากสกิลที่ชำนาญแล้ว`);
    }
    if (p.kind === 'order' && !p.options.some((o) => o.id === d.order)) out.push(`เลือก ${p.feature}`);
    if (p.kind === 'invocations' && !exactly(d.invocations, p.count, cls.invocations.filter((i) => !i.prerequisite).map((i) => i.name))) {
      out.push(`เลือก Eldritch Invocation ให้ครบ ${p.count} อย่าง`);
    }
  }
  return out;
}

function backgroundMessages(d: Draft, srd: Srd): string[] {
  const bg = backgroundOf(d, srd);
  if (!bg) return ['เลือกฉากหลัง'];
  const out: string[] = [];
  if (d.bgAsi.mode === '2/1') {
    const { plus2, plus1 } = d.bgAsi;
    if (!plus2 || !plus1 || plus2 === plus1 || !bg.abilities.includes(plus2) || !bg.abilities.includes(plus1)) {
      out.push('เลือกค่าพลัง +2 และ +1 (คนละค่า) จากสามค่าของฉากหลัง');
    }
  }
  if (bg.tools.choose && !namesOk(d.bgTools, bg.tools.choose.count)) {
    out.push(`ระบุเครื่องมือ (${bg.tools.choose.label}) ให้ครบ ${bg.tools.choose.count} อย่าง และห้ามซ้ำกัน`);
  }
  out.push(...featPickMessages(backgroundFeat(d, srd), d.bgFeat, srd, []));
  return out;
}

function speciesMessages(d: Draft, srd: Srd): string[] {
  const species = speciesOf(d, srd);
  if (!species) return ['เลือกเผ่า'];
  const out: string[] = [];
  const src = skillSources(d, srd);
  for (const c of speciesRulesOf(d)?.choices ?? []) {
    if (c.kind === 'option' && !c.options.some((o) => o.id === d.speciesOptions[c.id])) out.push(`เลือก${c.label}`);
    if (c.kind === 'skill') {
      const pool = c.from === 'any' ? SKILL_KEYS : c.from;
      if (!d.speciesSkill || !pool.includes(d.speciesSkill)) out.push('เลือกสกิลของเผ่า');
      else if ([...src.bg, ...src.cls].includes(d.speciesSkill)) out.push('สกิลของเผ่าซ้ำกับสกิลที่ได้มาแล้ว ให้เลือกใหม่');
    }
    if (c.kind === 'originFeat') {
      const feat = speciesFeatRef(d, srd);
      if (!feat || !originFeats(srd).some((f) => f.key === feat.key)) out.push('เลือก Origin feat');
      else if (feat.key === backgroundFeat(d, srd)?.key) out.push('Origin feat ซ้ำกับของฉากหลัง');
      else out.push(...featPickMessages(feat, d.speciesFeatPicks, srd, [...src.bg, ...src.cls, ...src.sp]));
    }
  }
  return out;
}

function scoreMessages(d: Draft, srd: Srd): string[] {
  if (!baseScores(d.scores, d.rolled)) {
    if (d.scores.method === 'pointbuy') return [`Point Buy ใช้ได้ไม่เกิน ${POINT_BUY_BUDGET} แต้ม และแต่ละค่าอยู่ระหว่าง 8 ถึง 15`];
    if (d.scores.method === 'roll' && !d.rolled) return ['ทอยค่าพลังก่อน'];
    return ['จัดค่าเข้าให้ครบทั้งหกค่าพลัง โดยใช้แต่ละค่าครั้งเดียว'];
  }
  const final = finalAbilities(d, srd);
  return final && Object.values(final).some((v) => v > 20) ? ['ค่าพลังหลังบวกจากฉากหลังเกิน 20'] : [];
}

function equipmentMessages(d: Draft, srd: Srd): string[] {
  const out: string[] = [];
  if (!classOf(d, srd)?.equipmentOptions.some((o) => o.id === d.classEquip)) out.push('เลือกอุปกรณ์เริ่มต้นของอาชีพ');
  if (!backgroundOf(d, srd)?.equipmentOptions.some((o) => o.id === d.bgEquip)) out.push('เลือกอุปกรณ์เริ่มต้นของฉากหลัง');
  return out;
}

function spellMessages(d: Draft, srd: Srd): string[] {
  if (!needsSpellStep(d, srd)) return [];
  const out: string[] = [];
  const cantrips = cantripTarget(d, srd);
  const spells = spellTarget(d, srd);
  if (!exactly(d.cantrips, cantrips, classSpells(d, srd, 0).map((s) => s.key))) out.push(`เลือก cantrip ให้ครบ ${cantrips} อย่าง`);
  if (!exactly(d.spells, spells, classSpells(d, srd, 1).map((s) => s.key))) out.push(`เลือกเวทเลเวล 1 ให้ครบ ${spells} อย่าง`);
  return out;
}

export function validate(d: Draft, srd: Srd): Issue[] {
  const at = (step: StepId, messages: string[]) => messages.map((message) => ({ step, message }));
  return [
    ...at('class', classMessages(d, srd)),
    ...at('background', backgroundMessages(d, srd)),
    ...at('species', speciesMessages(d, srd)),
    ...at('languages', exactly(d.languages, languagePicks(d), [...STANDARD_LANGUAGES]) ? [] : [`เลือกภาษาเพิ่ม ${languagePicks(d)} ภาษา`]),
    ...at('scores', scoreMessages(d, srd)),
    ...at('equipment', equipmentMessages(d, srd)),
    ...at('spells', spellMessages(d, srd)),
    ...at('details', d.name.trim() ? [] : ['ตั้งชื่อตัวละคร']),
  ];
}
