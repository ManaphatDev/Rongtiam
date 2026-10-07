// The custom ruleset plugin: everything comes from the room's template (room_content kind 'template', key 'main').
import type { CharOp } from '../../sync/types';
import type { RulesetContext, RulesetModule } from '../core/types';
import { deriveCustom, parseCustomChar, parseTemplate, STARTER_TEMPLATE, type CustomTemplate } from './model';

export const TEMPLATE_KIND = 'template';
export const TEMPLATE_KEY = 'main';

const templates = new WeakMap<object, CustomTemplate>();
/** The room's template (the starter one until the GM saves their own). A broken saved template falls back too. */
export function templateOf(ctx: RulesetContext): CustomTemplate {
  const row = ctx.content.find((c) => c.kind === TEMPLATE_KIND && c.key === TEMPLATE_KEY);
  if (!row) return STARTER_TEMPLATE;
  let t = templates.get(row.data);
  if (!t) {
    try {
      t = parseTemplate(row.data);
    } catch {
      t = STARTER_TEMPLATE;
    }
    templates.set(row.data, t);
  }
  return t;
}

const derived = new WeakMap<object, WeakMap<object, ReturnType<typeof deriveCustom>>>();
export function viewCustom(data: Record<string, unknown>, ctx: RulesetContext) {
  const t = templateOf(ctx);
  let byChar = derived.get(t);
  if (!byChar) derived.set(t, (byChar = new WeakMap()));
  let v = byChar.get(data);
  if (!v) byChar.set(data, (v = deriveCustom(t, parseCustomChar(data))));
  return { t, c: parseCustomChar(data), d: v };
}

export const custom: RulesetModule = {
  id: 'custom',
  name: 'ระบบที่ GM ออกแบบเอง',
  async ready() {},
  newCharacter: (ctx) => {
    const t = templateOf(ctx);
    return parseCustomChar({ values: Object.fromEntries(t.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default])) });
  },
  parse: (raw) => parseCustomChar(raw),
  nameOf: (data) => String(data.name || 'ไม่มีชื่อ'),
  rolls: (data, ctx) => viewCustom(data, ctx).d.rolls,
  conditions: (ctx) => templateOf(ctx).conditions.map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
  activeConditions: (data) => parseCustomChar(data).conditions,
  toggleCondition: (data, key) => {
    const list = parseCustomChar(data).conditions;
    return [{ path: ['conditions'], value: list.includes(key) ? list.filter((x) => x !== key) : [...list, key] }];
  },
  bars: (data, ctx) => viewCustom(data, ctx).d.bars,
  applyHp: (data, delta, ctx): CharOp[] => {
    const { t, d } = viewCustom(data, ctx);
    const bar = t.bars[0];
    if (!bar) return [];
    const b = d.bars[0];
    return [{ path: ['values', bar.current], value: Math.max(0, Math.min(b.max || Infinity, b.current + delta)) }];
  },
  initiative: (data, ctx) => {
    return viewCustom(data, ctx).d.initiative ?? { expr: '1d20', tie: 0 };
  },
  Sheet: () => import('./Sheet.svelte').then((m) => m.default),
};
