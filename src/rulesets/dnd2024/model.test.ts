import { describe, expect, it } from 'vitest';
import { D2024Z, parseCharacter } from './model';

describe('character model', () => {
  it('loads characters saved before feats, languages and tools existed', () => {
    const c = parseCharacter({ name: 'Old', classKey: 'fighter', level: 3 });
    expect(c).toMatchObject({ name: 'Old', v: 1, feats: [], languages: [], tools: [] });
  });

  it('keeps what a builder wrote', () => {
    const c = parseCharacter({ feats: ['alert'], languages: ['Common', 'Elvish'], tools: ["Thieves' Tools"] });
    expect(c.feats).toEqual(['alert']);
    expect(c.languages).toEqual(['Common', 'Elvish']);
    expect(c.tools).toEqual(["Thieves' Tools"]);
  });

  it('two new characters never share their lists', () => {
    const a = D2024Z.parse({});
    a.feats.push('alert');
    expect(D2024Z.parse({}).feats).toEqual([]);
  });
});
