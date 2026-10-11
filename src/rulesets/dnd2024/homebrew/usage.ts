// How many characters use a key, so deleting a homebrew entry can say who it affects. Reads raw sheet data
// defensively: a character missing a field simply doesn't use the key there.
const has = (v: unknown, key: string) => (Array.isArray(v) ? v.includes(key) : v === key);

export function usageCount(key: string, characters: Record<string, unknown>[]): number {
  return characters.filter((d) => {
    const spells = (d.spells ?? {}) as { known?: unknown };
    return has(d.weapons, key) || has(d.armor, key) || has(d.feats, key) || has(d.species, key)
      || has(d.background, key) || has(spells.known, key);
  }).length;
}
