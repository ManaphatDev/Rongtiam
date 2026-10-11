<script lang="ts">
  import type { Draft } from '../draft';

  let { draft = $bindable(), maxStartLevel }: { draft: Draft; maxStartLevel: number } = $props();
</script>

<label class="field">ชื่อตัวละคร
  <input type="text" maxlength="60" bind:value={draft.name} />
</label>
{#if maxStartLevel > 1}
  <label class="field narrow">เลเวลเริ่มต้น
    <select value={Math.min(draft.startLevel, maxStartLevel)} onchange={(e) => (draft.startLevel = Number(e.currentTarget.value))}>
      {#each Array.from({ length: maxStartLevel }, (_, i) => i + 1) as n (n)}<option value={n}>{n}</option>{/each}
    </select>
  </label>
  <p class="hint">สร้างที่เลเวล 1 ก่อน แล้วตัวช่วยจะพาขึ้นเลเวลทีละขั้นจนถึงเลเวลที่เลือก</p>
{/if}
<label class="field">บันทึก (ไม่บังคับ)
  <textarea rows="4" maxlength="2000" bind:value={draft.notes}></textarea>
</label>
