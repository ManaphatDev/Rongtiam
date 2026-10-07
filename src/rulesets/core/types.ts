// What a ruleset plugin provides. The table core knows nothing about any game system: it stores character data
// opaquely and asks the ruleset for derived numbers, roll buttons, token bars, conditions and initiative.
import type { Component } from 'svelte';
import type { CharOp } from '../../sync/types';

/** A roll the sheet offers (ability check, save, attack...). `expr` is a dice expression for the dice model. */
export interface RollAction {
  id: string;
  label: string;
  expr: string;
  group: string;
}

/** A bar drawn on the character's token (HP, mana, stress...). */
export interface TokenBar {
  label: string;
  current: number;
  max: number;
  color: string;
}

export interface ConditionDef {
  key: string;
  label: string;
  icon: string;
}

/** Room-level material a ruleset reads (the custom template, homebrew), from room_content. */
export interface RulesetContext {
  content: { kind: string; key: string; data: Record<string, unknown> }[];
}

export interface SheetProps {
  data: Record<string, unknown>;
  ctx: RulesetContext;
  editable: boolean;
  /** The viewer is a GM (some options, like adding personal skills, may be the GM's call). */
  isGM: boolean;
  /** Field-level edit: path inside `data`, the new value (null removes), and how long to wait for more typing. */
  patch: (path: (string | number)[], value: unknown, delay?: number) => void;
  roll: (label: string, expr: string) => void;
}

export interface RulesetModule {
  id: string;
  /** Thai name shown when choosing a system. */
  name: string;
  /** Loads whatever the ruleset needs (e.g. SRD data). Call before the synchronous methods below. */
  ready(): Promise<void>;
  newCharacter(ctx: RulesetContext): Record<string, unknown>;
  /** Validates (and upgrades) imported data; throws when it can't be this ruleset's character. */
  parse(raw: unknown): Record<string, unknown>;
  /** Display name of a character. */
  nameOf(data: Record<string, unknown>): string;
  rolls(data: Record<string, unknown>, ctx: RulesetContext): RollAction[];
  conditions(ctx: RulesetContext): ConditionDef[];
  /** Active condition keys of a character. */
  activeConditions(data: Record<string, unknown>): string[];
  toggleCondition(data: Record<string, unknown>, key: string): CharOp[];
  bars(data: Record<string, unknown>, ctx: RulesetContext): TokenBar[];
  /** Ops that apply damage (negative) or healing (positive) to the main bar. */
  applyHp(data: Record<string, unknown>, delta: number, ctx: RulesetContext): CharOp[];
  initiative(data: Record<string, unknown>, ctx: RulesetContext): { expr: string; tie: number };
  Sheet: () => Promise<Component<SheetProps>>;
}
