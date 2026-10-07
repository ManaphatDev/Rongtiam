// Small pieces the builder's step components share.
export interface Opt {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Adds or removes `id`; adding past `max` changes nothing. Returns a new list. */
export function toggle(list: string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length < max ? [...list, id] : list;
}
