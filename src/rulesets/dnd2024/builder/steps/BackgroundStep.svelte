<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { ABILITY_TH, BACKGROUNDS_TH, SKILLS, type Ability, type Skill } from '../../i18n/th';
  import type { Draft } from '../draft';
  import { backgroundFeat, backgroundOf } from '../helpers';
  import FeatPicks from './FeatPicks.svelte';
  import Pick from './Pick.svelte';

  let { draft = $bindable(), srd }: { draft: Draft; srd: Srd } = $props();

  const bg = $derived(backgroundOf(draft, srd));
  const feat = $derived(backgroundFeat(draft, srd));
  const plus = (which: 'plus2' | 'plus1') => (draft.bgAsi.mode === '2/1' ? draft.bgAsi[which] : null);
  const abilityOptions = (other: Ability | null) =>
    (bg?.abilities ?? []).map((a) => ({ id: a, label: ABILITY_TH[a].name, disabled: a === other }));

  // The ability bonus, tools, equipment and feat picks all belong to the background, so a new one starts them over.
  function pickBackground(key: string) {
    if (draft.background === key) return;
    Object.assign(draft, {
      background: key, bgAsi: { mode: '2/1', plus2: null, plus1: null }, bgTools: [], bgEquip: null,
      bgFeat: { list: null, cantrips: [], spell: null, skills: [] },
    });
  }
  function setMode(mode: string) {
    draft.bgAsi = mode === '1/1/1' ? { mode: '1/1/1' } : { mode: '2/1', plus2: null, plus1: null };
  }
  function setPlus(which: 'plus2' | 'plus1', a: Ability) {
    if (draft.bgAsi.mode === '2/1') draft.bgAsi = { ...draft.bgAsi, [which]: a };
  }
  function setTool(i: number, value: string) {
    const next = Array.from({ length: bg?.tools.choose?.count ?? 0 }, (_, j) => draft.bgTools[j] ?? '');
    next[i] = value;
    draft.bgTools = next;
  }
</script>

<Pick legend="ฉากหลัง" options={srd.backgrounds.map((b) => ({ id: b.key, label: BACKGROUNDS_TH[b.key] ?? b.name, hint: b.name }))}
  value={draft.background} onpick={pickBackground} />

{#if bg}
  <p class="hint">Feat: {bg.feat} · สกิล: {bg.skills.map((s) => SKILLS[s as Skill].th).join(', ')} · เครื่องมือ: {bg.tool}</p>
  <Pick legend="วิธีเพิ่มค่าพลังจากฉากหลัง" options={[{ id: '2/1', label: '+2 และ +1' }, { id: '1/1/1', label: '+1 สามค่า' }]}
    value={draft.bgAsi.mode} onpick={setMode} />
  {#if draft.bgAsi.mode === '2/1'}
    <Pick legend="ค่าพลัง +2" options={abilityOptions(plus('plus1'))} value={plus('plus2')} onpick={(a) => setPlus('plus2', a as Ability)} />
    <Pick legend="ค่าพลัง +1" options={abilityOptions(plus('plus2'))} value={plus('plus1')} onpick={(a) => setPlus('plus1', a as Ability)} />
  {:else}
    <p class="hint">เพิ่ม +1 ให้ {bg.abilities.map((a) => ABILITY_TH[a].name).join(', ')}</p>
  {/if}

  {#if bg.tools.fixed.length}<p class="hint">เครื่องมือที่ได้: {bg.tools.fixed.join(', ')}</p>{/if}
  {#if bg.tools.choose}
    {#each Array.from({ length: bg.tools.choose.count }, (_, i) => i) as i (i)}
      <label class="field">เครื่องมือ ({bg.tools.choose.label}) อันที่ {i + 1}
        <input type="text" maxlength="40" value={draft.bgTools[i] ?? ''} oninput={(e) => setTool(i, e.currentTarget.value)} />
      </label>
    {/each}
  {/if}

  {#if feat}<FeatPicks {feat} bind:picks={draft.bgFeat} {srd} />{/if}
{/if}
