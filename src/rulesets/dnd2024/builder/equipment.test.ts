import { describe, expect, it } from 'vitest';
import type { EquipmentOption } from '../data/schema';
import { kitOf } from './equipment';

const fighterA: EquipmentOption = {
  id: 'A', gp: 4,
  items: [
    { name: 'Chain Mail', qty: 1, kind: 'armor', key: 'chain-mail' },
    { name: 'Greatsword', qty: 1, kind: 'weapon', key: 'greatsword' },
    { name: 'Javelin', qty: 8, kind: 'weapon', key: 'javelin' },
    { name: "Dungeoneer's Pack", qty: 1, kind: 'gear' },
  ],
};
const soldierA: EquipmentOption = {
  id: 'A', gp: 14,
  items: [
    { name: 'Spear', qty: 1, kind: 'weapon', key: 'spear' },
    { name: 'Arrows', qty: 20, kind: 'gear' },
    { name: "Healer's Kit", qty: 1, kind: 'gear' },
  ],
};

describe('kitOf', () => {
  it('splits armor, weapons and gear and adds the gold', () => {
    const kit = kitOf([fighterA, soldierA]);
    expect(kit.armor).toBe('chain-mail');
    expect(kit.shield).toBe(false);
    expect(kit.weapons).toEqual(['greatsword', 'javelin', 'spear']);
    expect(kit.gp).toBe(18);
  });

  it('keeps quantity > 1 weapons and gear as inventory lines', () => {
    const kit = kitOf([fighterA, soldierA]);
    expect(kit.inventory).toEqual([
      { name: 'Javelin', qty: 8, note: '' },
      { name: "Dungeoneer's Pack", qty: 1, note: '' },
      { name: 'Arrows', qty: 20, note: '' },
      { name: "Healer's Kit", qty: 1, note: '' },
    ]);
  });

  it('merges the same item from two sources, ignoring case', () => {
    const a: EquipmentOption = { id: 'A', gp: 0, items: [{ name: "Thieves' Tools", qty: 1, kind: 'gear' }, { name: 'Robe', qty: 1, kind: 'gear' }] };
    const b: EquipmentOption = { id: 'A', gp: 0, items: [{ name: "thieves' tools", qty: 1, kind: 'gear' }] };
    expect(kitOf([a, b]).inventory).toEqual([{ name: "Thieves' Tools", qty: 2, note: '' }, { name: 'Robe', qty: 1, note: '' }]);
  });

  it('a shield sets the flag; a second armor stays in the bag instead of replacing the first', () => {
    const shield: EquipmentOption = { id: 'A', gp: 0, items: [{ name: 'Shield', qty: 1, kind: 'shield', key: 'shield' }, { name: 'Leather Armor', qty: 1, kind: 'armor', key: 'leather-armor' }] };
    const kit = kitOf([fighterA, shield]);
    expect(kit.shield).toBe(true);
    expect(kit.armor).toBe('chain-mail');
    expect(kit.inventory.some((l) => l.name === 'Leather Armor')).toBe(true);
  });

  it('gold-only options are just gold', () => {
    expect(kitOf([{ id: 'B', items: [], gp: 155 }, { id: 'B', items: [], gp: 50 }])).toEqual({
      armor: null, shield: false, weapons: [], inventory: [], gp: 205,
    });
  });
});
