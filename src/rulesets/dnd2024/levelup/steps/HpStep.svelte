<script lang="ts">
  import Pick from '../../builder/steps/Pick.svelte';
  import type { LevelDraft } from '../draft';

  let { draft = $bindable(), hitDie, con, rolling, onroll }:
    { draft: LevelDraft; hitDie: number; con: number; rolling: boolean; onroll: () => void } = $props();

  const average = $derived(hitDie / 2 + 1);
  const die = $derived(draft.hp.method === 'roll' ? draft.hp.rolled : draft.hp.method === 'average' ? average : null);
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
</script>

<Pick legend="วิธีเพิ่ม HP" value={draft.hp.method}
  options={[
    { id: 'average', label: `ค่าเฉลี่ย (${average})`, disabled: draft.hp.rolled !== null },
    { id: 'roll', label: `ทอย 1d${hitDie}` },
  ]}
  onpick={(m) => (draft.hp = { method: m as 'average' | 'roll', rolled: draft.hp.rolled })} />

{#if draft.hp.method === 'roll'}
  {#if draft.hp.rolled === null}
    <button class="btn primary" type="button" disabled={rolling} onclick={onroll}>
      {rolling ? 'กำลังทอย…' : `ทอย Hit Die (1d${hitDie})`}
    </button>
    <p class="hint">ทอยได้ครั้งเดียว ผลทอยจะบันทึกไว้ทันที</p>
  {:else}
    <p>ทอยได้ {draft.hp.rolled}</p>
  {/if}
{/if}
{#if die !== null}
  <p class="hint">HP สูงสุดเพิ่ม {Math.max(1, die + con)} (Hit Die {die} {signed(con)} จากความอดทน อย่างน้อย 1)</p>
{/if}
