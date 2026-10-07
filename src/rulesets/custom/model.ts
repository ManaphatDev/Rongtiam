// The "custom" ruleset: the GM designs the sheet for any game. A template (stored in room_content, kind
// 'template') declares fields, formulas, catalogs of the GM's own content (careers, weapons, spells...), lists
// characters fill from those catalogs, roll buttons, token bars, conditions and the initiative roll.
// Formulas use core/formula.ts: @field, @choice.column (a column of the chosen catalog item), @row.column in lists.
import { z } from 'zod';
import { evaluate, FormulaError, type Resolver } from '../core/formula';
import type { RollAction, TokenBar } from '../core/types';

const key = z.string().regex(/^[a-z_][a-z0-9_]{0,30}$/, 'ใช้ a–z, 0–9 และ _ ขึ้นต้นด้วยตัวอักษร');
const label = z.string().min(1).max(40);
const value = z.union([z.number(), z.string().max(400)]);

const FieldZ = z.object({
  key,
  label,
  kind: z.enum(['number', 'text', 'formula', 'choice']),
  default: value.optional(),
  /** For kind 'formula'. */
  formula: z.string().max(400).optional(),
  /** For kind 'choice': the catalog to pick from. */
  catalog: key.optional(),
  section: z.string(),
});

const ColumnZ = z.object({ key, label, kind: z.enum(['number', 'text', 'formula']) });

const CatalogZ = z.object({
  key,
  label,
  columns: z.array(ColumnZ).max(20),
  items: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().min(1).max(60), values: z.record(z.string(), value) })).max(500),
});

const unique = <T extends { key?: string; id?: string }>(what: string) => (list: T[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  for (const x of list) {
    const k = x.key ?? x.id ?? '';
    if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `${what} "${k}" ซ้ำ` });
    seen.add(k);
  }
};

export const TemplateZ = z.object({
  v: z.literal(1).default(1),
  name: z.string().min(1).max(60),
  sections: z.array(z.object({ id: z.string().min(1).max(30), label })).min(1).max(20).superRefine(unique('หมวด')),
  fields: z.array(FieldZ).max(150).superRefine(unique('ช่อง')),
  catalogs: z.array(CatalogZ).max(20).default([]).superRefine(unique('คลัง')),
  /** Per-character lists (inventory, weapons carried...), optionally filled from a catalog, each row rollable. */
  lists: z.array(z.object({
    key, label, catalog: key.optional(),
    roll: z.object({ label, expr: z.string().max(400) }).optional(),
  })).max(20).default([]).superRefine(unique('รายการ')),
  rolls: z.array(z.object({ id: key, label, expr: z.string().max(400), section: z.string() })).max(100).default([]).superRefine(unique('ปุ่มทอย')),
  /** `current` is a number field the bar edits; `max` is a field or a formula. */
  bars: z.array(z.object({ label, current: key, max: z.string().max(400), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(4).default([]),
  conditions: z.array(z.object({ key, label, icon: z.string().max(8) })).max(40).default([]),
  initiative: z.object({ expr: z.string().max(400), tie: z.string().max(400).optional() }).optional(),
  /**
   * Skills: one roll formula for all of them, where @stat is the skill's stat field and @rank the character's
   * rank in it (e.g. "1d20 + @stat + @rank"); the GM's list; and whether players may add their own.
   */
  skills: z.object({
    roll: z.string().max(400),
    allowPlayerSkills: z.boolean().default(true),
    list: z.array(z.object({ key, label, stat: key })).max(60).default([]).superRefine(unique('สกิล')),
  }).optional(),
});
export type CustomTemplate = z.infer<typeof TemplateZ>;

export const CustomCharZ = z.object({
  v: z.literal(1).default(1),
  name: z.string().max(60).default(''),
  portrait: z.string().nullable().default(null),
  values: z.record(z.string(), value).default({}),
  lists: z.record(z.string(), z.array(z.object({
    id: z.string(),
    /** Catalog item id; its column values apply unless overridden in `values`. */
    item: z.string().optional(),
    name: z.string().max(60).optional(),
    values: z.record(z.string(), value).default({}),
  }))).default({}),
  conditions: z.array(z.string()).default([]),
  /** Rank in each of the template's skills. */
  skillRanks: z.record(z.string(), z.number()).default({}),
  /** Skills this character added for themselves. */
  customSkills: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().max(40), stat: z.string().max(31), rank: z.number().default(0) }))
    .max(40).default([]),
  notes: z.string().max(20000).default(''),
});
export type CustomChar = z.infer<typeof CustomCharZ>;

export const parseTemplate = (raw: unknown): CustomTemplate => TemplateZ.parse(raw);
export const parseCustomChar = (raw: unknown): CustomChar => CustomCharZ.parse(raw ?? {});

export interface CustomDerived {
  values: Record<string, number | string>;
  /** Per field: why its formula could not be worked out. */
  errors: Record<string, string>;
  choice: Record<string, { id: string; name: string } | undefined>;
  rolls: RollAction[];
  bars: TokenBar[];
  initiative: { expr: string; tie: number } | null;
  skills: { id: string; label: string; stat: string; rank: number; expr: string; source: 'room' | 'own' }[];
}

export function deriveCustom(t: CustomTemplate, c: CustomChar): CustomDerived {
  const fields = new Map(t.fields.map((f) => [f.key, f]));
  const catalogs = new Map(t.catalogs.map((k) => [k.key, k]));
  const sectionLabel = (id: string) => t.sections.find((s) => s.id === id)?.label ?? id;

  const chosen = (fieldKey: string) => {
    const f = fields.get(fieldKey);
    const id = c.values[fieldKey] ?? f?.default;
    return f?.catalog ? catalogs.get(f.catalog)?.items.find((i) => i.id === id) : undefined;
  };

  /** Fields, @choice.column and (inside a list) @row.column. Formula strings are evaluated by the formula engine. */
  const resolver = (row?: { values: Record<string, number | string> }): Resolver => (name) => {
    const [head, col] = name.split('.', 2);
    if (col !== undefined) {
      if (head === 'row' && row) return row.values[col] ?? 0;
      const item = chosen(head);
      if (!item) return fields.get(head)?.kind === 'choice' ? 0 : undefined;
      return item.values[col] ?? 0;
    }
    const f = fields.get(name);
    if (!f) return undefined;
    if (f.kind === 'formula') return f.formula ?? '0';
    if (f.kind === 'choice') return undefined;
    const v = c.values[name] ?? f.default ?? (f.kind === 'number' ? 0 : '');
    return typeof v === 'number' ? v : f.kind === 'number' ? Number(v) || 0 : undefined;
  };
  const root = resolver();

  const values: CustomDerived['values'] = {};
  const errors: CustomDerived['errors'] = {};
  const choice: CustomDerived['choice'] = {};
  for (const f of t.fields) {
    if (f.kind === 'text') values[f.key] = String(c.values[f.key] ?? f.default ?? '');
    else if (f.kind === 'choice') {
      const item = chosen(f.key);
      choice[f.key] = item && { id: item.id, name: item.name };
      values[f.key] = item?.name ?? '';
    } else {
      try {
        values[f.key] = evaluate(f.kind === 'formula' ? f.formula ?? '0' : String(root(f.key) ?? 0), root, new Set([f.key])).value;
      } catch (e) {
        errors[f.key] = e instanceof FormulaError ? e.message : String(e);
        values[f.key] = 0;
      }
    }
  }

  const asRoll = (expr: string, r: Resolver) => {
    const ev = evaluate(expr, r);
    if (!ev.dice) throw new FormulaError('ปุ่มทอยต้องมีลูกเต๋าอย่างน้อยหนึ่งลูก เช่น 1d20 + @might');
    return ev.dice;
  };
  const rolls: RollAction[] = [];
  for (const r of t.rolls) {
    try {
      rolls.push({ id: r.id, label: r.label, expr: asRoll(r.expr, root), group: sectionLabel(r.section) });
    } catch (e) {
      errors[`roll:${r.id}`] = (e as Error).message;
    }
  }
  for (const list of t.lists) {
    if (!list.roll) continue;
    const catalog = list.catalog ? catalogs.get(list.catalog) : undefined;
    for (const row of c.lists[list.key] ?? []) {
      const item = row.item ? catalog?.items.find((i) => i.id === row.item) : undefined;
      const merged = { values: { ...(item?.values ?? {}), ...row.values } };
      const name = row.name ?? item?.name ?? '';
      try {
        rolls.push({ id: `${list.key}:${row.id}`, label: `${list.roll.label}: ${name}`, expr: asRoll(list.roll.expr, resolver(merged)), group: list.label });
      } catch (e) {
        errors[`${list.key}:${row.id}`] = (e as Error).message;
      }
    }
  }

  const skills: CustomDerived['skills'] = [];
  if (t.skills) {
    const all = [
      ...t.skills.list.map((s) => ({ id: s.key, label: s.label, stat: s.stat, rank: c.skillRanks[s.key] ?? 0, source: 'room' as const })),
      ...c.customSkills.map((s) => ({ id: `own:${s.id}`, label: s.label, stat: s.stat, rank: s.rank, source: 'own' as const })),
    ];
    for (const s of all) {
      try {
        if (fields.get(s.stat)?.kind !== 'number' && fields.get(s.stat)?.kind !== 'formula') {
          throw new FormulaError(`สกิลนี้อ้างถึงค่าพลัง @${s.stat} ที่ไม่มีอยู่`);
        }
        const expr = asRoll(t.skills.roll, (name) => (name === 'rank' ? s.rank : name === 'stat' ? `@${s.stat}` : root(name)));
        skills.push({ ...s, expr });
        rolls.push({ id: `skill:${s.id}`, label: s.label, expr, group: 'สกิล' });
      } catch (e) {
        errors[`skill:${s.id}`] = (e as Error).message;
      }
    }
  }

  const num = (expr: string) => {
    try {
      return evaluate(expr, root).value;
    } catch {
      return 0;
    }
  };
  const bars = t.bars.map((b) => ({
    label: b.label,
    current: Number(values[b.current] ?? 0),
    max: fields.has(b.max) ? Number(values[b.max] ?? 0) : num(b.max),
    color: b.color,
  }));

  let initiative: CustomDerived['initiative'] = null;
  if (t.initiative) {
    try {
      initiative = { expr: asRoll(t.initiative.expr, root), tie: t.initiative.tie ? num(t.initiative.tie) : 0 };
    } catch (e) {
      errors.initiative = (e as Error).message;
    }
  }
  return { values, errors, choice, rolls, bars, initiative, skills };
}

/** A generic d20 starter the GM can edit instead of starting from a blank page. */
export const STARTER_TEMPLATE: CustomTemplate = {
  v: 1,
  name: 'ระบบของฉัน',
  sections: [{ id: 'stats', label: 'ค่าพลัง' }, { id: 'combat', label: 'การต่อสู้' }],
  fields: [
    { key: 'might', label: 'พลัง', kind: 'number', default: 0, section: 'stats' },
    { key: 'agility', label: 'คล่องแคล่ว', kind: 'number', default: 0, section: 'stats' },
    { key: 'wits', label: 'ไหวพริบ', kind: 'number', default: 0, section: 'stats' },
    { key: 'hp_max', label: 'HP สูงสุด', kind: 'formula', formula: '10 + @might * 2', section: 'combat' },
    { key: 'hp', label: 'HP', kind: 'number', default: 10, section: 'combat' },
    { key: 'defense', label: 'ป้องกัน', kind: 'formula', formula: '10 + @agility', section: 'combat' },
  ],
  catalogs: [],
  lists: [],
  rolls: [
    { id: 'might_check', label: 'ทดสอบพลัง', expr: '1d20 + @might', section: 'stats' },
    { id: 'agility_check', label: 'ทดสอบคล่องแคล่ว', expr: '1d20 + @agility', section: 'stats' },
    { id: 'wits_check', label: 'ทดสอบไหวพริบ', expr: '1d20 + @wits', section: 'stats' },
    { id: 'attack', label: 'โจมตี', expr: '1d20 + @might', section: 'combat' },
  ],
  bars: [{ label: 'HP', current: 'hp', max: 'hp_max', color: '#e5484d' }],
  conditions: [
    { key: 'down', label: 'ล้มลง', icon: '🛌' },
    { key: 'stunned', label: 'มึนงง', icon: '😵' },
    { key: 'hidden', label: 'ซ่อนตัว', icon: '👻' },
  ],
  initiative: { expr: '1d20 + @agility', tie: '@agility' },
};
