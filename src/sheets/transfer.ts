// Character files: export a sheet to .json and import it into any room using the same ruleset.
import type { CharacterRow } from '../sync/types';

export const FORMAT = 'tabletop-character';
const MAX_BYTES = 250_000;

export interface CharacterFile {
  format: typeof FORMAT;
  ruleset: string;
  schemaVersion: 1;
  data: Record<string, unknown>;
}

export function toFile(c: CharacterRow): CharacterFile {
  return { format: FORMAT, ruleset: c.ruleset, schemaVersion: 1, data: c.data };
}

export class ImportError extends Error {}

/** Reads a character file; the ruleset's own parse then validates `data`. */
export function fromText(text: string): CharacterFile {
  if (text.length > MAX_BYTES) throw new ImportError('ไฟล์ใหญ่เกินไป (จำกัด 250 KB)');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ .json ที่ส่งออกจากโรงเตี๊ยม');
  }
  const f = raw as Partial<CharacterFile>;
  if (!f || f.format !== FORMAT || typeof f.ruleset !== 'string' || !f.data || typeof f.data !== 'object' || Array.isArray(f.data)) {
    throw new ImportError('ไฟล์นี้ไม่ใช่ไฟล์ตัวละครของโรงเตี๊ยม');
  }
  if (f.schemaVersion !== 1) throw new ImportError('ไฟล์มาจากเวอร์ชันที่ใหม่กว่า อัปเดตหน้าเว็บแล้วลองใหม่');
  return { format: FORMAT, ruleset: f.ruleset, schemaVersion: 1, data: f.data as Record<string, unknown> };
}

export function fileName(name: string) {
  return `${(name || 'character').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}.json`;
}
