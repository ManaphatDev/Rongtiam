<script lang="ts">
  import Pick from '../../builder/steps/Pick.svelte';
  import type { Srd } from '../../data/schema';
  import { ABILITY_TH, type Ability } from '../../i18n/th';
  import type { D2024 } from '../../model';
  import type { LevelDraft } from '../draft';
  import { boostOf, meetsPrerequisite } from '../srdText';
  import { epicBoons, isCaster } from '../validate';

  let { draft = $bindable(), c, srd }: { draft: LevelDraft; c: D2024; srd: Srd } = $props();

  const boons = $derived(epicBoons(srd).map((f) => ({
    id: f.key, label: f.name, hint: f.prerequisite ?? undefined,
    disabled: !meetsPrerequisite(f.prerequisite, c.level + 1, c.abilities, isCaster(c, srd)) || c.feats.includes(f.key),
  })));
  const chosen = $derived(srd.feats.find((f) => f.key === draft.boon?.key));
  const boost = $derived(chosen ? boostOf(chosen) : null);
</script>

<Pick legend="Epic Boon" options={boons} value={draft.boon?.key ?? null} onpick={(k) => (draft.boon = { key: k, ability: null })} />
{#if boost}
  <Pick legend="ค่าพลังที่จะ +1" value={draft.boon?.ability ?? null}
    options={boost.abilities.map((a) => ({ id: a, label: `${ABILITY_TH[a].name} (${c.abilities[a]})`, disabled: c.abilities[a] + 1 > boost.max }))}
    onpick={(a) => { if (draft.boon) draft.boon.ability = a as Ability; }} />
{/if}
{#if chosen}<details><summary>รายละเอียดของ {chosen.name}</summary><p class="hint">{chosen.desc}</p></details>{/if}
