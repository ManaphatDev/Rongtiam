<script lang="ts">
  // What an Origin feat asks the player to decide: Magic Initiate's spell list and spells, Skilled's skills.
  import type { Srd } from '../../data/schema';
  import { CLASSES_TH, SKILLS, type Skill } from '../../i18n/th';
  import type { FeatPicks } from '../draft';
  import { FEAT_LISTS, listSpells, type FeatList, type FeatRef } from '../helpers';
  import Pick from './Pick.svelte';
  import PickMany from './PickMany.svelte';

  let { feat, picks = $bindable(), srd, taken = [], usedList = null }: {
    feat: FeatRef; picks: FeatPicks; srd: Srd; taken?: string[];
    /** Taking Magic Initiate a second time: the list the first one used, which this one may not repeat. */
    usedList?: FeatList | null;
  } = $props();

  /** The list is fixed by a background ("Magic Initiate (Cleric)") or chosen here. */
  const list = $derived(feat.list ?? picks.list);
  const listName = (l: string) => `${CLASSES_TH[l] ?? l} (${l})`;
</script>

{#if feat.key === 'magic-initiate'}
  <p class="hint">{feat.name}: เลือกแคนทริป 2 อย่าง และเวทเลเวล 1 อีก 1 อย่าง จากรายชื่อเดียวกัน</p>
  {#if !feat.list}
    <Pick legend="รายชื่อเวทของ Magic Initiate" options={FEAT_LISTS.map((l) => ({ id: l, label: listName(l), disabled: l === usedList }))} value={picks.list}
      onpick={(id) => (picks = { list: id as FeatList, cantrips: [], spell: null, skills: [] })} />
  {/if}
  {#if list}
    <PickMany legend="Magic Initiate: แคนทริป" options={listSpells(list, 0, srd).map((s) => ({ id: s.key, label: s.name }))}
      selected={picks.cantrips} max={2} onchange={(v) => (picks.cantrips = v)} />
    <Pick legend="Magic Initiate: เวทเลเวล 1" options={listSpells(list, 1, srd).map((s) => ({ id: s.key, label: s.name }))}
      value={picks.spell} onpick={(id) => (picks.spell = id)} />
  {/if}
{:else if feat.key === 'skilled'}
  <PickMany legend="Skilled: สกิล 3 อย่าง"
    options={Object.keys(SKILLS).map((s) => ({ id: s, label: SKILLS[s as Skill].th, disabled: taken.includes(s) }))}
    selected={picks.skills} max={3} onchange={(v) => (picks.skills = v)} />
{/if}
