<script lang="ts">
  import { COLORS } from '../lib/profile';

  let { name = $bindable(''), color = $bindable(COLORS[0]) }: { name: string; color: string } = $props();
</script>

<label class="field">ชื่อที่เพื่อนจะเห็น
  <input type="text" bind:value={name} maxlength="40" placeholder="เช่น ต้น, พี่ GM" autocomplete="nickname" required />
</label>
<div class="field">สีประจำตัว
  <div class="swatches" role="radiogroup" aria-label="สีประจำตัว">
    {#each COLORS as c (c)}
      <button type="button" class="sw" style:background={c} role="radio" aria-checked={color === c} aria-label={`สี ${c}`} onclick={() => (color = c)}></button>
    {/each}
  </div>
</div>
