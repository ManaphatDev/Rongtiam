// Table-facing rules for D&D 2024 (pure, so they are tested without the UI): roll buttons, token bar,
// damage/healing, conditions and initiative.
import type { CharOp } from '../../sync/types';
import type { RollAction, TokenBar } from '../core/types';
import type { Srd } from './data/schema';
import { derive, type Derived, type RoomSkill } from './derive';
import { ABILITIES, ABILITY_TH, CONDITIONS, SKILLS, type Condition, type Skill } from './i18n/th';
import { parseCharacter, type D2024 } from './model';

const d20 = (bonus: number) => (bonus ? `1d20${bonus > 0 ? '+' : ''}${bonus}` : '1d20');
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function rollActions(c: D2024, d: Derived): RollAction[] {
  const out: RollAction[] = [{ id: 'init', label: 'Initiative', expr: d20(d.initiative), group: 'ทั่วไป' }];
  for (const a of ABILITIES) out.push({ id: `check:${a}`, label: `ทดสอบ${ABILITY_TH[a].name}`, expr: d20(d.mods[a]), group: 'ทดสอบค่าพลัง' });
  for (const a of ABILITIES) out.push({ id: `save:${a}`, label: `เซฟ${ABILITY_TH[a].name}`, expr: d20(d.saves[a].bonus), group: 'เซฟ' });
  for (const s of Object.keys(SKILLS) as Skill[]) out.push({ id: `skill:${s}`, label: SKILLS[s].th, expr: d20(d.skills[s].bonus), group: 'สกิล' });
  for (const s of d.extraSkills) out.push({ id: `skill:${s.id}`, label: s.name, expr: d20(s.bonus), group: 'สกิล' });
  for (const a of d.attacks) {
    out.push({ id: `atk:${a.key}`, label: `${a.name} โจมตี (${signed(a.toHit)})`, expr: d20(a.toHit), group: 'โจมตี' });
    out.push({ id: `dmg:${a.key}`, label: `${a.name} ความเสียหาย`, expr: a.damage, group: 'โจมตี' });
    if (a.versatile) out.push({ id: `dmg2:${a.key}`, label: `${a.name} สองมือ`, expr: a.versatile, group: 'โจมตี' });
  }
  if (d.spellcasting) out.push({ id: 'spell:attack', label: `โจมตีด้วยเวท (${signed(d.spellcasting.attack)})`, expr: d20(d.spellcasting.attack), group: 'เวท' });
  return out;
}

export function bars(c: D2024, d: Derived): TokenBar[] {
  return [{ label: 'HP', current: c.hp.current + c.hp.temp, max: d.maxHp, color: c.hp.temp ? '#3e8ef7' : '#e5484d' }];
}

/** Damage (negative) eats temporary HP first; healing (positive) never goes past the maximum. */
export function applyHp(c: D2024, d: Derived, delta: number): CharOp[] {
  let { current, temp } = c.hp;
  if (delta < 0) {
    const fromTemp = Math.min(temp, -delta);
    temp -= fromTemp;
    current = Math.max(0, current - (-delta - fromTemp));
  } else current = Math.min(d.maxHp, current + delta);
  const ops: CharOp[] = [{ path: ['hp', 'current'], value: current }];
  if (temp !== c.hp.temp) ops.push({ path: ['hp', 'temp'], value: temp });
  return ops;
}

export function activeConditions(c: D2024): string[] {
  return c.exhaustion > 0 && !c.conditions.includes('exhaustion') ? [...c.conditions, 'exhaustion'] : c.conditions;
}

export function toggleCondition(c: D2024, key: string): CharOp[] {
  if (key === 'exhaustion') return [{ path: ['exhaustion'], value: c.exhaustion > 0 ? 0 : 1 }];
  if (!(key in CONDITIONS)) return [];
  const has = c.conditions.includes(key as Condition);
  return [{ path: ['conditions'], value: has ? c.conditions.filter((x) => x !== key) : [...c.conditions, key] }];
}

/** Everything the table needs from raw sheet data in one go. */
export function view(raw: Record<string, unknown>, srd: Srd, roomSkills: RoomSkill[] = []) {
  const c = parseCharacter(raw);
  return { c, d: derive(c, srd, roomSkills) };
}
