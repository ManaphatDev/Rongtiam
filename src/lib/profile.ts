// Things this browser remembers: display name/colour, recently visited rooms and GM keys.
import { prefs } from '../table/ui.svelte';

export const COLORS = ['#e5484d', '#f5a524', '#f7d84a', '#46a758', '#2db4a8', '#3e8ef7', '#8e5cf7', '#e255a1', '#ffffff', '#111111'];

export interface Profile {
  name: string;
  color: string;
}

export const getProfile = (): Profile => prefs.load<Profile>('profile', { name: '', color: COLORS[Math.floor(Math.random() * 8)] });
export const setProfile = (p: Profile) => prefs.store('profile', p);

export interface Recent {
  slug: string;
  name: string;
  at: number;
}

export const getRecent = (): Recent[] => prefs.load<Recent[]>('rooms:recent', []);
export function rememberRoom(slug: string, name: string) {
  const list = getRecent().filter((r) => r.slug !== slug);
  list.unshift({ slug, name, at: Date.now() });
  prefs.store('rooms:recent', list.slice(0, 12));
}
export function forgetRoom(slug: string) {
  prefs.store('rooms:recent', getRecent().filter((r) => r.slug !== slug));
}

export const getGmKey = (slug: string): string | undefined => prefs.load<Record<string, string>>('gmKeys', {})[slug];
export function setGmKey(slug: string, key: string) {
  const all = prefs.load<Record<string, string>>('gmKeys', {});
  all[slug] = key;
  prefs.store('gmKeys', all);
}

export const roomUrl = (slug: string) => `${location.origin}/r/${slug}`;
export const gmUrl = (slug: string, key: string) => `${roomUrl(slug)}#gm=${key}`;
