// The room's homebrew: which kinds there are, what a GM fills in for each (form-friendly, validated by zod), and
// how each entry becomes the same shape as the SRD's data so the builder, level-up and sheet use it unchanged.
import { z } from 'zod';
import { parse as parseDice } from '../../../dice/model';
import {
  AbilityZ, type EquipmentOption, type SrdArmor, type SrdBackground, type SrdSpecies, type SrdSpell, type SrdWeapon,
} from '../data/schema';
import type { Srd } from '../data/schema';
import { SKILLS } from '../i18n/th';

export const HB_KINDS = ['weapon', 'armor', 'item', 'spell', 'feat', 'species', 'background'] as const;
export type HbKind = (typeof HB_KINDS)[number];

export const rowKind = (k: HbKind) => `hb-${k}`;
export const kindOfRow = (kind: string): HbKind | null => {
  const k = kind.startsWith('hb-') ? kind.slice(3) : '';
  return (HB_KINDS as readonly string[]).includes(k) ? (k as HbKind) : null;
};
export const HB_KEY = /^hb-[a-z0-9-]{1,60}$/;
export const MAX_PER_KIND = 200;
export const isHomebrew = (key: string) => key.startsWith('hb-');

/** "Flame Tongue" → "hb-flame-tongue", made unique against `taken`. A name with no Latin letters becomes "hb-item". */
export function slugKey(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item';
  let key = `hb-${base}`;
  for (let i = 2; taken.includes(key); i++) key = `hb-${base}-${i}`;
  return key;
}

const text = (max: number) =>
  z.string().trim().min(1, 'ใส่ข้อความ').max(max, `ยาวได้ไม่เกิน ${max} ตัวอักษร`);
const optText = (max: number) =>
  z.string().trim().max(max, `ยาวได้ไม่เกิน ${max} ตัวอักษร`).nullable().transform((s) => (s ? s : null));
const int = (min: number, max: number) =>
  z.number({ error: 'ใส่ตัวเลข' }).int('ใส่จำนวนเต็ม').min(min, `ไม่น้อยกว่า ${min}`).max(max, `ไม่เกิน ${max}`);
const dice = z.string().trim().max(20, 'ยาวได้ไม่เกิน 20 ตัวอักษร').refine((s) => {
  try {
    return parseDice(s).length > 0;
  } catch {
    return false;
  }
}, 'ใส่เต๋าแบบ 1d8 หรือ 2d6+1');
const distinct = <T>(a: T[]) => new Set(a).size === a.length;

export const WEAPON_PROPERTIES = ['finesse', 'light', 'heavy', 'reach', 'thrown', 'two-handed', 'versatile', 'ammunition', 'loading'] as const;
const SKILL_KEYS = Object.keys(SKILLS);
const CLASS_KEYS = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'] as const;

const HbWeaponZ = z.object({
  name: text(80), simple: z.boolean(), ranged: z.boolean(), damage: dice, damageType: text(40),
  properties: z.array(z.enum(WEAPON_PROPERTIES)).max(9).refine(distinct, 'คุณสมบัติซ้ำกัน'),
  versatile: dice.nullable(), rangeNormal: int(5, 1000).nullable(), rangeLong: int(5, 1000).nullable(),
  mastery: optText(40), bonus: int(0, 3),
});
const HbArmorZ = z.object({
  name: text(80), category: z.enum(['light', 'medium', 'heavy']), base: int(0, 30), dex: z.boolean(),
  cap: int(0, 10).nullable(), strength: int(1, 30).nullable(), stealthDisadvantage: z.boolean(), bonus: int(0, 3),
});
const HbItemZ = z.object({ name: text(80), desc: z.string().trim().max(2000, 'ยาวได้ไม่เกิน 2000 ตัวอักษร') });
const HbSpellZ = z.object({
  name: text(80), level: int(0, 9), school: text(40),
  /** SRD class keys (the sheet and builder match them exactly). */
  classes: z.array(z.enum(CLASS_KEYS, { error: 'เลือกอาชีพจากรายการ' })).max(12).refine(distinct, 'อาชีพซ้ำกัน'),
  castingTime: text(60), range: text(60), components: text(120), duration: text(60),
  concentration: z.boolean(), ritual: z.boolean(), save: AbilityZ.nullable(), attack: z.boolean(),
  damage: dice.nullable(), damageType: optText(40), desc: text(4000), higher: optText(2000),
});
const HbFeatZ = z.object({
  name: text(80), type: z.enum(['origin', 'general', 'fighting style', 'epic boon']), prerequisite: optText(120),
  desc: text(4000), repeatable: z.boolean(),
  boostAbilities: z.array(AbilityZ).max(6).refine(distinct, 'ค่าพลังซ้ำกัน'), boostMax: z.union([z.literal(20), z.literal(30)]),
});
const HbSpeciesZ = z.object({
  name: text(80), size: z.enum(['Small', 'Medium', 'Large']), speed: int(5, 120),
  traits: z.array(z.object({ name: text(80), desc: text(2000) })).max(12),
});
const HbBackgroundZ = z.object({
  name: text(80),
  abilities: z.array(AbilityZ).length(3, 'เลือกค่าพลัง 3 ค่า').refine(distinct, 'เลือกค่าพลัง 3 ค่าไม่ซ้ำกัน'),
  /** The key of an Origin feat (SRD or homebrew). */
  feat: text(80),
  skills: z.array(z.string()).length(2, 'เลือกสกิล 2 อย่าง').refine(distinct, 'เลือกสกิล 2 อย่างไม่ซ้ำกัน')
    .refine((s) => s.every((k) => SKILL_KEYS.includes(k)), 'สกิลไม่ถูกต้อง'),
  toolsFixed: z.array(z.object({ name: text(80) })).max(4),
  toolsChooseCount: int(0, 5), toolsChooseLabel: optText(80),
  gear: z.array(z.object({ name: text(80), qty: int(1, 99) })).max(20),
  gearGold: int(0, 1000), gold: int(0, 1000),
});

export const HB_SCHEMAS = {
  weapon: HbWeaponZ, armor: HbArmorZ, item: HbItemZ, spell: HbSpellZ, feat: HbFeatZ, species: HbSpeciesZ, background: HbBackgroundZ,
} satisfies Record<HbKind, z.ZodType>;
export type HbWeapon = z.infer<typeof HbWeaponZ>;
export type HbArmor = z.infer<typeof HbArmorZ>;
export type HbItem = z.infer<typeof HbItemZ>;
export type HbSpell = z.infer<typeof HbSpellZ>;
export type HbFeat = z.infer<typeof HbFeatZ>;
export type HbSpecies = z.infer<typeof HbSpeciesZ>;
export type HbBackground = z.infer<typeof HbBackgroundZ>;

export interface RoomItem { key: string; name: string; desc: string }

export const toSrdWeapon = (key: string, d: HbWeapon): SrdWeapon => ({
  key, name: d.name, simple: d.simple, ranged: d.ranged, damage: d.damage, damageType: d.damageType,
  properties: [...d.properties], versatile: d.versatile,
  range: d.rangeNormal ? [d.rangeNormal, d.rangeLong ?? d.rangeNormal] : null, mastery: d.mastery, bonus: d.bonus,
});
export const toSrdArmor = (key: string, d: HbArmor): SrdArmor => ({ key, ...d });
export const toSrdSpell = (key: string, d: HbSpell): SrdSpell => {
  const { damageType, ...rest } = d;
  return { key, ...rest, damageTypes: damageType ? [damageType.toLowerCase()] : [] };
};
export const toSrdFeat = (key: string, d: HbFeat): Srd['feats'][number] => ({
  key, name: d.name, type: d.type, prerequisite: d.prerequisite, desc: d.desc, repeatable: d.repeatable,
  boost: d.boostAbilities.length ? { abilities: [...d.boostAbilities], max: d.boostMax } : null,
});
export const toSrdSpecies = (key: string, d: HbSpecies): SrdSpecies => ({
  key, name: d.name, size: d.size, speed: d.speed, traits: d.traits.map((t) => ({ ...t })),
});
export function toSrdBackground(key: string, d: HbBackground, featName: string): SrdBackground {
  const fixed = d.toolsFixed.map((t) => t.name);
  const choose = d.toolsChooseCount > 0 ? { count: d.toolsChooseCount, label: d.toolsChooseLabel ?? 'เครื่องมือ' } : null;
  const options: EquipmentOption[] = [
    { id: 'A', items: d.gear.map((g) => ({ name: g.name, qty: g.qty, kind: 'gear' as const })), gp: d.gearGold },
    { id: 'B', items: [], gp: d.gold },
  ];
  return {
    key, name: d.name, abilities: [...d.abilities], feat: featName, skills: [...d.skills],
    tool: [...fixed, ...(choose ? [`${choose.label} ×${choose.count}`] : [])].join(', '),
    equipment: [...d.gear.map((g) => `${g.name} ×${g.qty}`), `${d.gearGold} GP`].join(', '),
    tools: { fixed, choose }, equipmentOptions: options,
  };
}

/** zod issues as Thai lines "path: message". */
export const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((i) => `${i.path.length ? `${i.path.join(' › ')}: ` : ''}${i.message}`);
