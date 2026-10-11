// The SRD as this room sees it: the SRD's data with the room's valid homebrew appended. Rows that don't validate
// are skipped and listed (the GM's editor flags them). The result is cached by the identity of the rows' `data`
// objects: content rows are replaced, never mutated, and the host builds a fresh `ctx.content` array on every read.
import type { RulesetContext } from '../../core/types';
import type { Srd } from '../data/schema';
import { getSrd } from '../index';
import {
  HB_KEY, HB_SCHEMAS, MAX_PER_KIND, issuesOf, kindOfRow, toSrdArmor, toSrdBackground, toSrdFeat, toSrdSpecies,
  toSrdSpell, toSrdWeapon, type HbBackground, type HbKind, type RoomItem,
} from './kinds';

type Row = RulesetContext['content'][number];
export interface BrokenRow { kind: string; key: string; issues: string[] }
export interface Merged { srd: Srd; items: RoomItem[]; broken: BrokenRow[] }

let last: { base: Srd; refs: object[]; merged: Merged } | null = null;

export function merge(base: Srd, content: Row[]): Merged {
  const rows = content.filter((r) => r.kind.startsWith('hb-')).sort((a, b) => a.key.localeCompare(b.key));
  const refs = rows.map((r) => r.data);
  if (last && last.base === base && last.refs.length === refs.length && last.refs.every((d, i) => d === refs[i])) return last.merged;

  const broken: BrokenRow[] = [];
  const ok: Record<HbKind, { key: string; data: unknown }[]> = {
    weapon: [], armor: [], item: [], spell: [], feat: [], species: [], background: [],
  };
  for (const r of rows) {
    const kind = kindOfRow(r.kind);
    if (!kind) {
      broken.push({ kind: r.kind, key: r.key, issues: ['ไม่รู้จักชนิดนี้'] });
      continue;
    }
    if (!HB_KEY.test(r.key)) {
      broken.push({ kind: r.kind, key: r.key, issues: ['key ต้องขึ้นต้นด้วย hb- และมีแต่ a-z 0-9 -'] });
      continue;
    }
    if (ok[kind].length >= MAX_PER_KIND) continue;
    const p = HB_SCHEMAS[kind].safeParse(r.data);
    if (p.success) ok[kind].push({ key: r.key, data: p.data });
    else broken.push({ kind: r.kind, key: r.key, issues: issuesOf(p.error) });
  }

  let merged: Merged;
  if (!rows.length) merged = { srd: base, items: [], broken };
  else {
    const feats = [...base.feats, ...ok.feat.map((e) => toSrdFeat(e.key, e.data as never))];
    const backgrounds = [...base.backgrounds];
    for (const e of ok.background) {
      const d = e.data as HbBackground;
      const feat = feats.find((f) => f.key === d.feat && f.type === 'origin');
      if (feat) backgrounds.push(toSrdBackground(e.key, d, feat.name));
      else broken.push({ kind: 'hb-background', key: e.key, issues: [`ไม่พบ Origin feat "${d.feat}"`] });
    }
    merged = {
      srd: {
        ...base,
        weapons: [...base.weapons, ...ok.weapon.map((e) => toSrdWeapon(e.key, e.data as never))],
        armor: [...base.armor, ...ok.armor.map((e) => toSrdArmor(e.key, e.data as never))],
        spells: [...base.spells, ...ok.spell.map((e) => toSrdSpell(e.key, e.data as never))],
        feats,
        species: [...base.species, ...ok.species.map((e) => toSrdSpecies(e.key, e.data as never))],
        backgrounds,
      },
      items: ok.item.map((e) => ({ key: e.key, ...(e.data as { name: string; desc: string }) })),
      broken,
    };
  }
  last = { base, refs, merged };
  return merged;
}

export const srdFor = (ctx: RulesetContext): Srd => merge(getSrd(), ctx.content).srd;
export const roomItems = (ctx: RulesetContext): RoomItem[] => merge(getSrd(), ctx.content).items;
export const brokenRows = (ctx: RulesetContext): BrokenRow[] => merge(getSrd(), ctx.content).broken;
