// Checks one level-up draft against the rules. Every message says how to fix the problem, and is tagged with the
// wizard step that fixes it.
import { repeatable } from '../builder/helpers';
import type { Srd } from '../data/schema';
import { ABILITY_TH, type Ability } from '../i18n/th';
import type { D2024 } from '../model';
import type { LevelDraft } from './draft';
import { featBoost, meetsPrerequisite } from './srdText';
import {
  classOfChar, classPicks, expertisePool, fightingStylePool, invocationPool, levelSteps, masteryPool, metamagicPool,
  type LevelStepId,
} from './steps';

export interface LevelIssue { step: LevelStepId; message: string }

/** General feats other than Ability Score Improvement (which the ASI step offers as its own choice). */
export const generalFeats = (srd: Srd) => srd.feats.filter((f) => f.type === 'general' && f.key !== 'ability-score-improvement');
export const epicBoons = (srd: Srd) => srd.feats.filter((f) => f.type === 'epic boon');
export const isCaster = (c: D2024, srd: Srd) => (classOfChar(c, srd)?.caster ?? 'none') !== 'none';
/** A pick count, capped by how many options are left (so a small pool never leaves the wizard stuck). */
export const needed = (count: number, pool: string[]) => Math.min(count, pool.length);

const exactly = (picked: string[], n: number, pool: string[]) =>
  picked.length === n && new Set(picked).size === n && picked.every((p) => pool.includes(p));

export function validateLevel(c: D2024, d: LevelDraft, srd: Srd, isGM: boolean): LevelIssue[] {
  const cls = classOfChar(c, srd);
  if (!cls) return [{ step: 'review', message: 'อาชีพบนชีทไม่อยู่ใน SRD แก้อาชีพบนชีทก่อน' }];
  if (c.level >= 20) return [{ step: 'review', message: 'ตัวละครอยู่เลเวล 20 แล้ว' }];
  const next = c.level + 1;
  const out: LevelIssue[] = [];
  const add = (step: LevelStepId, message: string) => out.push({ step, message });

  // HP: the method, and a roll that was really made. A stored roll stays: switching to the average would be a re-roll.
  if (d.hp.rolled !== null && d.hp.method !== 'roll') add('hp', 'ทอยไปแล้ว ใช้ผลทอยนั้น');
  else if (!d.hp.method) add('hp', 'เลือกวิธีเพิ่ม HP: ค่าเฉลี่ย หรือทอย Hit Die');
  else if (d.hp.method === 'roll' && !(d.hp.rolled !== null && d.hp.rolled >= 1 && d.hp.rolled <= cls.hitDie)) add('hp', 'ทอย Hit Die ก่อน');

  const steps = levelSteps(c, srd);
  const raise = (a: Ability, by: number, max: number) => c.abilities[a] + by > max;

  if (steps.includes('asi')) {
    const asi = d.asi;
    if (!asi) add('asi', 'เลือกเพิ่มค่าพลัง หรือเลือก feat');
    else if (asi.kind === 'scores') {
      const n = asi.mode === '2' ? 1 : 2;
      if (asi.picks.length !== n || new Set(asi.picks).size !== n) {
        add('asi', asi.mode === '2' ? 'เลือกค่าพลังที่จะ +2' : 'เลือกค่าพลัง 2 ค่าที่จะ +1 (คนละค่า)');
      } else {
        for (const a of asi.picks) if (raise(a, n === 1 ? 2 : 1, 20)) add('asi', `${ABILITY_TH[a].name}จะเกิน 20 ให้เลือกค่าอื่น`);
      }
    } else {
      const f = generalFeats(srd).find((x) => x.key === asi.key);
      if (!f) add('asi', 'เลือก feat');
      else {
        if (!meetsPrerequisite(f.prerequisite, next, c.abilities, isCaster(c, srd))) add('asi', `ยังไม่ผ่านเงื่อนไขของ ${f.name}: ${f.prerequisite}`);
        if (c.feats.includes(f.key) && !repeatable(f)) add('asi', `มี ${f.name} อยู่แล้ว ให้เลือก feat อื่น`);
        const boost = featBoost(f.desc);
        if (boost) {
          if (!asi.ability || !boost.abilities.includes(asi.ability)) add('asi', `เลือกค่าพลังที่ ${f.name} เพิ่มให้`);
          else if (raise(asi.ability, 1, boost.max)) add('asi', `${ABILITY_TH[asi.ability].name}จะเกิน ${boost.max} ให้เลือกค่าอื่น`);
        }
      }
    }
  }

  if (steps.includes('boon')) {
    const f = epicBoons(srd).find((x) => x.key === d.boon?.key);
    if (!f) add('boon', 'เลือก Epic Boon');
    else {
      if (!meetsPrerequisite(f.prerequisite, next, c.abilities, isCaster(c, srd))) add('boon', `ยังไม่ผ่านเงื่อนไขของ ${f.name}: ${f.prerequisite}`);
      if (c.feats.includes(f.key)) add('boon', `มี ${f.name} อยู่แล้ว ให้เลือก Boon อื่น`);
      const boost = featBoost(f.desc);
      const a = d.boon?.ability ?? null;
      if (boost && (!a || !boost.abilities.includes(a))) add('boon', 'เลือกค่าพลังที่จะ +1');
      else if (boost && a && raise(a, 1, boost.max)) add('boon', `${ABILITY_TH[a].name}จะเกิน ${boost.max} ให้เลือกค่าอื่น`);
    }
  }

  if (steps.includes('class')) {
    const p = classPicks(c, srd, next);
    const check = (count: number, picked: string[], pool: string[], message: string) => {
      const n = needed(count, pool);
      if (!exactly(picked, n, pool)) add('class', message.replace('{n}', String(n)));
    };
    if (p.expertise) check(p.expertise, d.expertise, expertisePool(c, p.expertiseFrom), 'เลือกสกิลที่เชี่ยวชาญ (Expertise) ให้ครบ {n} อย่าง จากสกิลที่ชำนาญแล้ว');
    if (p.fightingStyle && fightingStylePool(c, srd).length && !(d.fightingStyle && fightingStylePool(c, srd).includes(d.fightingStyle))) {
      add('class', 'เลือก Fighting Style ที่ยังไม่มี');
    }
    if (p.metamagic) check(p.metamagic, d.metamagic, metamagicPool(c, srd), 'เลือก Metamagic ให้ครบ {n} อย่าง');
    if (p.masteries) check(p.masteries, d.masteries, masteryPool(c, srd, p.masteryFilter), 'เลือกอาวุธสำหรับ Weapon Mastery เพิ่มอีก {n} ชนิด');
    if (p.invocations) check(p.invocations, d.invocations, invocationPool(c, srd, next), 'เลือก Eldritch Invocation เพิ่มอีก {n} อย่าง');
  }

  if (!isGM && next > (c.levelAllowed ?? c.level)) add('review', `GM ยังไม่อนุญาตให้ขึ้นเลเวล ${next}`);
  return out;
}
