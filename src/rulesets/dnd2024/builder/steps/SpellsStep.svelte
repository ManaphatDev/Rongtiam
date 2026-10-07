<script lang="ts">
  import type { Srd } from '../../data/schema';
  import type { Draft } from '../draft';
  import { cantripTarget, classOf, classRulesOf, classSpells, spellTarget } from '../helpers';
  import PickMany from './PickMany.svelte';

  let { draft = $bindable(), srd }: { draft: Draft; srd: Srd } = $props();

  const cls = $derived(classOf(draft, srd));
  const cantrips = $derived(cantripTarget(draft, srd));
  const spells = $derived(spellTarget(draft, srd));
  const book = $derived(!!classRulesOf(draft)?.spellbook);
</script>

{#if cls}
  {#if cantrips > 0}
    <PickMany legend="Cantrip" options={classSpells(draft, srd, 0).map((s) => ({ id: s.key, label: s.name, hint: s.school }))}
      selected={draft.cantrips} max={cantrips} onchange={(v) => (draft.cantrips = v)} />
  {/if}
  {#if spells > 0}
    <PickMany legend={book ? 'เวทเลเวล 1 ในสมุดเวท' : 'เวทเลเวล 1'}
      options={classSpells(draft, srd, 1).map((s) => ({ id: s.key, label: s.name, hint: s.school }))}
      selected={draft.spells} max={spells} onchange={(v) => (draft.spells = v)} />
  {/if}
{/if}
