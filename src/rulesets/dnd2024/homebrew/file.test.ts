import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { fromHbText, HbFileError, MAX_FILE_BYTES, planImport, toHbFile } from './file';

const srd = SrdZ.parse(raw);
const item = (key: string, name = 'Ring') => ({ kind: 'hb-item', key, data: { name, desc: '' } });
const feat = { name: 'Lucky Star', type: 'origin', prerequisite: null, desc: 'Shine.', repeatable: false, boostAbilities: [], boostMax: 20 };
const bg = {
  name: 'Sailor', abilities: ['str', 'dex', 'wis'], feat: 'hb-lucky', skills: ['athletics', 'perception'],
  toolsFixed: [], toolsChooseCount: 0, toolsChooseLabel: null, gear: [], gearGold: 10, gold: 50,
};

describe('homebrew file', () => {
  it('exports only homebrew rows and reads its own file back', () => {
    const f = toHbFile([item('hb-ring'), { kind: 'homebrew', key: 'skills', data: {} }]);
    expect(f).toEqual({ format: 'tabletop-homebrew', ruleset: 'dnd2024', schemaVersion: 1, items: [item('hb-ring')] });
    expect(fromHbText(JSON.stringify(f))).toEqual(f);
  });

  it('refuses junk with a Thai message', () => {
    expect(() => fromHbText('{nope')).toThrow(HbFileError);
    expect(() => fromHbText(JSON.stringify({ format: 'tabletop-character' }))).toThrow(HbFileError);
    expect(() => fromHbText(JSON.stringify({ format: 'tabletop-homebrew', ruleset: 'custom', schemaVersion: 1, items: [] }))).toThrow(HbFileError);
    expect(() => fromHbText('x'.repeat(MAX_FILE_BYTES + 1))).toThrow('ไฟล์ใหญ่เกิน 1 MB');
  });

  it('refuses a file of another schema version', () => {
    for (const schemaVersion of [2, 0, '1', undefined]) {
      expect(() => fromHbText(JSON.stringify({ format: 'tabletop-homebrew', ruleset: 'dnd2024', schemaVersion, items: [] })))
        .toThrow('ไฟล์ homebrew รุ่นนี้ยังไม่รองรับ');
    }
  });

  it('lists malformed items and repeated kind/key as skipped, keeping the last repeat', () => {
    const file = fromHbText(JSON.stringify({
      format: 'tabletop-homebrew', ruleset: 'dnd2024', schemaVersion: 1,
      items: [
        item('hb-ring', 'First'), 42, { kind: 7, key: 'hb-x', data: {} }, { kind: 'hb-item', key: 'hb-y', data: 'nope' },
        { kind: 'hb-item', key: 'hb-z', data: [] }, item('hb-ring', 'Second'), item('hb-cape'),
      ],
    }));
    const plan = planImport(file, srd, []);
    expect(plan.add).toEqual([item('hb-ring', 'Second'), item('hb-cape')]);
    expect(plan.skip).toEqual([
      { kind: 'hb-item', key: 'hb-ring', reason: 'ซ้ำในไฟล์' },
      { kind: '', key: '', reason: 'รายการในไฟล์ไม่ถูกรูปแบบ' },
      { kind: '', key: 'hb-x', reason: 'รายการในไฟล์ไม่ถูกรูปแบบ' },
      { kind: 'hb-item', key: 'hb-y', reason: 'รายการในไฟล์ไม่ถูกรูปแบบ' },
      { kind: 'hb-item', key: 'hb-z', reason: 'รายการในไฟล์ไม่ถูกรูปแบบ' },
    ]);
  });

  it('plans adds, replacements and skips; a background may use a feat from the same file', () => {
    const file = {
      format: 'tabletop-homebrew' as const, ruleset: 'dnd2024' as const, schemaVersion: 1 as const,
      items: [
        item('hb-ring', 'New Ring'), item('hb-cape'),
        { kind: 'hb-item', key: 'BAD KEY', data: { name: 'x', desc: '' } },
        { kind: 'hb-class', key: 'hb-wizardish', data: {} },
        { kind: 'hb-weapon', key: 'hb-junk', data: { name: '' } },
        { kind: 'hb-feat', key: 'hb-lucky', data: feat },
        { kind: 'hb-background', key: 'hb-sailor', data: bg },
        { kind: 'hb-background', key: 'hb-lost', data: { ...bg, feat: 'hb-nowhere' } },
      ],
    };
    const plan = planImport(file, srd, [item('hb-ring')]);
    expect(plan.replace.map((i) => i.key)).toEqual(['hb-ring']);
    expect(plan.add.map((i) => i.key).sort()).toEqual(['hb-cape', 'hb-lucky', 'hb-sailor']);
    expect(plan.skip.map((s) => s.key).sort()).toEqual(['BAD KEY', 'hb-junk', 'hb-lost', 'hb-wizardish']);
  });

  it('caps each kind at 200 entries: over-cap adds are skipped', () => {
    const room = Array.from({ length: 199 }, (_, n) => item(`hb-old-${n}`));
    const file = {
      format: 'tabletop-homebrew' as const, ruleset: 'dnd2024' as const, schemaVersion: 1 as const,
      items: [item('hb-new-1'), item('hb-new-2'), item('hb-new-3')],
    };
    const plan = planImport(file, srd, room);
    expect(plan.add.map((i) => i.key)).toEqual(['hb-new-1']);
    expect(plan.skip).toEqual([
      { kind: 'hb-item', key: 'hb-new-2', reason: 'เกิน 200 ชิ้นต่อชนิด' },
      { kind: 'hb-item', key: 'hb-new-3', reason: 'เกิน 200 ชิ้นต่อชนิด' },
    ]);
  });

  it('a background whose Origin feat was cap-skipped is skipped too', () => {
    const room = Array.from({ length: 199 }, (_, n) => ({ kind: 'hb-feat', key: `hb-r-${String(n).padStart(3, '0')}`, data: feat }));
    const file = {
      format: 'tabletop-homebrew' as const, ruleset: 'dnd2024' as const, schemaVersion: 1 as const,
      items: [
        { kind: 'hb-feat', key: 'hb-x-feat', data: feat },
        { kind: 'hb-feat', key: 'hb-b-feat', data: feat },
        { kind: 'hb-background', key: 'hb-bg', data: { ...bg, feat: 'hb-b-feat' } },
      ],
    };
    const plan = planImport(file, srd, room);
    expect(plan.add.map((i) => i.key)).toEqual(['hb-x-feat']);
    expect(plan.replace).toEqual([]);
    expect(plan.skip).toEqual([
      { kind: 'hb-feat', key: 'hb-b-feat', reason: 'เกิน 200 ชิ้นต่อชนิด' },
      { kind: 'hb-background', key: 'hb-bg', reason: 'อ้างถึงของที่ไม่มี (เช่น Origin feat)' },
    ]);
  });

  it('a replacement at the cap is still a replacement', () => {
    const room = Array.from({ length: 200 }, (_, n) => item(`hb-old-${n}`));
    const file = {
      format: 'tabletop-homebrew' as const, ruleset: 'dnd2024' as const, schemaVersion: 1 as const,
      items: [item('hb-old-0', 'Renamed'), item('hb-new')],
    };
    const plan = planImport(file, srd, room);
    expect(plan.replace.map((i) => i.key)).toEqual(['hb-old-0']);
    expect(plan.add).toEqual([]);
    expect(plan.skip).toEqual([{ kind: 'hb-item', key: 'hb-new', reason: 'เกิน 200 ชิ้นต่อชนิด' }]);
  });

  it('measures the 1 MB limit in UTF-8 bytes, so Thai counts 3 bytes a character', () => {
    const thai = 'ก'.repeat(400_000);
    expect(thai.length).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(new TextEncoder().encode(thai).length).toBeGreaterThan(MAX_FILE_BYTES);
    expect(() => fromHbText(thai)).toThrow('ไฟล์ใหญ่เกิน 1 MB');
  });
});
