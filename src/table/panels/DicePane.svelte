<script lang="ts">
  import type { DiceDirector } from '../../dice/director';
  import { critText, DiceError, quick, type Sides } from '../../dice/model';
  import type { RoomStore } from '../../sync/room.svelte';

  let { store, dice }: { store: RoomStore; dice: DiceDirector } = $props();

  let count = $state(1);
  let mod = $state(0);
  let adv = $state<'normal' | 'adv' | 'dis'>('normal');
  let secret = $state(false);
  let expr = $state('');
  let error = $state('');
  let busy = $state(false);
  let exprInput = $state<HTMLInputElement>();
  let shown = $state<{ big: string | number; sub?: string; crit?: string } | null>(null);

  const log = $derived.by(() => {
    void store.rollsVersion;
    void store.membersVersion;
    return [...store.state.rolls].reverse().slice(0, 30).map((r) => ({
      ...r, who: store.state.members.get(r.user_id)?.display_name ?? '—', color: store.state.members.get(r.user_id)?.color,
    }));
  });

  async function roll(text: string) {
    if (busy) return;
    error = '';
    busy = true;
    shown = { big: '…', sub: 'กำลังทอย' };
    try {
      const r = await dice.roll(text, secret && store.isGM);
      shown = { big: r.result.total, sub: `${r.label}: ${r.result.breakdown}`, crit: critText(r.result.crit) };
    } catch (e) {
      shown = null;
      error = e instanceof DiceError ? e.message : 'ทอยไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่';
      // Focus the field so its error (described below it) is read out and can be fixed right away.
      if (e instanceof DiceError) exprInput?.focus();
    } finally {
      busy = false;
    }
  }
</script>

<div class="group">
  <h2>ทอยลูกเต๋า</h2>
  <div class="dice-grid">
    {#each [4, 6, 8, 10, 12, 20, 100] as n (n)}
      <button class="btn" disabled={busy} onclick={() => roll(quick(n as Sides, count, mod, adv))}>d{n}</button>
    {/each}
  </div>
  <div class="row">
    <label class="field">จำนวนลูก<input type="number" bind:value={count} min="1" max="24" /></label>
    <label class="field">โบนัสบวก/ลบ<input type="number" bind:value={mod} min="-20" max="40" /></label>
  </div>
  <div class="seg" role="group" aria-label="โหมด d20">
    <button aria-pressed={adv === 'normal'} onclick={() => (adv = 'normal')}>ปกติ</button>
    <button aria-pressed={adv === 'adv'} onclick={() => (adv = 'adv')}>ได้เปรียบ</button>
    <button aria-pressed={adv === 'dis'} onclick={() => (adv = 'dis')}>เสียเปรียบ</button>
  </div>
  <label class="field" for="dice-expr">สูตรการทอย</label>
  <form class="linkbox" onsubmit={(e) => { e.preventDefault(); if (expr.trim()) void roll(expr); }}>
    <input id="dice-expr" type="text" bind:value={expr} bind:this={exprInput} placeholder="เช่น 2d6+3, 4d6kh3, d100" maxlength="80"
      autocomplete="off" aria-invalid={error ? 'true' : undefined} aria-describedby="dice-err" />
    <button class="btn small primary" type="submit" disabled={busy || !expr.trim()}>ทอย</button>
  </form>
  <p class="hint err" id="dice-err" aria-live="polite">{error}</p>
  {#if store.isGM}
    <label class="check"><input type="checkbox" bind:checked={secret} /> ทอยลับ (ผู้เล่นเห็นแค่ว่า GM ทอย)</label>
  {/if}
  <p class="hint">ลูกเต๋าทอยจริงบนโต๊ะให้ทุกคนเห็นพร้อมกัน ได้เปรียบ/เสียเปรียบใช้กับ d20 เท่านั้น
    สูตร: <b>kh</b> เก็บลูกสูง <b>kl</b> เก็บลูกต่ำ เช่น 2d20kh1 คือได้เปรียบ</p>
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
