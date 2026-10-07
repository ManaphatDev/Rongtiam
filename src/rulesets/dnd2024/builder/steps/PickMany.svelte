<script lang="ts">
  // Choose up to `max` of several options. Once the limit is reached the unchosen ones are disabled.
  import { toggle, type Opt } from '../ui';

  let { legend, options, selected, max, onchange }: {
    legend: string; options: Opt[]; selected: string[]; max: number; onchange: (next: string[]) => void;
  } = $props();
</script>

<fieldset class="pick-set">
  <legend>{legend} <small class="hint">เลือกแล้ว {selected.length}/{max}</small></legend>
  <div class="pick-grid">
    {#each options as o (o.id)}
      {@const on = selected.includes(o.id)}
      <button type="button" class="chip" aria-pressed={on} disabled={o.disabled || (!on && selected.length >= max)}
        onclick={() => onchange(toggle(selected, o.id, max))}>
        {o.label}{#if o.hint}<small>{o.hint}</small>{/if}
      </button>
    {/each}
  </div>
</fieldset>
