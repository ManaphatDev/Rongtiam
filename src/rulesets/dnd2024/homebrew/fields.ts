// What the GM's form shows for each homebrew kind: one descriptor per field, in the order shown, plus the blank
// data a new entry starts from. HbForm.svelte renders these; validation is the kind's zod schema (kinds.ts).
import type { Srd } from '../data/schema';
import { ABILITIES, ABILITY_TH, SKILLS } from '../i18n/th';
import { WEAPON_PROPERTIES, type HbKind } from './kinds';

export type Opt = { id: string; label: string };
export type Field =
  | { k: 'text'; path: string; label: string; max: number; nullable?: boolean }
  | { k: 'area'; path: string; label: string; max: number; nullable?: boolean }
  | { k: 'int'; path: string; label: string; min: number; max: number; nullable?: boolean }
  | { k: 'bool'; path: string; label: string }
  | { k: 'one'; path: string; label: string; options: (srd: Srd) => Opt[]; nullable?: boolean }
  | { k: 'many'; path: string; label: string; options: (srd: Srd) => Opt[] }
  | { k: 'rows'; path: string; label: string; max: number; fields: Field[]; blank: () => Record<string, unknown> };

const fixed = (list: Opt[]) => () => list;
const abilities = fixed(ABILITIES.map((a) => ({ id: a, label: ABILITY_TH[a].name })));
const skills = fixed(Object.entries(SKILLS).map(([id, s]) => ({ id, label: s.th })));
const classes = (srd: Srd) => srd.classes.map((c) => ({ id: c.key, label: c.name }));
const originFeats = (srd: Srd) => srd.feats.filter((f) => f.type === 'origin').map((f) => ({ id: f.key, label: f.name }));
const masteries = (srd: Srd) => [...new Set(srd.weapons.map((w) => w.mastery).filter((m): m is string => !!m))].map((m) => ({ id: m, label: m }));
const DAMAGE = ['Slashing', 'Piercing', 'Bludgeoning', 'Acid', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Poison', 'Psychic', 'Radiant', 'Thunder'];
const damage = fixed(DAMAGE.map((d) => ({ id: d, label: d })));
const schools = (srd: Srd) => [...new Set(srd.spells.map((s) => s.school))].sort().map((s) => ({ id: s, label: s }));

export const KIND_LABEL: Record<HbKind, string> = {
  weapon: 'อาวุธ', armor: 'เกราะ', item: 'ไอเทม', spell: 'เวท', feat: 'feat', species: 'เผ่า', background: 'ฉากหลัง',
};

export const FIELDS: Record<HbKind, Field[]> = {
  weapon: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'bool', path: 'simple', label: 'อาวุธ Simple (ไม่ติ๊ก = Martial)' },
    { k: 'bool', path: 'ranged', label: 'อาวุธระยะไกล' },
    { k: 'text', path: 'damage', label: 'เต๋าดาเมจ (เช่น 1d8)', max: 20 },
    { k: 'one', path: 'damageType', label: 'ชนิดดาเมจ', options: damage },
    { k: 'many', path: 'properties', label: 'คุณสมบัติ', options: fixed(WEAPON_PROPERTIES.map((p) => ({ id: p, label: p }))) },
    { k: 'text', path: 'versatile', label: 'เต๋าตอนถือสองมือ (Versatile)', max: 20, nullable: true },
    { k: 'int', path: 'rangeNormal', label: 'ระยะปกติ (ฟุต)', min: 5, max: 1000, nullable: true },
    { k: 'int', path: 'rangeLong', label: 'ระยะไกลสุด (ฟุต)', min: 5, max: 1000, nullable: true },
    { k: 'one', path: 'mastery', label: 'Weapon Mastery', options: masteries, nullable: true },
    { k: 'int', path: 'bonus', label: 'โบนัสเวทมนตร์ (+0 ถึง +3)', min: 0, max: 3 },
  ],
  armor: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'one', path: 'category', label: 'หมวด', options: fixed([{ id: 'light', label: 'เบา' }, { id: 'medium', label: 'กลาง' }, { id: 'heavy', label: 'หนัก' }]) },
    { k: 'int', path: 'base', label: 'AC พื้นฐาน', min: 0, max: 30 },
    { k: 'bool', path: 'dex', label: 'บวกค่าความว่องไว' },
    { k: 'int', path: 'cap', label: 'บวกความว่องไวได้ไม่เกิน', min: 0, max: 10, nullable: true },
    { k: 'int', path: 'strength', label: 'ต้องมีพละกำลังอย่างน้อย', min: 1, max: 30, nullable: true },
    { k: 'bool', path: 'stealthDisadvantage', label: 'เสียเปรียบ Stealth' },
    { k: 'int', path: 'bonus', label: 'โบนัสเวทมนตร์ (+0 ถึง +3)', min: 0, max: 3 },
  ],
  item: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'area', path: 'desc', label: 'คำอธิบาย', max: 2000 },
  ],
  spell: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'int', path: 'level', label: 'เลเวลเวท (0 = แคนทริป)', min: 0, max: 9 },
    { k: 'one', path: 'school', label: 'สำนัก', options: schools },
    { k: 'many', path: 'classes', label: 'อยู่ในรายชื่อเวทของอาชีพ', options: classes },
    { k: 'text', path: 'castingTime', label: 'เวลาร่าย', max: 60 },
    { k: 'text', path: 'range', label: 'ระยะ', max: 60 },
    { k: 'text', path: 'components', label: 'ส่วนประกอบ', max: 120 },
    { k: 'text', path: 'duration', label: 'ระยะเวลา', max: 60 },
    { k: 'bool', path: 'concentration', label: 'ต้องตั้งสมาธิ (Concentration)' },
    { k: 'bool', path: 'ritual', label: 'ร่ายแบบพิธีกรรมได้ (Ritual)' },
    { k: 'one', path: 'save', label: 'เซฟที่เป้าหมายทอย', options: abilities, nullable: true },
    { k: 'bool', path: 'attack', label: 'ทอยโจมตีด้วยเวท' },
    { k: 'text', path: 'damage', label: 'เต๋าดาเมจ', max: 20, nullable: true },
    { k: 'one', path: 'damageType', label: 'ชนิดดาเมจ', options: damage, nullable: true },
    { k: 'area', path: 'desc', label: 'คำอธิบาย', max: 4000 },
    { k: 'area', path: 'higher', label: 'ร่ายด้วยช่องเวทที่สูงขึ้น', max: 2000, nullable: true },
  ],
  feat: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'one', path: 'type', label: 'ประเภท', options: fixed([
      { id: 'origin', label: 'Origin' }, { id: 'general', label: 'General' }, { id: 'fighting style', label: 'Fighting Style' }, { id: 'epic boon', label: 'Epic Boon' },
    ]) },
    { k: 'text', path: 'prerequisite', label: 'เงื่อนไข (เช่น Level 4+, Strength 13+)', max: 120, nullable: true },
    { k: 'area', path: 'desc', label: 'คำอธิบาย', max: 4000 },
    { k: 'bool', path: 'repeatable', label: 'เลือกซ้ำได้' },
    { k: 'many', path: 'boostAbilities', label: 'ค่าพลังที่ feat นี้เพิ่ม +1 (ไม่เลือก = ไม่เพิ่ม)', options: abilities },
    { k: 'one', path: 'boostMax', label: 'เพิ่มได้ถึง', options: fixed([{ id: '20', label: '20' }, { id: '30', label: '30 (Epic Boon)' }]) },
  ],
  species: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'one', path: 'size', label: 'ขนาด', options: fixed([{ id: 'Small', label: 'เล็ก' }, { id: 'Medium', label: 'กลาง' }, { id: 'Large', label: 'ใหญ่' }]) },
    { k: 'int', path: 'speed', label: 'ความเร็ว (ฟุต)', min: 5, max: 120 },
    { k: 'rows', path: 'traits', label: 'ลักษณะของเผ่า', max: 12, blank: () => ({ name: '', desc: '' }), fields: [
      { k: 'text', path: 'name', label: 'ชื่อลักษณะ', max: 80 },
      { k: 'area', path: 'desc', label: 'คำอธิบาย', max: 2000 },
    ] },
  ],
  background: [
    { k: 'text', path: 'name', label: 'ชื่อ', max: 80 },
    { k: 'many', path: 'abilities', label: 'ค่าพลัง 3 ค่าของฉากหลัง', options: abilities },
    { k: 'one', path: 'feat', label: 'Origin feat', options: originFeats },
    { k: 'many', path: 'skills', label: 'สกิล 2 อย่าง', options: skills },
    { k: 'rows', path: 'toolsFixed', label: 'เครื่องมือที่ได้', max: 4, blank: () => ({ name: '' }), fields: [
      { k: 'text', path: 'name', label: 'ชื่อเครื่องมือ', max: 80 },
    ] },
    { k: 'int', path: 'toolsChooseCount', label: 'ให้ผู้เล่นเลือกเครื่องมือเองกี่อย่าง', min: 0, max: 5 },
    { k: 'text', path: 'toolsChooseLabel', label: 'เลือกจากกลุ่ม (เช่น Musical Instrument)', max: 80, nullable: true },
    { k: 'rows', path: 'gear', label: 'อุปกรณ์ชุด A', max: 20, blank: () => ({ name: '', qty: 1 }), fields: [
      { k: 'text', path: 'name', label: 'ชื่อของ', max: 80 },
      { k: 'int', path: 'qty', label: 'จำนวน', min: 1, max: 99 },
    ] },
    { k: 'int', path: 'gearGold', label: 'ทองในชุด A (GP)', min: 0, max: 1000 },
    { k: 'int', path: 'gold', label: 'ชุด B: ทองอย่างเดียว (GP)', min: 0, max: 1000 },
  ],
};

export const BLANK: Record<HbKind, () => Record<string, unknown>> = {
  weapon: () => ({ name: '', simple: true, ranged: false, damage: '1d6', damageType: 'Slashing', properties: [], versatile: null, rangeNormal: null, rangeLong: null, mastery: null, bonus: 0 }),
  armor: () => ({ name: '', category: 'light', base: 11, dex: true, cap: null, strength: null, stealthDisadvantage: false, bonus: 0 }),
  item: () => ({ name: '', desc: '' }),
  spell: () => ({ name: '', level: 1, school: 'Evocation', classes: [], castingTime: 'Action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', concentration: false, ritual: false, save: null, attack: false, damage: null, damageType: null, desc: '', higher: null }),
  feat: () => ({ name: '', type: 'general', prerequisite: null, desc: '', repeatable: false, boostAbilities: [], boostMax: 20 }),
  species: () => ({ name: '', size: 'Medium', speed: 30, traits: [] }),
  background: () => ({ name: '', abilities: [], feat: 'alert', skills: [], toolsFixed: [], toolsChooseCount: 0, toolsChooseLabel: null, gear: [], gearGold: 0, gold: 50 }),
};
