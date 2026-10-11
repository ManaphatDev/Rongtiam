// The room's homebrew as a file, to carry it to another room. An imported file is untrusted: it is size-checked,
// shape-checked, and every item is validated like a row before anything is written; the GM sees the plan first.
import type { Srd } from '../data/schema';
import { HB_KEY, HB_SCHEMAS, MAX_PER_KIND, issuesOf, kindOfRow } from './kinds';
import { merge } from './merge';

export const HB_FORMAT = 'tabletop-homebrew';
export const MAX_FILE_BYTES = 1_000_000;

type Row = { kind: string; key: string; data: Record<string, unknown> };
export interface HbFileItem { kind: string; key: string; data: Record<string, unknown> }
export interface HbFile { format: typeof HB_FORMAT; ruleset: 'dnd2024'; schemaVersion: 1; items: HbFileItem[] }
export interface ImportPlan { add: HbFileItem[]; replace: HbFileItem[]; skip: { kind: string; key: string; reason: string }[] }

export class HbFileError extends Error {}

export const toHbFile = (content: Row[]): HbFile => ({
  format: HB_FORMAT, ruleset: 'dnd2024', schemaVersion: 1,
  items: content.filter((r) => r.kind.startsWith('hb-')).map((r) => ({ kind: r.kind, key: r.key, data: r.data })),
});

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function fromHbText(text: string): HbFile {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new HbFileError('ไฟล์ใหญ่เกิน 1 MB');
  let f: unknown;
  try {
    f = JSON.parse(text);
  } catch {
    throw new HbFileError('อ่านไฟล์ไม่ออก ไฟล์ต้องเป็น JSON ที่ส่งออกจาก homebrew');
  }
  if (!isObject(f) || f.format !== HB_FORMAT) throw new HbFileError('ไฟล์นี้ไม่ใช่ไฟล์ homebrew');
  if (f.ruleset !== 'dnd2024') throw new HbFileError('ไฟล์นี้เป็น homebrew ของระบบกฎอื่น');
  if (!Array.isArray(f.items)) throw new HbFileError('ไฟล์ homebrew ไม่มีรายการของ');
  const items = f.items.filter((i): i is HbFileItem =>
    isObject(i) && typeof i.kind === 'string' && typeof i.key === 'string' && isObject(i.data));
  return { format: HB_FORMAT, ruleset: 'dnd2024', schemaVersion: 1, items };
}

/** What importing would do. A background's feat may come from the room or from the same file. */
export function planImport(file: HbFile, base: Srd, content: Row[]): ImportPlan {
  const plan: ImportPlan = { add: [], replace: [], skip: [] };
  const valid: HbFileItem[] = [];
  for (const i of file.items) {
    const kind = kindOfRow(i.kind);
    if (!kind) plan.skip.push({ kind: i.kind, key: i.key, reason: 'ไม่รู้จักชนิดนี้' });
    else if (!HB_KEY.test(i.key)) plan.skip.push({ kind: i.kind, key: i.key, reason: 'key ไม่ถูกรูปแบบ' });
    else {
      const p = HB_SCHEMAS[kind].safeParse(i.data);
      if (p.success) valid.push(i);
      else plan.skip.push({ kind: i.kind, key: i.key, reason: issuesOf(p.error).join('; ') });
    }
  }
  // Each kind holds at most MAX_PER_KIND entries: a replacement keeps the count, an add takes a slot.
  const count = new Map<string, number>();
  for (const r of content) if (r.kind.startsWith('hb-')) count.set(r.kind, (count.get(r.kind) ?? 0) + 1);
  for (const i of valid) {
    if (content.some((r) => r.kind === i.kind && r.key === i.key)) plan.replace.push(i);
    else if ((count.get(i.kind) ?? 0) >= MAX_PER_KIND) plan.skip.push({ kind: i.kind, key: i.key, reason: 'เกิน 200 ชิ้นต่อชนิด' });
    else {
      count.set(i.kind, (count.get(i.kind) ?? 0) + 1);
      plan.add.push(i);
    }
  }
  // Reference check last, on the room plus what would be accepted: a background whose Origin feat was cap-skipped is not added.
  const byKey = new Map(content.filter((r) => r.kind.startsWith('hb-')).map((r) => [`${r.kind}/${r.key}`, r]));
  for (const i of [...plan.add, ...plan.replace]) byKey.set(`${i.kind}/${i.key}`, { ...i, data: { ...i.data } });
  const broken = new Set(merge(base, [...byKey.values()]).broken.map((b) => `${b.kind}/${b.key}`));
  const unbroken = (list: HbFileItem[]) => list.filter((i) => {
    if (!broken.has(`${i.kind}/${i.key}`)) return true;
    plan.skip.push({ kind: i.kind, key: i.key, reason: 'อ้างถึงของที่ไม่มี (เช่น Origin feat)' });
    return false;
  });
  plan.add = unbroken(plan.add);
  plan.replace = unbroken(plan.replace);
  return plan;
}
