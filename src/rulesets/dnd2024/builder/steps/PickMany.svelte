<script lang="ts">
  // Choose up to `max` of several options. Once the limit is reached the unchosen ones are disabled.
  import { pickState, toggle, type Opt } from '../ui';

  let { legend, options, selected, max, onchange }: {
    legend: string; options: Opt[]; selected: string[]; max: number; onchange: (next: string[]) => void;
  } = $props();

  const view = $derived(pickState(selected, options, max));
  // A pick the options no longer offer would be invisible yet counted, leaving the player unable to fix the count.
  $effect(() => {
    if (view.kept.length !== selected.length) onchange(view.kept);
  });
</script>

<fieldset class="pick-set">
  <legend>{legend} <small class="hint">เลือกแล้ว {view.kept.length}/{max}</small></legend>
  <div class="pick-grid">
    {#each options as o (o.id)}
      <button type="button" class="chip" aria-pressed={selected.includes(o.id)} disabled={view.locked(o)}
        onclick={() => onchange(toggle(view.kept, o.id, max))}>
        {o.label}{#if o.hint}<small>{o.hint}</small>{/if}
      </button>
    {/each}
  </div>
</fieldset>
