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
});
