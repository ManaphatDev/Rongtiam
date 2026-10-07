// Immutable get/set/remove by path on plain JSON data (character sheets are edited field by field).
export type Path = (string | number)[];

export const pathKey = (p: Path) => JSON.stringify(p);

export function getIn(obj: unknown, path: Path): unknown {
  let cur = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** A copy with `value` at `path` (missing parents become objects); null or undefined removes the key, like the server. */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (!path.length) return obj;
  const [k, ...rest] = path;
  const src = (obj !== null && typeof obj === 'object' ? obj : {}) as Record<string | number, unknown>;
  const copy: Record<string | number, unknown> = Array.isArray(src) ? ([...src] as never) : { ...src };
  if (!rest.length) {
    if (value === null || value === undefined) {
      if (Array.isArray(copy)) (copy as unknown[]).splice(Number(k), 1);
      else delete copy[k];
    } else copy[k] = value;
  } else {
    copy[k] = setIn(src[k], rest, value);
  }
  return copy as T;
}
