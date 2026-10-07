// Folds the chosen starting-equipment sets (the class's and the background's) into what the sheet stores:
// one worn armor, a shield flag, weapon keys, bag lines and gold.
import type { EquipmentOption } from '../data/schema';

export interface InventoryLine { name: string; qty: number; note: string }
export interface Kit {
  armor: string | null;
  shield: boolean;
  weapons: string[];
  inventory: InventoryLine[];
  gp: number;
}

function addLine(kit: Kit, name: string, qty: number) {
  const have = kit.inventory.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (have) have.qty += qty;
  else kit.inventory.push({ name, qty, note: '' });
}

export function kitOf(options: EquipmentOption[]): Kit {
  const kit: Kit = { armor: null, shield: false, weapons: [], inventory: [], gp: 0 };
  for (const opt of options) {
    kit.gp += opt.gp;
    for (const it of opt.items) {
      if (it.kind === 'weapon' && it.key) {
        if (!kit.weapons.includes(it.key)) kit.weapons.push(it.key);
        if (it.qty > 1) addLine(kit, it.name, it.qty);
      } else if (it.kind === 'armor' && it.key && !kit.armor) kit.armor = it.key;
      else if (it.kind === 'shield') kit.shield = true;
      else addLine(kit, it.name, it.qty);
    }
  }
  return kit;
}
