import { describe, expect, it } from 'vitest';
import type { CharacterRow } from '../sync/types';
import { fileName, FORMAT, fromText, ImportError, toFile } from './transfer';

const row: CharacterRow = { id: 'c1', room_id: 'r', owner_id: 'u', ruleset: 'dnd2024', visibility: 'party', data: { name: 'Pip', level: 3 }, rev: 4 };

describe('character files', () => {
  it('round-trips the sheet data without room or owner details', () => {
    const text = JSON.stringify(toFile(row));
    expect(JSON.parse(text)).toEqual({ format: FORMAT, ruleset: 'dnd2024', schemaVersion: 1, data: { name: 'Pip', level: 3 } });
    expect(fromText(text).data).toEqual(row.data);
    expect(text).not.toContain('"u"');
  });

  it.each([
    ['not json', /อ่านไฟล์ไม่ได้/],
    ['{"format":"other","ruleset":"x","data":{}}', /ไม่ใช่ไฟล์ตัวละคร/],
    ['{"format":"tabletop-character","ruleset":"x","data":[]}', /ไม่ใช่ไฟล์ตัวละคร/],
    ['{"format":"tabletop-character","ruleset":"x","schemaVersion":9,"data":{}}', /เวอร์ชัน/],
    [`{"format":"tabletop-character","ruleset":"x","schemaVersion":1,"data":{"n":"${'x'.repeat(260000)}"}}`, /ใหญ่เกินไป/],
  ])('refuses bad file %#', (text, msg) => {
    expect(() => fromText(text)).toThrow(ImportError);
    expect(() => fromText(text)).toThrow(msg);
  });

  it('makes safe file names', () => {
    expect(fileName('Pip/the:Bold?')).toBe('Pip_the_Bold_.json');
    expect(fileName('')).toBe('character.json');
  });
});
