import { describe, expect, it } from 'vitest';
import { usageCount } from './usage';

describe('usageCount', () => {
  it('counts characters that use a key anywhere it can appear', () => {
    const chars = [
      { weapons: ['hb-flame'], armor: null, feats: [], spells: { known: [] } },
      { weapons: [], armor: 'hb-flame', feats: [], spells: { known: [] } },
      { weapons: [], feats: ['hb-flame'] },
      { species: 'hb-flame' },
      { background: 'hb-flame', spells: { known: ['hb-flame'] } },
      { weapons: ['longsword'] },
      {},
    ];
    expect(usageCount('hb-flame', chars)).toBe(5);
    expect(usageCount('hb-none', chars)).toBe(0);
  });
});
