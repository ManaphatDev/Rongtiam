import { describe, expect, it } from 'vitest';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { SKILLS } from '../i18n/th';
import { pointBuyStart } from './abilities';
import { emptyDraft, type Draft } from './draft';
import { autoDraft } from './fixtures';
import { cantripTarget, listSpells, needsSpellStep, proficientSkills, repeatable, spellTarget } from './helpers';
import { validate, type StepId } from './validate';

const srd = SrdZ.parse(raw);
const steps = (d: Draft) => [...new Set(validate(d, srd).map((i) => i.step))];
const fighter = () => autoDraft(srd, 'fighter', 'soldier', 'human');

describe('a complete draft', () => {
  it('has no issues', () => {
    expect(validate(fighter(), srd)).toEqual([]);
    expect(validate(autoDraft(srd, 'wizard', 'sage', 'elf'), srd)).toEqual([]);
  });
});

describe('an empty draft', () => {
  it('asks for the class first and covers every step except spells', () => {
    const issues = validate(emptyDraft(), srd);
    expect(issues[0]).toEqual({ step: 'class', message: 'เลือกอาชีพ' });
    expect(steps(emptyDraft())).toEqual(['class', 'background', 'species', 'languages', 'scores', 'equipment', 'details'] satisfies StepId[]);
  });
});

describe('class step', () => {
  it('needs the right number of skills, from the class list', () => {
    const d = fighter();
    const first = d.classSkills[0]; // a pick that is valid and not held by anyone else
    d.classSkills = [first];
    expect(steps(d)).toEqual(['class']);
    d.classSkills = [first, 'arcana']; // not on the Fighter's list
    expect(steps(d)).toEqual(['class']);
  });

  it('flags a skill the background already gives, on the class step', () => {
    const d = fighter();
    d.classSkills = ['athletics', 'history']; // Soldier gives Athletics
    expect(validate(d, srd).filter((i) => i.step === 'class').map((i) => i.message)).toContain('สกิลของอาชีพซ้ำกับสกิลของฉากหลัง ให้เลือกใหม่');
  });

  it('switching class leaves picks whose counts no longer fit', () => {
    const d = fighter();
    d.classKey = 'rogue'; // wants 4 skills, expertise, masteries; the fighter's picks don't fit
    expect(steps(d)).toContain('class');
  });

  it('weapon mastery respects the class filter', () => {
    const d = autoDraft(srd, 'barbarian', 'soldier', 'human');
    expect(steps(d)).toEqual([]);
    d.masteries = ['longbow', 'greataxe']; // Barbarians pick melee weapons
    expect(steps(d)).toEqual(['class']);
  });

  it('Rogue expertise must be in skills already proficient', () => {
    const d = autoDraft(srd, 'rogue', 'criminal', 'human');
    expect(proficientSkills(d, srd)).toContain('stealth');
    d.expertise = ['arcana', 'religion'];
    expect(steps(d)).toEqual(['class']);
  });

  it('chosen tools must all be named and different, ignoring case and spaces', () => {
    const d = autoDraft(srd, 'bard', 'sage', 'human');
    expect(steps(d)).toEqual([]);
    d.classTools = ['Lute', ' lute ', 'Flute'];
    expect(steps(d)).toEqual(['class']);
    d.classTools = ['Lute', '   ', 'Flute'];
    expect(steps(d)).toEqual(['class']);
  });

  it('a class with no mastery, order or expertise ignores stale picks of those', () => {
    const d = autoDraft(srd, 'monk', 'soldier', 'human');
    d.order = 'protector';
    d.masteries = ['longbow'];
    d.expertise = ['arcana'];
    expect(steps(d)).toEqual([]);
  });
});

describe('background step', () => {
  it('needs +2 and +1 on two different abilities of the background', () => {
    const d = fighter();
    d.bgAsi = { mode: '2/1', plus2: null, plus1: null };
    expect(steps(d)).toEqual(['background']);
    d.bgAsi = { mode: '2/1', plus2: 'str', plus1: 'str' };
    expect(steps(d)).toEqual(['background']);
    d.bgAsi = { mode: '2/1', plus2: 'int', plus1: 'str' }; // Soldier is Str, Dex, Con
    expect(steps(d)).toEqual(['background']);
    d.bgAsi = { mode: '2/1', plus2: 'str', plus1: 'con' };
    expect(steps(d)).toEqual([]);
  });

  it('Magic Initiate needs two cantrips and one level-1 spell from its list', () => {
    const d = autoDraft(srd, 'fighter', 'acolyte', 'human');
    expect(steps(d)).toEqual([]);
    d.bgFeat.cantrips = [];
    expect(steps(d)).toEqual(['background']);
    d.bgFeat.cantrips = listSpells('cleric', 0, srd).slice(0, 2).map((s) => s.key);
    d.bgFeat.spell = listSpells('wizard', 1, srd).find((s) => !s.classes.includes('cleric'))!.key; // not a Cleric spell
    expect(steps(d)).toEqual(['background']);
  });
});

describe('species step', () => {
  it('needs the lineage, and a skill that is new', () => {
    const d = autoDraft(srd, 'fighter', 'soldier', 'elf');
    expect(steps(d)).toEqual([]);
    d.speciesOptions = {};
    expect(steps(d)).toEqual(['species']);
    const e = autoDraft(srd, 'fighter', 'soldier', 'elf');
    e.speciesSkill = e.classSkills[0];
    expect(steps(e)).toEqual(['species']);
  });

  it('Human Versatile: an Origin feat other than the background\'s, with its own picks', () => {
    const d = fighter();
    d.speciesFeat = 'savage-attacker'; // Soldier already has it
    expect(steps(d)).toEqual(['species']);
    d.speciesFeat = 'skilled';
    expect(steps(d)).toEqual(['species']); // Skilled needs three skills
    const taken = proficientSkills(d, srd);
    const fresh = Object.keys(SKILLS).filter((s) => !taken.includes(s)).slice(0, 3);
    d.speciesFeatPicks.skills = fresh;
    expect(steps(d)).toEqual([]);
    d.speciesFeatPicks.skills = [taken[0], ...fresh.slice(0, 2)]; // one repeats a skill already held
    expect(steps(d)).toEqual(['species']);
  });

  it('Human Versatile: a repeatable feat may repeat the background\'s, Magic Initiate only with another spell list', () => {
    const d = autoDraft(srd, 'fighter', 'acolyte', 'human'); // Acolyte: Magic Initiate (Cleric)
    d.speciesFeat = 'magic-initiate';
    const pick = (list: 'cleric' | 'wizard') => {
      d.speciesFeatPicks = { list, cantrips: listSpells(list, 0, srd).slice(0, 2).map((s) => s.key), spell: listSpells(list, 1, srd)[0].key, skills: [] };
    };
    pick('cleric');
    expect(validate(d, srd).map((i) => i.message)).toEqual(['Magic Initiate ครั้งที่สองต้องใช้รายชื่อเวทอื่น ฉากหลังใช้ Cleric แล้ว']);
    pick('wizard');
    expect(validate(d, srd)).toEqual([]);
  });

  it('only feats whose SRD text says they can be taken more than once are repeatable', () => {
    expect(srd.feats.filter((f) => f.type === 'origin' && repeatable(f)).map((f) => f.key).sort()).toEqual(['magic-initiate', 'skilled']);
  });
});

describe('languages, scores, equipment, details', () => {
  it('languages: two different standard ones', () => {
    const d = fighter();
    d.languages = ['Elvish'];
    expect(steps(d)).toEqual(['languages']);
    d.languages = ['Elvish', 'Elvish'];
    expect(steps(d)).toEqual(['languages']);
    d.languages = ['Elvish', 'Klingon'];
    expect(steps(d)).toEqual(['languages']);
  });

  it('languages: a Rogue picks one more than the rest, since the Thieves Cant feature comes with a language of choice', () => {
    const d = autoDraft(srd, 'rogue', 'criminal', 'human');
    expect(d.languages).toHaveLength(3);
    expect(validate(d, srd)).toEqual([]);
    d.languages = d.languages.slice(0, 2);
    expect(steps(d)).toEqual(['languages']);
  });

  it('scores: incomplete array, over-budget point buy, an unrolled roll', () => {
    const d = fighter();
    d.scores = { method: 'array', assign: { str: 0 }, base: pointBuyStart() };
    expect(steps(d)).toEqual(['scores']);
    d.scores = { method: 'pointbuy', assign: {}, base: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 } };
    expect(steps(d)).toEqual(['scores']);
    d.scores = { method: 'roll', assign: { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 }, base: pointBuyStart() };
    expect(validate(d, srd).find((i) => i.step === 'scores')!.message).toBe('ทอยค่าพลังก่อน');
    d.rolled = [14, 13, 12, 11, 10, 9];
    expect(steps(d)).toEqual([]);
  });

  it('scores: a rolled 18 plus the background +2 reaches exactly 20, which is allowed', () => {
    const d = fighter();
    d.scores = { method: 'roll', assign: { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 }, base: pointBuyStart() };
    d.rolled = [18, 14, 13, 12, 10, 8];
    d.bgAsi = { mode: '2/1', plus2: 'str', plus1: 'con' };
    expect(steps(d)).toEqual([]);
  });

  it('equipment: both sets must be chosen from the real options', () => {
    const d = fighter();
    d.classEquip = null;
    expect(steps(d)).toEqual(['equipment']);
    d.classEquip = 'C';
    d.bgEquip = 'C'; // Soldier has only A and B
    expect(steps(d)).toEqual(['equipment']);
  });

  it('details: a name is required, spaces alone do not count', () => {
    const d = fighter();
    d.name = '   ';
    expect(steps(d)).toEqual(['details']);
  });
});

describe('spells', () => {
  it('only casters have a spell step', () => {
    expect(needsSpellStep(fighter(), srd)).toBe(false);
    expect(needsSpellStep(autoDraft(srd, 'wizard', 'sage', 'human'), srd)).toBe(true);
    expect(needsSpellStep(autoDraft(srd, 'paladin', 'soldier', 'human'), srd)).toBe(true);
  });

  it('targets come from the class table; the Wizard keeps a spellbook of six', () => {
    const w = autoDraft(srd, 'wizard', 'sage', 'human');
    expect([cantripTarget(w, srd), spellTarget(w, srd)]).toEqual([3, 6]);
    const c = autoDraft(srd, 'cleric', 'soldier', 'human');
    expect([cantripTarget(c, srd), spellTarget(c, srd)]).toEqual([3, 4]);
    const s = autoDraft(srd, 'sorcerer', 'soldier', 'human');
    expect([cantripTarget(s, srd), spellTarget(s, srd)]).toEqual([4, 2]);
  });

  it('Thaumaturge asks for one more cantrip than Protector', () => {
    const d = autoDraft(srd, 'cleric', 'soldier', 'human');
    d.order = 'protector';
    expect(cantripTarget(d, srd)).toBe(3);
    d.order = 'thaumaturge';
    expect(cantripTarget(d, srd)).toBe(4);
    expect(steps(d)).toEqual(['spells']); // the draft still has only three
  });

  it('spells must be the class\'s own, the right number, no repeats', () => {
    const d = autoDraft(srd, 'wizard', 'sage', 'human');
    d.spells = d.spells.slice(0, 4);
    expect(steps(d)).toEqual(['spells']);
    const e = autoDraft(srd, 'wizard', 'sage', 'human');
    e.spells = [...e.spells.slice(0, 5), e.spells[0]];
    expect(steps(e)).toEqual(['spells']);
    const f = autoDraft(srd, 'wizard', 'sage', 'human');
    f.spells = [...f.spells.slice(0, 5), listSpells('cleric', 1, srd).find((s) => !s.classes.includes('wizard'))!.key];
    expect(steps(f)).toEqual(['spells']);
  });
});
