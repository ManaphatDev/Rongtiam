<script lang="ts">
  import { STANDARD_LANGUAGES } from '../../overlay';
  import { classLanguages, languagePicks } from '../helpers';
  import type { Draft } from '../draft';
  import PickMany from './PickMany.svelte';

  let { draft = $bindable() }: { draft: Draft } = $props();
</script>

<p class="hint">ทุกคนรู้ภาษา Common อยู่แล้ว เลือกเพิ่มอีก {languagePicks(draft)} ภาษา</p>
{#if classLanguages(draft).length}<p class="hint">ได้จากอาชีพแล้ว: {classLanguages(draft).join(', ')}</p>{/if}
<PickMany legend="ภาษา" options={STANDARD_LANGUAGES.map((l) => ({ id: l, label: l }))} selected={draft.languages}
  max={languagePicks(draft)} onchange={(v) => (draft.languages = v)} />
