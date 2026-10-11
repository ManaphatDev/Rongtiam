import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { merge } from './merge';

const srd = SrdZ.parse(raw);
type Row = { kind: string; key: string; data: Record<string, unknown> };

const sword = {
  name: 'Flame Tongue', simple: false, ranged: false, damage: '1d8', damageType: 'Slashing', properties: [],
  versatile: null, rangeNormal: null, rangeLong: null, mastery: null, bonus: 1,
};
const feat = { name: 'Lucky Star', type: 'origin', prerequisite: null, desc: 'Shine.', repeatable: false, boostAbilities: [], boostMax: 20 };
const bg = (featKey: string) => ({
  name: 'Sailor', abilities: ['str', 'dex', 'wis'], feat: featKey, skills: ['athletics', 'perception'],
  toolsFixed: [], toolsChooseCount: 0, toolsChooseLabel: null, gear: [], gearGold: 10, gold: 50,
});

describe('merge', () => {
  it('a room without homebrew gets the SRD itself', () => {
    expect(merge(srd, [{ kind: 'homebrew', key: 'skills', data: {} }]).srd).toBe(srd);
  });

  it('appends valid entries in the SRD shape and lists broken rows', () => {
    const m = merge(srd, [
      { kind: 'hb-weapon', key: 'hb-flame', data: sword },
      { kind: 'hb-weapon', key: 'hb-bad', data: { ...sword, damage: 'lots' } },
      { kind: 'hb-weapon', key: 'NOT-HB', data: sword },
      { kind: 'hb-item', key: 'hb-ring', data: { name: 'Ring', desc: 'Shiny.' } },
    ]);
    expect(m.srd.weapons.at(-1)).toMatchObject({ key: 'hb-flame', bonus: 1 });
    expect(m.srd.weapons).toHaveLength(srd.weapons.length + 1);
    expect(m.items).toEqual([{ key: 'hb-ring', name: 'Ring', desc: 'Shiny.' }]);
    expect(m.broken.map((b) => b.key).sort()).toEqual(['NOT-HB', 'hb-bad']);
    expect(srd.weapons.some((w) => w.key === 'hb-flame')).toBe(false); // the base is not mutated
  });

  it('a background resolves its Origin feat key to the feat name, SRD or homebrew', () => {
    const m = merge(srd, [
      { kind: 'hb-feat', key: 'hb-lucky', data: feat },
      { kind: 'hb-background', key: 'hb-sailor', data: bg('hb-lucky') },
      { kind: 'hb-background', key: 'hb-soldierish', data: { ...bg('alert'), name: 'Soldierish' } },
    ]);
    expect(m.srd.backgrounds.find((b) => b.key === 'hb-sailor')?.feat).toBe('Lucky Star');
    expect(m.srd.backgrounds.find((b) => b.key === 'hb-soldierish')?.feat).toBe('Alert');
  });

  it('a background whose feat is missing or not an Origin feat is broken, not offered', () => {
    const m = merge(srd, [
      { kind: 'hb-background', key: 'hb-a', data: bg('hb-gone') },
      { kind: 'hb-background', key: 'hb-b', data: bg('grappler') }, // a general feat
    ]);
    expect(m.srd.backgrounds.some((b) => b.key.startsWith('hb-'))).toBe(false);
    expect(m.broken.map((b) => b.key).sort()).toEqual(['hb-a', 'hb-b']);
  });

  it('keeps at most 200 entries per kind, by key', () => {
    const rows: Row[] = Array.from({ length: 205 }, (_, i) => ({ kind: 'hb-item', key: `hb-i${String(i).padStart(3, '0')}`, data: { name: `I${i}`, desc: '' } }));
    const m = merge(srd, rows);
    expect(m.items).toHaveLength(200);
    expect(m.items.at(-1)?.key).toBe('hb-i199');
  });

  it('the same row data gives the same object; changed data gives a new one', () => {
    const data = { ...sword };
    const rows: Row[] = [{ kind: 'hb-weapon', key: 'hb-flame', data }];
    const a = merge(srd, rows).srd;
    expect(merge(srd, [{ kind: 'hb-weapon', key: 'hb-flame', data }]).srd).toBe(a);
    expect(merge(srd, [{ kind: 'hb-weapon', key: 'hb-flame', data: { ...sword } }]).srd).not.toBe(a);
  });
  it('the cache also tells rows apart by key and kind, not only by data identity', () => {
    const data = { ...sword };
    const a = merge(srd, [{ kind: 'hb-weapon', key: 'hb-flame', data }]);
    const b = merge(srd, [{ kind: 'hb-weapon', key: 'hb-other', data }]);
    expect(b.srd).not.toBe(a.srd);
    expect(b.srd.weapons.at(-1)?.key).toBe('hb-other');

    const thing = { name: 'Thing', desc: 'x' };
    expect(merge(srd, [{ kind: 'hb-weapon', key: 'hb-thing', data: thing }]).items).toEqual([]);
    expect(merge(srd, [{ kind: 'hb-item', key: 'hb-thing', data: thing }]).items).toEqual([{ key: 'hb-thing', name: 'Thing', desc: 'x' }]);
  });
});
