<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { SKILLS, SPECIES_TH, type Skill } from '../../i18n/th';
  import { emptyPicks, type Draft } from '../draft';
  import { backgroundFeat, originFeats, repeatable, skillSources, speciesFeatRef, speciesOf, speciesRulesOf } from '../helpers';
  import FeatPicks from './FeatPicks.svelte';
  import Pick from './Pick.svelte';

  let { draft = $bindable(), srd }: { draft: Draft; srd: Srd } = $props();

  const sp = $derived(speciesOf(draft, srd));
  const choices = $derived(speciesRulesOf(draft)?.choices ?? []);
  const src = $derived(skillSources(draft, srd));
  /** Skills the background and the class already hold. */
  const heldBefore = $derived(new Set([...src.bg, ...src.cls]));
  const bgFeat = $derived(backgroundFeat(draft, srd));
  const feat = $derived(speciesFeatRef(draft, srd));

  function pickSpecies(key: string) {
    if (draft.species === key) return;
    Object.assign(draft, { species: key, speciesOptions: {}, speciesSkill: null, speciesFeat: null, speciesFeatPicks: emptyPicks() });
  }
  function pickOption(id: string, value: string) {
    draft.speciesOptions = { ...draft.speciesOptions, [id]: value };
  }
  function pickFeat(key: string) {
    draft.speciesFeat = key;
    draft.speciesFeatPicks = emptyPicks();
  }
</script>

<Pick legend="เผ่า" options={srd.species.map((s) => ({ id: s.key, label: SPECIES_TH[s.key] ?? s.name, hint: s.name }))}
  value={draft.species} onpick={pickSpecies} />

{#if sp}
  <p class="hint">ขนาด {sp.size} · ความเร็ว {sp.speed} ฟุต</p>
  <details class="block">
    <summary>ลักษณะของเผ่า (ข้อความจาก SRD)</summary>
    {#each sp.traits as t (t.name)}<p><b>{t.name}.</b> {t.desc}</p>{/each}
  </details>

  {#each choices as c (c.id)}
    {#if c.kind === 'option'}
      <Pick legend={c.label} options={c.options.map((o) => ({ id: o.id, label: o.name }))} value={draft.speciesOptions[c.id] ?? null}
        onpick={(v) => pickOption(c.id, v)} />
    {:else if c.kind === 'skill'}
      <Pick legend="สกิลของเผ่า"
        options={(c.from === 'any' ? Object.keys(SKILLS) : c.from).map((s) => ({ id: s, label: SKILLS[s as Skill].th, disabled: heldBefore.has(s) }))}
        value={draft.speciesSkill} onpick={(s) => (draft.speciesSkill = s)} />
    {:else if c.kind === 'originFeat'}
      <Pick legend="Origin feat" options={originFeats(srd).map((f) => ({ id: f.key, label: f.name, disabled: f.key === bgFeat?.key && !repeatable(f) }))}
        value={draft.speciesFeat} onpick={pickFeat} />
      {#if feat}<FeatPicks {feat} usedList={feat.key === bgFeat?.key ? bgFeat.list : null} bind:picks={draft.speciesFeatPicks} {srd} taken={[...heldBefore, ...src.sp]} />{/if}
    {/if}
  {/each}
{/if}
