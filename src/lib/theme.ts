// Light / dark / follow-the-system. Stored per viewer; applied as data-theme on <html>
// (no attribute = follow prefers-color-scheme; see the tokens in app.css).
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'rongtiam.theme';
const ORDER: Theme[] = ['auto', 'light', 'dark'];

export const isTheme = (v: unknown): v is Theme => v === 'auto' || v === 'light' || v === 'dark';
export const nextTheme = (t: Theme): Theme => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  applyTheme(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // private mode: the choice lasts until the page is closed
  }
}
