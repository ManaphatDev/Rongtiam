<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { ABILITIES, ABILITY_TH, type Ability } from '../../i18n/th';
  import { POINT_BUY_BUDGET, pointBuySpent, pointBuyStart, pointCost, poolOf, type Scores } from '../abilities';
  import type { Draft } from '../draft';
  import { finalAbilities } from '../helpers';
  import Pick from './Pick.svelte';

  let { draft = $bindable(), srd, rolling, onroll }: { draft: Draft; srd: Srd; rolling: boolean; onroll: () => void } = $props();

  const METHODS = [
    { id: 'array', label: 'ชุดมาตรฐาน', hint: '15, 14, 13, 12, 10, 8' },
    { id: 'pointbuy', label: 'Point Buy', hint: `${POINT_BUY_BUDGET} แต้ม` },
    { id: 'roll', label: 'ทอยเต๋า', hint: '4d6 ทิ้งลูกต่ำสุด ×6' },
  ];
  const method = $derived(draft.scores.method);
  const pool = $derived(poolOf(method, draft.rolled));
  const spent = $derived(pointBuySpent(draft.scores.base));
  const final = $derived(finalAbilities(draft, srd));
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const modOf = (score: number) => Math.floor((score - 10) / 2);

  // Switching method clears the assignment; the rolled totals stay (so switching can't buy a re-roll).
  function setMethod(id: string) {
    draft.scores = { method: id as Scores['method'], assign: {}, base: pointBuyStart() };
  }
  function assign(a: Ability, value: string) {
    const next = { ...draft.scores.assign };
    if (value === '') delete next[a];
    else next[a] = Number(value);
    draft.scores = { ...draft.scores, assign: next };
  }
  const usedElsewhere = (a: Ability, i: number) => ABILITIES.some((b) => b !== a && draft.scores.assign[b] === i);

  function step(a: Ability, delta: number) {
    const v = draft.scores.base[a] + delta;
    if (pointCost(v) === null) return;
    const base = { ...draft.scores.base, [a]: v };
    if (pointBuySpent(base) > POINT_BUY_BUDGET) return;
    draft.scores = { ...draft.scores, base };
  }
  const canRaise = (a: Ability) => {
    const v = draft.scores.base[a];
    return v < 15 && spent - (pointCost(v) ?? 0) + (pointCost(v + 1) ?? 0) <= POINT_BUY_BUDGET;
  };
</script>

<Pick legend="วิธีกำหนดค่าพลัง" options={METHODS} value={method} onpick={setMethod} />

{#if method === 'roll' && !draft.rolled}
  <button class="btn primary" type="button" disabled={rolling} onclick={onroll}>
    {rolling ? 'กำลังทอย…' : 'ทอยค่าพลัง (4d6 ทิ้งลูกต่ำสุด ×6)'}
  </button>
  <p class="hint">ทอยได้ครั้งเดียว ผลทอยจะบันทึกไว้ในร่างทันที</p>
{:else if method === 'pointbuy'}
  <p class="hint" aria-live="polite">ใช้ไป {spent} จาก {POINT_BUY_BUDGET} แต้ม</p>
  {#each ABILITIES as a (a)}
    <div class="point-row">
      <span class="nm">{ABILITY_TH[a].name}</span>
      <button type="button" class="btn" aria-label={`ลด${ABILITY_TH[a].name}`} disabled={draft.scores.base[a] <= 8} onclick={() => step(a, -1)}>−</button>
      <b>{draft.scores.base[a]}</b>
      <button type="button" class="btn" aria-label={`เพิ่ม${ABILITY_TH[a].name}`} disabled={!canRaise(a)} onclick={() => step(a, 1)}>+</button>
    </div>
  {/each}
{:else if pool}
  {#if method === 'roll'}<p class="hint">ผลทอย: {pool.join(', ')}</p>{/if}
  <div class="custom-fields">
    {#each ABILITIES as a (a)}
      <label class="field">{ABILITY_TH[a].name}
        <select aria-label={ABILITY_TH[a].name} value={draft.scores.assign[a] ?? ''} onchange={(e) => assign(a, e.currentTarget.value)}>
          <option value="">—</option>
          {#each pool as v, i (i)}<option value={i} disabled={usedElsewhere(a, i)}>{v}</option>{/each}
        </select>
      </label>
    {/each}
  </div>
{/if}

{#if final}
  <section class="stat-row" aria-label="ค่าพลังหลังบวกจากฉากหลัง">
    {#each ABILITIES as a (a)}
      <div class="stat"><span>{ABILITY_TH[a].short}</span><b>{final[a]}</b><small>{signed(modOf(final[a]))}</small></div>
    {/each}
  </section>
{/if}
