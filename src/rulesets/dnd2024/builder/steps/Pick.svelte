<script lang="ts">
  // Choose exactly one of several options, as a group of toggle buttons.
  import type { Opt } from '../ui';

  let { legend, options, value, onpick }: { legend: string; options: Opt[]; value: string | null; onpick: (id: string) => void } = $props();
</script>

<fieldset class="pick-set">
  <legend>{legend}</legend>
  <div class="pick-grid">
    {#each options as o (o.id)}
      <button type="button" class="chip" aria-pressed={value === o.id} disabled={o.disabled} onclick={() => onpick(o.id)}>
        {o.label}{#if o.hint}<small>{o.hint}</small>{/if}
      </button>
    {/each}
  </div>
</fieldset>
