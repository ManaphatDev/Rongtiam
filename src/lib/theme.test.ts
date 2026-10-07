import { describe, expect, it } from 'vitest';
import { isTheme, nextTheme } from './theme';

describe('theme', () => {
  it('cycles auto → light → dark → auto', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
  it('only accepts known values (a stale or edited localStorage entry falls back to auto)', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
