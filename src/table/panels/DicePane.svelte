<script lang="ts">
  import { critText, rollBasic, type Adv } from '../../dice/basic';
  import { rand } from '../../lib/rand';
  import type { RoomStore } from '../../sync/room.svelte';

  let { store }: { store: RoomStore } = $props();

  let count = $state(1);
  let mod = $state(0);
  let adv = $state<Adv>('normal');
  let secret = $state(false);
  let shown = $state<{ big: string | number; sub?: string; crit?: string } | null>(null);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const log = $derived.by(() => {
    void store.rollsVersion;
    void store.membersVersion;
    return [...store.state.rolls].reverse().slice(0, 30).map((r) => ({
      ...r, who: store.state.members.get(r.user_id)?.display_name ?? '—', color: store.state.members.get(r.user_id)?.color,
    }));
  });

  function roll(sides: number) {
    const r = rollBasic(sides, count, mod, adv);
    const finish = () => {
      shown = { big: r.result.total, sub: `${r.label}: ${r.result.breakdown}`, crit: critText(r.result.crit) };
      void store.roll({ label: r.label, spec: r.spec, result: r.result, visibility: secret && store.isGM ? 'gm' : 'all' });
    };
    if (reduce) return finish();
    let n = 0;
    const iv = setInterval(() => {
      shown = { big: rand(Math.max(sides, 6)) };
      if (++n >= 9) {
        clearInterval(iv);
        finish();
      }
    }, 55);
  }
</script>

<div class="group">
  <h2>ทอยลูกเต๋า</h2>
  <div class="dice-grid">
    {#each [4, 6, 8, 10, 12, 20, 100] as n (n)}
      <button class="btn" onclick={() => roll(n)}>d{n}</button>
    {/each}
  </div>
  <div class="row">
    <label class="field">จำนวนลูก<input type="number" bind:value={count} min="1" max="20" /></label>
    <label class="field">โบนัสบวก/ลบ<input type="number" bind:value={mod} min="-20" max="40" /></label>
  </div>
  <div class="seg" role="group" aria-label="โหมด d20">
    <button aria-pressed={adv === 'normal'} onclick={() => (adv = 'normal')}>ปกติ</button>
    <button aria-pressed={adv === 'adv'} onclick={() => (adv = 'adv')}>ได้เปรียบ</button>
    <button aria-pressed={adv === 'dis'} onclick={() => (adv = 'dis')}>เสียเปรียบ</button>
  </div>
  {#if store.isGM}
    <label class="check"><input type="checkbox" bind:checked={secret} /> ทอยลับ (ผู้เล่นไม่เห็นผล)</label>
  {/if}
  <p class="hint">ได้เปรียบ/เสียเปรียบใช้กับ d20 เท่านั้น ผลทอยจะเด้งขึ้นกลางโต๊ะให้ทุกคนเห็นด้วย</p>
</div>
<div class="result" aria-live="polite">
  {#if shown}
    <div class="big">{shown.big}</div>
    {#if shown.sub}<div class="sub">{shown.sub}</div>{/if}
    {#if shown.crit}<div class="crit">{shown.crit}</div>{/if}
  {:else}
    <span class="sub">กดเลือกลูกเต๋าเพื่อทอย</span>
  {/if}
</div>
<div class="group">
  <h2>ประวัติการทอยของห้อง</h2>
  <ul class="log">
    {#each log as r (r.id)}
      <li><span><span style:color={r.color}>●</span> {r.who}: {r.label}{r.visibility === 'gm' ? ' (ลับ)' : ''}</span><b>{r.result.total}</b></li>
    {:else}
      <li class="emptyline">ยังไม่มีใครทอย</li>
    {/each}
  </ul>
</div>
