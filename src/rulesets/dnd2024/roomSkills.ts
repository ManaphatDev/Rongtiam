// The room's own D&D skills (house rules), kept in room_content (kind 'homebrew', key 'skills'), and whether
// players may add personal skills to their sheets. Missing or broken content means: none, and players may.
import { z } from 'zod';
import type { RulesetContext } from '../core/types';

export const SKILLS_KIND = 'homebrew';
export const SKILLS_KEY = 'skills';

export const RoomSkillsZ = z.object({
  skills: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    name: z.string().min(1).max(40),
    ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
  })).max(40).default([]),
  allowPlayerSkills: z.boolean().default(true),
});
export type RoomSkills = z.infer<typeof RoomSkillsZ>;

const DEFAULT: RoomSkills = { skills: [], allowPlayerSkills: true };
const cache = new WeakMap<object, RoomSkills>();

export function roomSkillsOf(ctx: RulesetContext): RoomSkills {
  const row = ctx.content.find((c) => c.kind === SKILLS_KIND && c.key === SKILLS_KEY);
  if (!row) return DEFAULT;
  let v = cache.get(row.data);
  if (!v) {
    const r = RoomSkillsZ.safeParse(row.data);
    cache.set(row.data, (v = r.success ? r.data : DEFAULT));
  }
  return v;
}
