// The game systems a room can use. Modules (and their data) load only when a room needs them.
import type { RulesetModule } from './core/types';

export const RULESETS: { id: string; name: string; load: () => Promise<RulesetModule> }[] = [
  { id: 'dnd2024', name: 'D&D 2024 (SRD 5.2)', load: () => import('./dnd2024').then((m) => m.dnd2024) },
  { id: 'custom', name: 'ระบบที่ GM ออกแบบเอง', load: () => import('./custom').then((m) => m.custom) },
];

const loaded = new Map<string, Promise<RulesetModule>>();

/** The ready-to-use module for a ruleset id, or null for an unknown one. */
export function loadRuleset(id: string): Promise<RulesetModule> | null {
  const entry = RULESETS.find((r) => r.id === id);
  if (!entry) return null;
  let p = loaded.get(id);
  if (!p) {
    p = entry.load().then(async (m) => (await m.ready(), m));
    loaded.set(id, p);
    p.catch(() => loaded.delete(id));
  }
  return p;
}
