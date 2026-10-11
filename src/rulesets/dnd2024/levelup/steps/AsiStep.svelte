<script lang="ts">
  import Pick from '../../builder/steps/Pick.svelte';
  import PickMany from '../../builder/steps/PickMany.svelte';
  import { repeatable } from '../../builder/helpers';
  import type { Srd } from '../../data/schema';
  import { ABILITIES, ABILITY_TH, type Ability } from '../../i18n/th';
  import type { D2024 } from '../../model';
  import type { LevelDraft } from '../draft';
  import { featBoost, meetsPrerequisite } from '../srdText';
  import { generalFeats, isCaster } from '../validate';

  let { draft = $bindable(), c, srd }: { draft: LevelDraft; c: D2024; srd: Srd } = $props();

  const mode = $derived(draft.asi?.kind === 'feat' ? 'feat' : draft.asi?.kind === 'scores' ? draft.asi.mode : null);
  const feats = $derived(generalFeats(srd).map((f) => ({
    id: f.key, label: f.name, hint: f.prerequisite ?? undefined,
    disabled: !meetsPrerequisite(f.prerequisite, c.level + 1, c.abilities, isCaster(c, srd)) || (c.feats.includes(f.key) && !repeatable(f)),
  })));
  const featKey = $derived(draft.asi?.kind === 'feat' ? draft.asi.key : null);
  const chosen = $derived(featKey ? srd.feats.find((f) => f.key === featKey) : undefined);
  const boost = $derived(chosen ? featBoost(chosen.desc) : null);
  const abilityOpts = (by: number, max: number, only: readonly Ability[] = ABILITIES) =>
    only.map((a) => ({ id: a, label: `${ABILITY_TH[a].name} (${c.abilities[a]})`, disabled: c.abilities[a] + by > max }));

  function setMode(m: string) {
    draft.asi = m === 'feat' ? { kind: 'feat', key: null, ability: null } : { kind: 'scores', mode: m as '2' | '1/1', picks: [] };
  }
</script>

<Pick legend="Ability Score Improvement" value={mode} onpick={setMode}
  options={[{ id: '2', label: 'ค่าพลัง +2 หนึ่งค่า' }, { id: '1/1', label: 'ค่าพลัง +1 สองค่า' }, { id: 'feat', label: 'เลือก feat แทน' }]} />

{#if draft.asi?.kind === 'scores'}
  {@const n = draft.asi.mode === '2' ? 1 : 2}
  <PickMany legend={n === 1 ? 'ค่าพลังที่จะ +2' : 'ค่าพลังที่จะ +1'} max={n} options={abilityOpts(n === 1 ? 2 : 1, 20)}
    selected={draft.asi.picks} onchange={(p) => { if (draft.asi?.kind === 'scores') draft.asi.picks = p as Ability[]; }} />
{:else if draft.asi?.kind === 'feat'}
  <Pick legend="Feat" options={feats} value={draft.asi.key}
    onpick={(k) => (draft.asi = { kind: 'feat', key: k, ability: null })} />
  {#if boost}
    <Pick legend={`ค่าพลังที่ ${chosen?.name} เพิ่มให้`} options={abilityOpts(1, boost.max, boost.abilities)}
      value={draft.asi.ability} onpick={(a) => { if (draft.asi?.kind === 'feat') draft.asi.ability = a as Ability; }} />
  {/if}
  {#if chosen}<details><summary>รายละเอียดของ {chosen.name}</summary><p class="hint">{chosen.desc}</p></details>{/if}
{/if}
