import { describe, expect, it } from 'vitest';
import { build } from '../builder/build';
import { autoDraft } from '../builder/fixtures';
import { SrdZ } from '../data/schema';
import raw from '../data/srd.json';
import { parseCharacter, type D2024 } from '../model';
import { emptyLevelDraft, type LevelDraft } from './draft';
import { masteryPool } from './steps';
import { validateLevel } from './validate';

const srd = SrdZ.parse(raw);
const made = (k: string, level = 1): D2024 => ({ ...build(autoDraft(srd, k, 'soldier', 'human'), srd), level });
const msgs = (c: D2024, d: LevelDraft, isGM = true) => validateLevel(c, d, srd, isGM).map((i) => `${i.step}: ${i.message}`);
const avg = (forLevel: number): LevelDraft => ({ ...emptyLevelDraft(forLevel), hp: { method: 'average', rolled: null } });

describe('validateLevel', () => {
  it('a Fighter at level 2 needs only the HP method', () => {
    expect(msgs(made('fighter'), emptyLevelDraft(2))).toEqual(['hp: เลือกวิธีเพิ่ม HP: ค่าเฉลี่ย หรือทอย Hit Die']);
    expect(msgs(made('fighter'), avg(2))).toEqual([]);
  });

  it('a roll must be made, and inside the Hit Die', () => {
    const roll = (rolled: number | null): LevelDraft => ({ ...emptyLevelDraft(2), hp: { method: 'roll', rolled } });
    expect(msgs(made('fighter'), roll(null))).toEqual(['hp: ทอย Hit Die ก่อน']);
    expect(msgs(made('fighter'), roll(11))).toEqual(['hp: ทอย Hit Die ก่อน']); // d10
    expect(msgs(made('fighter'), roll(10))).toEqual([]);
  });

  it('a stored roll cannot be swapped for the average', () => {
    expect(msgs(made('fighter'), { ...emptyLevelDraft(2), hp: { method: 'average', rolled: 3 } }))
      .toEqual(['hp: ทอยไปแล้ว ใช้ผลทอยนั้น']);
  });

  it('a player needs the GM to allow the level; a GM does not', () => {
    const c = made('fighter');
    expect(msgs(c, avg(2), false)).toEqual(['review: GM ยังไม่อนุญาตให้ขึ้นเลเวล 2']);
    expect(msgs({ ...c, levelAllowed: 2 }, avg(2), false)).toEqual([]);
    expect(msgs(c, avg(2), true)).toEqual([]);
  });

  it('nothing past level 20', () => {
    expect(msgs(made('fighter', 20), avg(20))).toEqual(['review: ตัวละครอยู่เลเวล 20 แล้ว']); // checked before the draft is read
  });

  it('ASI: +2 or +1/+1 on different scores, never past 20', () => {
    const c = made('fighter', 3);
    c.abilities.str = 19;
    const asi = (asi: LevelDraft['asi']): LevelDraft => ({ ...avg(4), asi, masteries: [masteryPool(c, srd, 'any')[0]] }); // Weapon Mastery 3 → 4
    expect(msgs(c, asi(null))).toContain('asi: เลือกเพิ่มค่าพลัง หรือเลือก feat');
    expect(msgs(c, asi({ kind: 'scores', mode: '2', picks: ['str'] }))).toContain('asi: พละกำลังจะเกิน 20 ให้เลือกค่าอื่น');
    expect(msgs(c, asi({ kind: 'scores', mode: '1/1', picks: ['dex', 'dex'] }))).toContain('asi: เลือกค่าพลัง 2 ค่าที่จะ +1 (คนละค่า)');
    expect(msgs(c, asi({ kind: 'scores', mode: '1/1', picks: ['str', 'dex'] })).filter((m) => m.startsWith('asi'))).toEqual([]);
  });

  it('ASI feat: prerequisite, the score it raises, not taken twice', () => {
    const c = made('wizard', 3);
    c.abilities.str = 8;
    c.abilities.dex = 12;
    const feat = (ability: 'str' | 'dex' | 'int' | null): LevelDraft => ({ ...avg(4), asi: { kind: 'feat', key: 'grappler', ability } });
    expect(msgs(c, feat('dex'))).toContain('asi: ยังไม่ผ่านเงื่อนไขของ Grappler: Level 4+, Strength or Dexterity 13+');
    c.abilities.dex = 13;
    expect(msgs(c, feat('int'))).toContain('asi: เลือกค่าพลังที่ Grappler เพิ่มให้');
    expect(msgs(c, feat('dex'))).toEqual([]);
    expect(msgs({ ...c, feats: [...c.feats, 'grappler'] }, feat('dex'))).toContain('asi: มี Grappler อยู่แล้ว ให้เลือก feat อื่น');
  });

  it('Epic Boon: one of the boons, and a score below 30', () => {
    const c = made('fighter', 18);
    expect(msgs(c, { ...avg(19), boon: { key: null, ability: null } })).toContain('boon: เลือก Epic Boon');
    expect(msgs(c, { ...avg(19), boon: { key: 'boon-of-fate', ability: null } })).toContain('boon: เลือกค่าพลังที่จะ +1');
    expect(msgs(c, { ...avg(19), boon: { key: 'boon-of-fate', ability: 'str' } })).toEqual([]);
  });

  it('class picks: exact counts from the open pool, capped when the pool is small', () => {
    const s = made('sorcerer');
    expect(msgs(s, { ...avg(2), metamagic: ['Careful Spell'] })).toEqual(['class: เลือก Metamagic ให้ครบ 2 อย่าง']);
    expect(msgs(s, { ...avg(2), metamagic: ['Careful Spell', 'Distant Spell'] })).toEqual([]);
    // A Wizard proficient in none of Scholar's skills has nothing to pick, and is not stuck.
    const w = parseCharacter({ classKey: 'wizard', level: 1, skills: { stealth: 1 } });
    expect(msgs(w, avg(2))).toEqual([]);
    expect(msgs(made('wizard'), avg(2))).toEqual(['class: เลือกสกิลที่เชี่ยวชาญ (Expertise) ให้ครบ 1 อย่าง จากสกิลที่ชำนาญแล้ว']);
  });

  it('a Paladin picks a Fighting Style it does not have', () => {
    expect(msgs(made('paladin'), avg(2))).toEqual(['class: เลือก Fighting Style ที่ยังไม่มี']);
    expect(msgs(made('paladin'), { ...avg(2), fightingStyle: 'defense' })).toEqual([]);
  });
});
