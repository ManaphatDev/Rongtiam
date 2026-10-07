import { describe, expect, it } from 'vitest';
import { parse } from '../../dice/model';
import { SrdZ } from './data/schema';
import raw from './data/srd.json';
import { derive } from './derive';
import { newCharacter, parseCharacter } from './model';
import { activeConditions, applyHp, bars, rollActions, toggleCondition } from './rules';

const srd = SrdZ.parse(raw);
const fighter = parseCharacter({
  ...newCharacter(), name: 'Brakka', classKey: 'fighter', level: 3,
  abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 13, cha: 10 }, weapons: ['longsword'], hp: { current: 20, temp: 5 },
});
const d = derive(fighter, srd);

describe('dnd2024 table rules', () => {
  it('every roll button is a valid dice expression', () => {
    const rolls = rollActions(fighter, d);
    for (const r of rolls) expect(() => parse(r.expr), r.label).not.toThrow();
    expect(rolls.find((r) => r.id === 'save:str')?.expr).toBe('1d20+5');
    expect(rolls.find((r) => r.id === 'check:int')?.expr).toBe('1d20-1');
    expect(rolls.find((r) => r.id === 'dmg2:longsword')?.expr).toBe('1d10+3');
    expect(rolls.some((r) => r.group === 'เวท')).toBe(false);
  });

  it('damage eats temporary HP first and stops at 0; healing stops at the maximum', () => {
    expect(applyHp(fighter, d, -3)).toEqual([{ path: ['hp', 'current'], value: 20 }, { path: ['hp', 'temp'], value: 2 }]);
    expect(applyHp(fighter, d, -9)).toEqual([{ path: ['hp', 'current'], value: 16 }, { path: ['hp', 'temp'], value: 0 }]);
    expect(applyHp(fighter, d, -100)).toEqual([{ path: ['hp', 'current'], value: 0 }, { path: ['hp', 'temp'], value: 0 }]);
    expect(applyHp(fighter, d, 50)).toEqual([{ path: ['hp', 'current'], value: d.maxHp }]);
  });

  it('the token bar shows HP including temporary HP', () => {
    expect(bars(fighter, d)).toEqual([{ label: 'HP', current: 25, max: d.maxHp, color: '#3e8ef7' }]);
  });

  it('conditions toggle on and off; exhaustion counts as a condition while above 0', () => {
    expect(toggleCondition(fighter, 'prone')).toEqual([{ path: ['conditions'], value: ['prone'] }]);
    const prone = parseCharacter({ ...fighter, conditions: ['prone'], exhaustion: 2 });
    expect(toggleCondition(prone, 'prone')).toEqual([{ path: ['conditions'], value: [] }]);
    expect(activeConditions(prone)).toEqual(['prone', 'exhaustion']);
    expect(toggleCondition(prone, 'exhaustion')).toEqual([{ path: ['exhaustion'], value: 0 }]);
    expect(toggleCondition(fighter, 'not-a-condition')).toEqual([]);
  });
});
