// A D&D 2024 character as stored in characters.data. Everything derivable (AC, saves, slots...) is computed by
// derive.ts; this holds only the player's choices and the state that changes in play. Parsing fills defaults, so
// older or partial data keeps loading as the model grows (bump `v` and migrate when a field changes meaning).
import { z } from 'zod';
import { CONDITIONS, SKILLS } from './i18n/th';

const score = z.number().int().min(1).max(30);
const AbilitiesZ = z.object({
  str: score.default(10), dex: score.default(10), con: score.default(10),
  int: score.default(10), wis: score.default(10), cha: score.default(10),
});

/** 0 = untrained, 1 = proficient, 2 = expertise. */
const rank = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const skillKeys = Object.keys(SKILLS) as [keyof typeof SKILLS, ...(keyof typeof SKILLS)[]];
const conditionKeys = Object.keys(CONDITIONS) as [keyof typeof CONDITIONS, ...(keyof typeof CONDITIONS)[]];

export const D2024Z = z.object({
  v: z.literal(1).default(1),
  name: z.string().max(60).default(''),
  portrait: z.string().nullable().default(null),
  classKey: z.string().default('fighter'),
  subclass: z.string().nullable().default(null),
  level: z.number().int().min(1).max(20).default(1),
  species: z.string().default('human'),
  background: z.string().default('soldier'),
  abilities: AbilitiesZ.default({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
  /** 1 = proficient, 2 = expertise. */
  skills: z.partialRecord(z.enum(skillKeys), rank).default({}),
  /** Rank in each of the room's own skills (keyed by the room skill's key). */
  roomSkills: z.record(z.string(), rank).default({}),
  /** Skills this character added for themselves. */
  customSkills: z.array(z.object({
    id: z.string().min(1).max(40),
    name: z.string().max(40),
    ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
    rank,
  })).max(40).default([]),
  /** Saving throw proficiencies beyond the class's two (e.g. from a feat). */
  extraSaves: z.array(z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])).default([]),
  hp: z.object({
    current: z.number().int().default(0),
    temp: z.number().int().min(0).default(0),
  }).default({ current: 0, temp: 0 }),
  hitDiceUsed: z.number().int().min(0).default(0),
  death: z.object({ success: z.number().int().min(0).max(3).default(0), fail: z.number().int().min(0).max(3).default(0) })
    .default({ success: 0, fail: 0 }),
  armor: z.string().nullable().default(null),
  shield: z.boolean().default(false),
  weapons: z.array(z.string()).default([]),
  inventory: z.array(z.object({ name: z.string().max(80), qty: z.number().int().min(0).default(1), note: z.string().max(200).default('') }))
    .default([]),
  spells: z.object({
    known: z.array(z.string()).default([]),
    prepared: z.array(z.string()).default([]),
    /** Expended slots per level 1–9 (and pact slots). */
    used: z.array(z.number().int().min(0)).length(9).default([0, 0, 0, 0, 0, 0, 0, 0, 0]),
    pactUsed: z.number().int().min(0).default(0),
  }).default({ known: [], prepared: [], used: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0 }),
  conditions: z.array(z.enum(conditionKeys)).default([]),
  exhaustion: z.number().int().min(0).max(6).default(0),
  inspiration: z.boolean().default(false),
  money: z.object({ cp: z.number().int().default(0), sp: z.number().int().default(0), gp: z.number().int().default(0), pp: z.number().int().default(0) })
    .default({ cp: 0, sp: 0, gp: 0, pp: 0 }),
  features: z.string().max(20000).default(''),
  notes: z.string().max(20000).default(''),
  /** Values typed in by hand that win over the computed ones (house rules, magic items...). */
  overrides: z.object({
    ac: z.number().int().optional(), maxHp: z.number().int().optional(),
    speed: z.number().int().optional(), initiative: z.number().int().optional(),
  }).default({}),
  /** Feats by SRD key (origin feat, fighting style...). Their text is written into `features`. */
  feats: z.array(z.string()).default([]),
  languages: z.array(z.string().max(40)).default([]),
  /** Tool proficiencies, as names. */
  tools: z.array(z.string().max(80)).default([]),
  /** Builder / level-up choices (phase 5). */
  choices: z.record(z.string(), z.unknown()).default({}),
});

export type D2024 = z.infer<typeof D2024Z>;

export function newCharacter(): D2024 {
  return D2024Z.parse({});
}

/** Throws (zod) on data that can't be a character; fills defaults for anything missing. */
export function parseCharacter(raw: unknown): D2024 {
  return D2024Z.parse(raw ?? {});
}
