// Test fixture: a complete, valid draft for any class × background × species. Not imported by the app.
import type { Srd } from '../data/schema';
import { SKILLS } from '../i18n/th';
import { STANDARD_LANGUAGES } from '../overlay';
import { pointBuyStart } from './abilities';
import { emptyDraft, emptyPicks, type Draft, type FeatPicks } from './draft';
import {
  backgroundFeat, cantripTarget, classOf, classSpells, fightingStyleFeats, level1Points, listSpells,
  originFeats, proficientSkills, speciesRulesOf, spellTarget, weaponPool, type FeatList,
} from './helpers';

export function autoDraft(srd: Srd, classKey: string, backgroundKey: string, speciesKey: string): Draft {
  const d = emptyDraft();
  Object.assign(d, { classKey, background: backgroundKey, species: speciesKey, name: 'Test' });
  const cls = classOf(d, srd)!;
  const bg = srd.backgrounds.find((b) => b.key === backgroundKey)!;
  const species = speciesRulesOf(d)!;
  const taken = new Set<string>(bg.skills);
  /** The first `n` skills of `pool` nobody has yet; they are taken from now on. */
  const free = (pool: string[], n: number) => {
    const out = pool.filter((s) => !taken.has(s)).slice(0, n);
    for (const s of out) taken.add(s);
    return out;
  };
  const picksFor = (key: string, list: FeatList | null): FeatPicks => {
    const picks = emptyPicks();
    if (key === 'magic-initiate') {
      const use = list ?? 'wizard';
      if (!list) picks.list = use;
      picks.cantrips = listSpells(use, 0, srd).slice(0, 2).map((s) => s.key);
      picks.spell = listSpells(use, 1, srd)[0].key;
    }
    if (key === 'skilled') picks.skills = free(Object.keys(SKILLS), 3);
    return picks;
  };

  // The species skill pool is the smallest, so it picks before the class does.
  for (const c of species.choices) {
    if (c.kind === 'option') d.speciesOptions[c.id] = c.options[0].id;
    if (c.kind === 'skill') d.speciesSkill = free(c.from === 'any' ? Object.keys(SKILLS) : c.from, 1)[0];
  }
  d.classSkills = free(cls.skillChoice.from, cls.skillChoice.count);

  const bgFeat = backgroundFeat(d, srd)!;
  d.bgFeat = picksFor(bgFeat.key, bgFeat.list);
  if (species.choices.some((c) => c.kind === 'originFeat')) {
    const feat = originFeats(srd).find((f) => f.key !== bgFeat.key)!;
    d.speciesFeat = feat.key;
    d.speciesFeatPicks = picksFor(feat.key, null);
  }

  for (const p of level1Points(d)) {
    if (p.kind === 'fightingStyle') d.fightingStyle = fightingStyleFeats(srd)[0].key;
    if (p.kind === 'masteries') d.masteries = weaponPool(d, srd, p.filter).slice(0, p.count).map((w) => w.key);
    if (p.kind === 'order') d.order = p.options[0].id;
    if (p.kind === 'invocations') d.invocations = cls.invocations.filter((i) => !i.prerequisite).slice(0, p.count).map((i) => i.name);
  }
  for (const p of level1Points(d)) if (p.kind === 'expertise') d.expertise = proficientSkills(d, srd).slice(0, p.count);

  if (cls.tools.choose) d.classTools = Array.from({ length: cls.tools.choose.count }, (_, i) => `Class tool ${i + 1}`);
  if (bg.tools.choose) d.bgTools = Array.from({ length: bg.tools.choose.count }, (_, i) => `Background tool ${i + 1}`);
  d.bgAsi = { mode: '1/1/1' };
  d.languages = STANDARD_LANGUAGES.slice(0, 2);
  d.scores = { method: 'array', assign: { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 }, base: pointBuyStart() };
  d.classEquip = 'A';
  d.bgEquip = 'A';
  d.cantrips = classSpells(d, srd, 0).slice(0, cantripTarget(d, srd)).map((s) => s.key);
  d.spells = classSpells(d, srd, 1).slice(0, spellTarget(d, srd)).map((s) => s.key);
  return d;
}
