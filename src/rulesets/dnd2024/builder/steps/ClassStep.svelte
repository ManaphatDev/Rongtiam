<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { ABILITY_TH, CLASSES_TH, SKILLS, type Skill } from '../../i18n/th';
  import type { Draft } from '../draft';
  import { backgroundOf, classOf, fightingStyleFeats, level1Points, proficientSkills, weaponPool } from '../helpers';
  import type { Opt } from '../ui';
  import Pick from './Pick.svelte';
  import PickMany from './PickMany.svelte';

  let { draft = $bindable(), srd }: { draft: Draft; srd: Srd } = $props();

  const cls = $derived(classOf(draft, srd));
  /** Skills the background already gives (the class can't pick them again). */
  const held = $derived(new Set(backgroundOf(draft, srd)?.skills ?? []));
  const points = $derived(level1Points(draft));
  const skillOpt = (s: string, disabled = false): Opt => ({
    id: s, label: SKILLS[s as Skill].th, hint: ABILITY_TH[SKILLS[s as Skill].ability].short, disabled,
  });

  // Everything below the class depends on it, so a different class starts those picks over.
  function pickClass(key: string) {
    if (draft.classKey === key) return;
    Object.assign(draft, {
      classKey: key, classSkills: [], classTools: [], fightingStyle: null, masteries: [], expertise: [], order: null,
      invocations: [], classEquip: null, cantrips: [], spells: [],
    });
  }
  function setTool(i: number, value: string) {
    const next = Array.from({ length: cls?.tools.choose?.count ?? 0 }, (_, j) => draft.classTools[j] ?? '');
    next[i] = value;
    draft.classTools = next;
  }
</script>

<Pick legend="อาชีพ" options={srd.classes.map((k) => ({ id: k.key, label: CLASSES_TH[k.key] ?? k.name, hint: k.name }))}
  value={draft.classKey} onpick={pickClass} />

{#if cls}
  <p class="hint">
    Hit Die d{cls.hitDie} · เซฟ {cls.saves.map((a) => ABILITY_TH[a].short).join(', ')} · อาวุธ: {cls.training.weapons} · เกราะ: {cls.training.armor}
  </p>
  <PickMany legend="สกิลของอาชีพ" options={cls.skillChoice.from.map((s) => skillOpt(s, held.has(s)))} selected={draft.classSkills}
    max={cls.skillChoice.count} onchange={(v) => (draft.classSkills = v)} />

  {#if cls.tools.fixed.length}<p class="hint">เครื่องมือที่ได้: {cls.tools.fixed.join(', ')}</p>{/if}
  {#if cls.tools.choose}
    {#each Array.from({ length: cls.tools.choose.count }, (_, i) => i) as i (i)}
      <label class="field">เครื่องมือ ({cls.tools.choose.label}) อันที่ {i + 1}
        <input type="text" maxlength="40" value={draft.classTools[i] ?? ''} oninput={(e) => setTool(i, e.currentTarget.value)} />
      </label>
    {/each}
  {/if}

  {#each points as p (p.kind + p.feature)}
    {#if p.kind === 'fightingStyle'}
      <Pick legend="Fighting Style" options={fightingStyleFeats(srd).map((f) => ({ id: f.key, label: f.name }))}
        value={draft.fightingStyle} onpick={(id) => (draft.fightingStyle = id)} />
    {:else if p.kind === 'masteries'}
      <PickMany legend="Weapon Mastery"
        options={weaponPool(draft, srd, p.filter).map((w) => ({ id: w.key, label: w.name, hint: w.mastery ?? undefined }))}
        selected={draft.masteries} max={p.count} onchange={(v) => (draft.masteries = v)} />
    {:else if p.kind === 'expertise'}
      <PickMany legend="Expertise (เชี่ยวชาญสกิล)" options={proficientSkills(draft, srd).map((s) => skillOpt(s))}
        selected={draft.expertise} max={p.count} onchange={(v) => (draft.expertise = v)} />
    {:else if p.kind === 'order'}
      <Pick legend={p.feature} options={p.options.map((o) => ({ id: o.id, label: o.name }))} value={draft.order}
        onpick={(id) => (draft.order = id)} />
    {:else if p.kind === 'invocations'}
      <PickMany legend="Eldritch Invocation" options={cls.invocations.filter((i) => !i.prerequisite).map((i) => ({ id: i.name, label: i.name }))}
        selected={draft.invocations} max={p.count} onchange={(v) => (draft.invocations = v)} />
    {/if}
  {/each}
{/if}
