import { describe, expect, it } from 'vitest';
import { deriveCustom, parseCustomChar, parseTemplate, STARTER_TEMPLATE, type CustomTemplate } from './model';

// A small sci-fi system a GM might build: their own stats, a catalog of careers that grant HP,
// a catalog of weapons with their own damage formulas, and an energy bar.
const scifi: CustomTemplate = parseTemplate({
  name: 'ไซไฟ',
  sections: [{ id: 'main', label: 'หลัก' }, { id: 'combat', label: 'ต่อสู้' }],
  fields: [
    { key: 'body', label: 'ร่างกาย', kind: 'number', default: 3, section: 'main' },
    { key: 'reflex', label: 'ปฏิกิริยา', kind: 'number', default: 2, section: 'main' },
    { key: 'career', label: 'อาชีพ', kind: 'choice', catalog: 'careers', section: 'main' },
    { key: 'hp_max', label: 'HP สูงสุด', kind: 'formula', formula: '@body * 5 + @career.hp', section: 'combat' },
    { key: 'hp', label: 'HP', kind: 'number', default: 0, section: 'combat' },
    { key: 'energy', label: 'พลังงาน', kind: 'number', default: 6, section: 'combat' },
    { key: 'callsign', label: 'รหัสเรียก', kind: 'text', default: '', section: 'main' },
  ],
  catalogs: [
    {
      key: 'careers', label: 'อาชีพ', columns: [{ key: 'hp', label: 'โบนัส HP', kind: 'number' }],
      items: [{ id: 'marine', name: 'ทหารราบอวกาศ', values: { hp: 8 } }, { id: 'pilot', name: 'นักบิน', values: { hp: 3 } }],
    },
    {
      key: 'weapons', label: 'อาวุธ', columns: [{ key: 'damage', label: 'ความเสียหาย', kind: 'formula' }],
      items: [{ id: 'laser', name: 'ปืนเลเซอร์', values: { damage: '2d6 + @reflex' } }],
    },
  ],
  lists: [{ key: 'gear', label: 'อาวุธที่พก', catalog: 'weapons', roll: { label: 'ยิง', expr: '@row.damage' } }],
  rolls: [
    { id: 'shoot', label: 'ยิง', expr: '2d6 + @reflex', section: 'combat' },
    { id: 'lift', label: 'ยก', expr: '(@body)d6', section: 'main' },
  ],
  bars: [{ label: 'HP', current: 'hp', max: 'hp_max', color: '#e5484d' }, { label: 'พลังงาน', current: 'energy', max: '6', color: '#3e8ef7' }],
  conditions: [{ key: 'stunned', label: 'มึน', icon: '💫' }],
  initiative: { expr: '1d10 + @reflex', tie: '@reflex' },
});

const pilot = parseCustomChar({
  name: 'Vega', values: { body: 2, reflex: 4, career: 'pilot', hp: 9 },
  lists: { gear: [{ id: 'g1', item: 'laser', values: {} }] },
});

describe('custom templates', () => {
  it('computes formulas, including values of the chosen catalog item', () => {
    const d = deriveCustom(scifi, pilot);
    expect(d.values.hp_max).toBe(13);
    expect(d.values.body).toBe(2);
    expect(d.values.callsign).toBe('');
    expect(d.choice.career?.name).toBe('นักบิน');
  });

  it('uses field defaults for what the character has not set', () => {
    const d = deriveCustom(scifi, parseCustomChar({ name: 'New', values: { career: 'marine' } }));
    expect(d.values.hp_max).toBe(3 * 5 + 8);
    expect(d.values.energy).toBe(6);
  });

  it('offers template rolls and per-row list rolls as dice expressions', () => {
    const d = deriveCustom(scifi, pilot);
    expect(d.rolls).toEqual(expect.arrayContaining([
      { id: 'shoot', label: 'ยิง', expr: '2d6+4', group: 'ต่อสู้' },
      { id: 'lift', label: 'ยก', expr: '2d6', group: 'หลัก' },
      { id: 'gear:g1', label: 'ยิง: ปืนเลเซอร์', expr: '2d6+4', group: 'อาวุธที่พก' },
    ]));
  });

  it('builds token bars and the initiative roll', () => {
    const d = deriveCustom(scifi, pilot);
    expect(d.bars).toEqual([
      { label: 'HP', current: 9, max: 13, color: '#e5484d' },
      { label: 'พลังงาน', current: 6, max: 6, color: '#3e8ef7' },
    ]);
    expect(d.initiative).toEqual({ expr: '1d10+4', tie: 4 });
  });

  it('reports a broken formula on its own field instead of failing the sheet', () => {
    const t = parseTemplate({ ...scifi, fields: [...scifi.fields, { key: 'bad', label: 'พัง', kind: 'formula', formula: '@nope + 1', section: 'main' }] });
    const d = deriveCustom(t, pilot);
    expect(d.errors.bad).toMatch(/nope/);
    expect(d.values.hp_max).toBe(13);
  });

  it('a self-referencing formula is an error, not a hang', () => {
    const t = parseTemplate({ ...scifi, fields: [{ key: 'a', label: 'a', kind: 'formula', formula: '@a + 1', section: 'main' }] });
    expect(deriveCustom(t, pilot).errors.a).toMatch(/วน/);
  });

  it('a roll button without dice says so instead of rolling nothing', () => {
    const t = parseTemplate({ ...scifi, rolls: [{ id: 'flat', label: 'คงที่', expr: '@reflex + 2', section: 'main' }] });
    const d = deriveCustom(t, pilot);
    expect(d.rolls.find((r) => r.id === 'flat')).toBeUndefined();
    expect(d.errors['roll:flat']).toMatch(/ลูกเต๋า/);
  });

  it('rejects templates with clashing or invalid field keys', () => {
    expect(() => parseTemplate({ ...scifi, fields: [...scifi.fields, scifi.fields[0]] })).toThrow();
    expect(() => parseTemplate({ ...scifi, fields: [{ key: 'Bad Key', label: 'x', kind: 'number', section: 'main' }] })).toThrow();
  });

  it('the starter template works out of the box', () => {
    const t = parseTemplate(STARTER_TEMPLATE);
    const d = deriveCustom(t, parseCustomChar({ name: 'ทดสอบ' }));
    expect(d.rolls.length).toBeGreaterThan(0);
    expect(d.bars.length).toBeGreaterThan(0);
    expect(Object.keys(d.errors)).toEqual([]);
  });
});

describe('skills', () => {
  const withSkills = parseTemplate({
    ...scifi,
    skills: {
      roll: '1d20 + @stat + @rank',
      allowPlayerSkills: true,
      list: [{ key: 'hacking', label: 'แฮก', stat: 'reflex' }, { key: 'brawl', label: 'ต่อยตี', stat: 'body' }],
    },
  });
  const hacker = parseCustomChar({
    ...pilot,
    skillRanks: { hacking: 3 },
    customSkills: [{ id: 's1', label: 'ร้องเพลง', stat: 'body', rank: 1 }],
  });

  it('every template skill gets a roll from the one skill formula, using the character\'s rank', () => {
    const d = deriveCustom(withSkills, hacker);
    expect(d.skills).toEqual([
      { id: 'hacking', label: 'แฮก', stat: 'reflex', rank: 3, expr: '1d20+7', source: 'room' },
      { id: 'brawl', label: 'ต่อยตี', stat: 'body', rank: 0, expr: '1d20+2', source: 'room' },
      { id: 'own:s1', label: 'ร้องเพลง', stat: 'body', rank: 1, expr: '1d20+3', source: 'own' },
    ]);
    expect(d.rolls).toEqual(expect.arrayContaining([{ id: 'skill:hacking', label: 'แฮก', expr: '1d20+7', group: 'สกิล' }]));
  });

  it('a skill pointing at a missing stat is reported, not rolled', () => {
    const t = parseTemplate({ ...withSkills, skills: { ...withSkills.skills!, list: [{ key: 'x', label: 'X', stat: 'nope' }] } });
    const d = deriveCustom(t, hacker);
    expect(d.errors['skill:x']).toMatch(/nope|ค่าพลัง/);
    expect(d.skills.find((s) => s.id === 'x')).toBeUndefined();
  });

  it('templates without skills have none', () => {
    expect(deriveCustom(scifi, pilot).skills).toEqual([]);
  });
});
