// The bits of SRD prose the level-up reads: Metamagic option names, feat prerequisites, what a feat adds to an
// ability score, invocation prerequisites. Pure; each reader is tested against srd.json.
import type { Srd } from '../data/schema';
import { ABILITIES, ABILITY_TH, type Ability } from '../i18n/th';

const ABILITY_BY_NAME = Object.fromEntries(ABILITIES.map((a) => [ABILITY_TH[a].en.toLowerCase(), a])) as Record<string, Ability>;

/** Open5e leaves markdown in a few names ("**Lessons of the First Ones**"). */
export const plainName = (name: string) => name.replace(/\*/g, '').trim();

/**
 * The options listed under the Sorcerer's "Metamagic Options" feature, in the SRD's (alphabetical) order. Each name
 * sits on the line above its "*Cost:" line; Open5e drops the "###" on one of them (Subtle Spell), so the marker is
 * the anchor, not the heading.
 */
export function metamagicOptions(srd: Srd): string[] {
  const f = srd.classes.find((c) => c.key === 'sorcerer')?.features.find((x) => x.name === 'Metamagic Options');
  return [...(f?.desc ?? '').matchAll(/^\s*(?:### )?(.+?)\s*\n+\*Cost:/gm)].map((m) => m[1].trim());
}

/**
 * What a feat adds to ability scores: "Increase your Strength or Dexterity score by 1, to a maximum of 20" names
 * the abilities; "Increase one ability score of your choice by 1, to a maximum of 30" allows any. Null if nothing.
 */
export function featBoost(desc: string): { abilities: Ability[]; max: number } | null {
  const m = /Increase (?:your )?(.+?) scores? (?:of your choice )?by 1, to a maximum of (\d+)/i.exec(desc);
  if (!m) return null;
  const words = m[1].toLowerCase();
  const named = ABILITIES.filter((a) => new RegExp(`\\b${ABILITY_TH[a].en.toLowerCase()}\\b`).test(words));
  return { abilities: named.length ? named : [...ABILITIES], max: Number(m[2]) };
}

/** A feat's ability increase: the homebrew `boost` field when present (null means none), else read from the text. */
export function boostOf(f: { desc: string; boost?: { abilities: Ability[]; max: number } | null }): { abilities: Ability[]; max: number } | null {
  return f.boost !== undefined ? f.boost : featBoost(f.desc);
}

/**
 * Whether a character meets a feat prerequisite such as "Level 4+, Strength or Dexterity 13+" or
 * "Level 19+, Spellcasting Feature". Parts the reader doesn't recognise count as met.
 */
export function meetsPrerequisite(text: string | null, level: number, scores: Record<Ability, number>, caster: boolean): boolean {
  if (!text) return true;
  for (const part of text.split(',').map((s) => s.trim())) {
    const lv = /^Level (\d+)\+/i.exec(part);
    if (lv) {
      if (level < Number(lv[1])) return false;
      continue;
    }
    if (/^Spellcasting/i.test(part)) {
      if (!caster) return false;
      continue;
    }
    const ab = /^(.+?) (\d+)\+$/.exec(part);
    if (ab) {
      const names = ab[1].toLowerCase().split(/\s+or\s+/).map((n) => ABILITY_BY_NAME[n]).filter((a): a is Ability => !!a);
      if (names.length && !names.some((a) => scores[a] >= Number(ab[2]))) return false;
    }
  }
  return true;
}

/**
 * Whether a Warlock at `level` who knows `known` invocations may take one with this prerequisite
 * ("Level 5+ Warlock, Pact of the Blade Invocation"). A cantrip requirement can't be checked here (spells are the
 * player's to manage on the sheet) and counts as met.
 */
export function invocationOpen(prereq: string | null, level: number, known: string[]): boolean {
  if (!prereq) return true;
  const lv = /Level (\d+)\+/i.exec(prereq);
  if (lv && level < Number(lv[1])) return false;
  const inv = /,\s*(.+?) Invocation$/i.exec(prereq);
  return !inv || known.map(plainName).includes(inv[1].trim());
}
