// Initiative order (pure): sorting, whose turn it is, and advancing turns and rounds.
import type { InitRow } from '../sync/types';

/** Highest initiative first; ties by the tie-breaker (e.g. Dexterity), then by who joined first. */
export function ordered(rows: InitRow[]): InitRow[] {
  return [...rows].sort((a, b) => b.init - a.init || b.tie - a.tie || (a.created_at ?? '').localeCompare(b.created_at ?? '') || (a.id < b.id ? -1 : 1));
}

export interface Turn {
  round: number;
  current: string | null;
}

/** The next turn: the following entry, wrapping to the top (and the next round) after the last. */
export function nextTurn(order: InitRow[], t: Turn): Turn {
  if (!order.length) return { round: 1, current: null };
  const i = order.findIndex((e) => e.id === t.current);
  if (i < 0) return { round: Math.max(1, t.round), current: order[0].id };
  if (i === order.length - 1) return { round: t.round + 1, current: order[0].id };
  return { round: t.round, current: order[i + 1].id };
}

export function prevTurn(order: InitRow[], t: Turn): Turn {
  if (!order.length) return { round: 1, current: null };
  const i = order.findIndex((e) => e.id === t.current);
  if (i <= 0) return t.round > 1 ? { round: t.round - 1, current: order[order.length - 1].id } : { round: 1, current: order[0].id };
  return { round: t.round, current: order[i - 1].id };
}
