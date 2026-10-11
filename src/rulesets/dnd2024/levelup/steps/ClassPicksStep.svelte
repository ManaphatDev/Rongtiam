<script lang="ts">
  import Pick from '../../builder/steps/Pick.svelte';
  import PickMany from '../../builder/steps/PickMany.svelte';
  import type { Srd } from '../../data/schema';
  import { SKILLS, type Skill } from '../../i18n/th';
  import type { D2024 } from '../../model';
  import type { LevelDraft } from '../draft';
  import {
    classOfChar, classPicks, expertisePool, fightingStylePool, invocationPool, label, masteryPool, metamagicPool,
  } from '../steps';
  import { needed } from '../validate';

  let { draft = $bindable(), c, srd }: { draft: LevelDraft; c: D2024; srd: Srd } = $props();

  const next = $derived(c.level + 1);
  const p = $derived(classPicks(c, srd, next));
  const opts = (ids: string[], name: (id: string) => string) => ids.map((id) => ({ id, label: name(id) }));
  const weapon = (k: string) => srd.weapons.find((w) => w.key === k)?.name ?? k;
  const feat = (k: string) => srd.feats.find((f) => f.key === k)?.name ?? k;
  const invHint = (n: string) => classOfChar(c, srd)?.invocations.find((i) => i.name === n)?.prerequisite ?? undefined;
</script>

{#if p.expertise}
  {@const pool = expertisePool(c, p.expertiseFrom)}
  {#if pool.length}
    <PickMany legend="Expertise (เชี่ยวชาญสกิล)" max={needed(p.expertise, pool)} selected={draft.expertise}
      options={opts(pool, (s) => SKILLS[s as Skill]?.th ?? s)} onchange={(v) => (draft.expertise = v)} />
  {:else}
    <p class="hint">ไม่มีสกิลที่ชำนาญและยังไม่เชี่ยวชาญให้เลือก Expertise</p>
  {/if}
{/if}
{#if p.fightingStyle && fightingStylePool(c, srd).length}
  <Pick legend="Fighting Style" value={draft.fightingStyle} options={opts(fightingStylePool(c, srd), feat)}
    onpick={(k) => (draft.fightingStyle = k)} />
{/if}
{#if p.metamagic}
  {@const pool = metamagicPool(c, srd)}
  <PickMany legend="Metamagic" max={needed(p.metamagic, pool)} selected={draft.metamagic} options={opts(pool, (m) => m)}
    onchange={(v) => (draft.metamagic = v)} />
{/if}
{#if p.masteries}
  {@const pool = masteryPool(c, srd, p.masteryFilter)}
  <PickMany legend="Weapon Mastery (อาวุธเพิ่ม)" max={needed(p.masteries, pool)} selected={draft.masteries}
    options={opts(pool, weapon)} onchange={(v) => (draft.masteries = v)} />
{/if}
{#if p.invocations}
  {@const pool = invocationPool(c, srd, next)}
  <PickMany legend="Eldritch Invocation (เพิ่ม)" max={needed(p.invocations, pool)} selected={draft.invocations}
    options={pool.map((n) => ({ id: n, label: label(n), hint: invHint(n) }))} onchange={(v) => (draft.invocations = v)} />
{/if}
