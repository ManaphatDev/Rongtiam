<script lang="ts">
  import { EXTRA_LANGUAGES, STANDARD_LANGUAGES } from '../../overlay';
  import type { Draft } from '../draft';
  import PickMany from './PickMany.svelte';

  let { draft = $bindable() }: { draft: Draft } = $props();
</script>

<p class="hint">ทุกคนรู้ภาษา Common อยู่แล้ว เลือกเพิ่มอีก {EXTRA_LANGUAGES} ภาษา</p>
<PickMany legend="ภาษา" options={STANDARD_LANGUAGES.map((l) => ({ id: l, label: l }))} selected={draft.languages}
  max={EXTRA_LANGUAGES} onchange={(v) => (draft.languages = v)} />
