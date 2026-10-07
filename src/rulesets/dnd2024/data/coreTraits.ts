// Reads the structured parts of an SRD class or background out of its prose: skill choices, tools, starting
// equipment, and the Warlock's invocations. Pure, so it is unit-tested; scripts/srd/build.ts feeds it raw text.
import type { EquipmentOption, ToolGrant } from './schema';

interface Named { key: string; name: string }
export interface Catalog { weapons: Named[]; armor: Named[] }

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Words the PDF text extraction split in two. Fixed in equipment text; the build reports each one it fixed. */
const BROKEN_WORDS: [string, string][] = [['Ar mor', 'Armor'], ['Ar rows', 'Arrows'], ['Ar cane', 'Arcane']];

export function repairText(text: string, fixed: Set<string> = new Set()): string {
  let out = text;
  for (const [bad, good] of BROKEN_WORDS) {
    if (!out.includes(bad)) continue;
    out = out.split(bad).join(good);
    fixed.add(`${bad} → ${good}`);
  }
  return out;
}

/** The value of one `|Label|value|` row of a markdown table, or null. */
export function tableRow(table: string, label: string): string | null {
  return new RegExp(`(?:^|\\|)${label}\\|([^|\\n]*)\\|`).exec(table)?.[1]?.trim() ?? null;
}

/** "Choose 2: Acrobatics, Athletics, or Survival" / "Choose any 3 skills" → skill keys. Null if a name is unknown. */
export function parseSkillChoice(value: string, skills: Record<string, { en: string }>) {
  const byName = Object.fromEntries(Object.entries(skills).map(([key, s]) => [squash(s.en), key]));
  const any = /^Choose any (\d+) skills?$/i.exec(value.trim());
  if (any) return { count: Number(any[1]), from: Object.keys(skills) };
  const m = /^Choose (\d+):\s*(.+)$/i.exec(value.trim());
  if (!m) return null;
  const from = m[2]
    .split(/,\s*|\s+or\s+/)
    .map((x) => x.replace(/^or\s+/i, '').trim())
    .filter(Boolean)
    .map((x) => byName[squash(x)]);
  return from.length > 0 && from.every(Boolean) ? { count: Number(m[1]), from } : null;
}

const WORD_NUMBER: Record<string, number> = { one: 1, two: 2, three: 3 };

/** "Thieves' Tools" is fixed; "Choose 3 Musical Instruments" / "Choose one kind of Gaming Set" is the player's to name. */
export function parseTools(value: string | null): ToolGrant {
  const v = value?.trim();
  if (!v || /^none$/i.test(v)) return { fixed: [], choose: null };
  const m = /^Choose (\d+|one|two|three)\s+(?:kinds? of |types? of )?(.+)$/i.exec(v);
  if (m) return { fixed: [], choose: { count: WORD_NUMBER[m[1].toLowerCase()] ?? Number(m[1]), label: m[2].trim() } };
  return { fixed: [v], choose: null };
}

function findByName(list: Named[], name: string) {
  const q = squash(name);
  return list.find((x) => {
    const n = squash(x.name);
    return q === n || q === `${n}s` || q === `${n}es`;
  });
}

/** "Choose A or B: (A) Chain Mail, 8 Javelins, and 4 GP; or (B) 155 GP" → the sets. Null if any part isn't understood. */
export function parseEquipment(value: string, catalog: Catalog, fixed: Set<string> = new Set()): EquipmentOption[] | null {
  const text = repairText(value, fixed).replace(/\*/g, '');
  const start = text.indexOf('(A)');
  if (start < 0) return null;
  const out: EquipmentOption[] = [];
  for (const part of text.slice(start).split(/;\s*(?:or\s+)?/)) {
    const m = /^\(([ABC])\)\s*(.+)$/.exec(part.trim());
    if (!m) return null;
    let body = m[2];
    let gp = 0;
    const g = /(?:,\s*(?:and\s+)?|^)(\d+)\s*GP$/i.exec(body);
    if (g) {
      gp = Number(g[1]);
      body = body.slice(0, g.index);
    }
    const items = body
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const q = /^(\d+)\s+(.+)$/.exec(s);
        const qty = q ? Number(q[1]) : 1;
        const name = q ? q[2] : s;
        const weapon = findByName(catalog.weapons, name);
        if (weapon) return { name: weapon.name, qty, kind: 'weapon' as const, key: weapon.key };
        const armor = findByName(catalog.armor, name);
        if (armor) return { name: armor.name, qty, kind: armor.key === 'shield' ? ('shield' as const) : ('armor' as const), key: armor.key };
        return { name, qty, kind: 'gear' as const };
      });
    out.push({ id: m[1] as EquipmentOption['id'], items, gp });
  }
  return out;
}

/** The Warlock's "### Name" blocks, each with an optional "*Prerequisite: …*" line. */
export function parseInvocations(text: string): { name: string; prerequisite: string | null }[] {
  return [...text.matchAll(/^### (.+)\n\n(?:\*Prerequisite: (.+)\*\n\n)?/gm)].map((m) => ({ name: m[1].trim(), prerequisite: m[2] ?? null }));
}
