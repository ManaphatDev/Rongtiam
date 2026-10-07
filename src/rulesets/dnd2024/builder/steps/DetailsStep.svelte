<script lang="ts">
  import type { Draft } from '../draft';

  let { draft = $bindable() }: { draft: Draft } = $props();
</script>

<label class="field">ชื่อตัวละคร
  <input type="text" maxlength="60" bind:value={draft.name} />
</label>
<label class="field">บันทึก (ไม่บังคับ)
  <textarea rows="4" maxlength="2000" bind:value={draft.notes}></textarea>
</label>
