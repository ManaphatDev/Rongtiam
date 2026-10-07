// The D&D 2024 ruleset plugin. SRD data loads on first use (ready()).
import type { RulesetContext, RulesetModule } from '../core/types';
import { SrdZ, type Srd } from './data/schema';
import { CONDITIONS } from './i18n/th';
import { derive } from './derive';
import { parseCharacter, newCharacter } from './model';
import { roomSkillsOf, type RoomSkills } from './roomSkills';
import { activeConditions, applyHp, bars, rollActions, toggleCondition, view } from './rules';

let srd: Srd | null = null;
export function getSrd(): Srd {
  if (!srd) throw new Error('dnd2024 ruleset used before ready()');
  return srd;
}

// Sheet data and room skills are replaced (never mutated) on every change, so views are cached by identity.
const cache = new WeakMap<RoomSkills, WeakMap<object, ReturnType<typeof view>>>();
const viewOf = (data: Record<string, unknown>, ctx: RulesetContext) => {
  const rs = roomSkillsOf(ctx);
  let byData = cache.get(rs);
  if (!byData) cache.set(rs, (byData = new WeakMap()));
  let v = byData.get(data);
  if (!v) byData.set(data, (v = view(data, getSrd(), rs.skills)));
  return v;
};

export const dnd2024: RulesetModule = {
  id: 'dnd2024',
  name: 'D&D 2024 (SRD 5.2)',
  async ready() {
    srd ??= SrdZ.parse((await import('./data/srd.json')).default);
  },
  // A new character starts at full health.
  newCharacter: () => {
    const c = newCharacter();
    c.hp.current = derive(c, getSrd()).maxHp;
    return c as unknown as Record<string, unknown>;
  },
  parse: (raw) => parseCharacter(raw) as unknown as Record<string, unknown>,
  nameOf: (data) => String(data.name || 'ไม่มีชื่อ'),
  rolls: (data, ctx) => {
    const v = viewOf(data, ctx);
    return rollActions(v.c, v.d);
  },
  conditions: () => Object.entries(CONDITIONS).map(([key, c]) => ({ key, label: c.th, icon: c.icon })),
  activeConditions: (data) => activeConditions(parseCharacter(data)),
  toggleCondition: (data, key) => toggleCondition(parseCharacter(data), key),
  bars: (data, ctx) => {
    const v = viewOf(data, ctx);
    return bars(v.c, v.d);
  },
  applyHp: (data, delta, ctx) => {
    const v = viewOf(data, ctx);
    return applyHp(v.c, v.d, delta);
  },
  initiative: (data, ctx) => {
    const v = viewOf(data, ctx);
    const b = v.d.initiative;
    return { expr: b ? `1d20${b > 0 ? '+' : ''}${b}` : '1d20', tie: v.c.abilities.dex };
  },
  Sheet: () => import('./Sheet.svelte').then((m) => m.default),
};

export { viewOf };
