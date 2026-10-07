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

/**
 * What a many-choice set shows. `kept` is the chosen ids that are still offered; a pick the options no longer
 * contain (the class or background changed under it) would be invisible but still count, so it is dropped.
 * A chosen option is never locked, even if a clash disabled it, so it can always be taken back.
 */
export function pickState(selected: string[], options: Opt[], max: number) {
  const offered = new Set(options.map((o) => o.id));
  const kept = selected.filter((id) => offered.has(id));
  return { kept, locked: (o: Opt) => !selected.includes(o.id) && (!!o.disabled || kept.length >= max) };
}
