// Shape of the normalised SRD 5.2 dataset (srd.json), checked by the build and trusted at runtime.
import { z } from 'zod';

export const AbilityZ = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);

const FeatureZ = z.object({
  key: z.string(),
  name: z.string(),
  levels: z.array(z.number().int().min(1).max(20)),
  desc: z.string(),
});

export const EquipmentItemZ = z.object({
  name: z.string(),
  qty: z.number().int().positive(),
  kind: z.enum(['weapon', 'armor', 'shield', 'gear']),
  /** SRD weapon/armor key, for the first three kinds. */
  key: z.string().optional(),
});
/** One of the "Choose A or B" sets of starting equipment. The last set of a class/background is gold only. */
export const EquipmentOptionZ = z.object({
  id: z.enum(['A', 'B', 'C']),
  items: z.array(EquipmentItemZ),
  gp: z.number().int().min(0),
});
export const ToolGrantZ = z.object({
  fixed: z.array(z.string()),
  /** "Choose 3 Musical Instruments": the player names them. */
  choose: z.object({ count: z.number().int().positive(), label: z.string() }).nullable(),
});

export const ClassZ = z.object({
  key: z.string(),
  name: z.string(),
  hitDie: z.number().int().refine((n) => [6, 8, 10, 12].includes(n)),
  saves: z.array(AbilityZ).length(2),
  caster: z.enum(['none', 'full', 'half', 'pact']),
  spellAbility: AbilityZ.nullable(),
  /** Class table columns (e.g. "Cantrips", "1st", "Sneak Attack"): one value per level 1–20, '' where blank. */
  table: z.record(z.string(), z.array(z.string()).length(20)),
  features: z.array(FeatureZ),
  /** Core Traits table: "Choose 2: Athletics, ..." (`from` are skill keys). */
  skillChoice: z.object({ count: z.number().int().positive(), from: z.array(z.string()).min(1) }),
  /** Weapon and armor training as the SRD words it. */
  training: z.object({ weapons: z.string(), armor: z.string() }),
  tools: ToolGrantZ,
  equipmentOptions: z.array(EquipmentOptionZ).min(2),
  /** Warlock only: every invocation with its prerequisite text (null = none, so it can be taken at level 1). */
  invocations: z.array(z.object({ name: z.string(), prerequisite: z.string().nullable() })),
  subclasses: z.array(z.object({ key: z.string(), name: z.string(), desc: z.string(), features: z.array(FeatureZ) })),
});

export const SpeciesZ = z.object({
  key: z.string(),
  name: z.string(),
  size: z.string(),
  speed: z.number().int().positive(),
  traits: z.array(z.object({ name: z.string(), desc: z.string() })),
});

export const BackgroundZ = z.object({
  key: z.string(),
  name: z.string(),
  abilities: z.array(AbilityZ).length(3),
  feat: z.string(),
  skills: z.array(z.string()).length(2),
  tool: z.string(),
  equipment: z.string(),
  tools: ToolGrantZ,
  equipmentOptions: z.array(EquipmentOptionZ).min(2),
});

export const FeatZ = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  prerequisite: z.string().nullable(),
  desc: z.string(),
});

export const SpellZ = z.object({
  key: z.string(),
  name: z.string(),
  level: z.number().int().min(0).max(9),
  school: z.string(),
  classes: z.array(z.string()),
  castingTime: z.string(),
  range: z.string(),
  components: z.string(),
  duration: z.string(),
  concentration: z.boolean(),
  ritual: z.boolean(),
  save: AbilityZ.nullable(),
  attack: z.boolean(),
  damage: z.string().nullable(),
  damageTypes: z.array(z.string()),
  desc: z.string(),
  higher: z.string().nullable(),
});

export const WeaponZ = z.object({
  key: z.string(),
  name: z.string(),
  simple: z.boolean(),
  ranged: z.boolean(),
  damage: z.string(),
  damageType: z.string(),
  /** Lower-case property names: finesse, light, heavy, reach, thrown, two-handed, versatile, ammunition, loading. */
  properties: z.array(z.string()),
  versatile: z.string().nullable(),
  range: z.tuple([z.number(), z.number()]).nullable(),
  mastery: z.string().nullable(),
});

export const ArmorZ = z.object({
  key: z.string(),
  name: z.string(),
  category: z.enum(['light', 'medium', 'heavy', 'shield']),
  base: z.number().int(),
  dex: z.boolean(),
  cap: z.number().int().nullable(),
  strength: z.number().int().nullable(),
  stealthDisadvantage: z.boolean(),
});

export const SrdZ = z.object({
  source: z.string(),
  classes: z.array(ClassZ),
  species: z.array(SpeciesZ),
  backgrounds: z.array(BackgroundZ),
  feats: z.array(FeatZ),
  spells: z.array(SpellZ),
  weapons: z.array(WeaponZ),
  armor: z.array(ArmorZ),
});

export type Srd = z.infer<typeof SrdZ>;
export type SrdClass = z.infer<typeof ClassZ>;
export type SrdSpecies = z.infer<typeof SpeciesZ>;
export type SrdBackground = z.infer<typeof BackgroundZ>;
export type SrdSpell = z.infer<typeof SpellZ>;
export type SrdWeapon = z.infer<typeof WeaponZ>;
export type SrdArmor = z.infer<typeof ArmorZ>;
export type EquipmentItem = z.infer<typeof EquipmentItemZ>;
export type EquipmentOption = z.infer<typeof EquipmentOptionZ>;
export type ToolGrant = z.infer<typeof ToolGrantZ>;
