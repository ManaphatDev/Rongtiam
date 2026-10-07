<script lang="ts">
  // The open character sheet, docked over the right of the table so dice rolled from it stay visible.
  import type { Component } from 'svelte';
  import type { DiceDirector } from '../dice/director';
  import type { RulesetHost } from '../rulesets/host.svelte';
  import type { SheetProps } from '../rulesets/core/types';
  import type { RoomStore } from '../sync/room.svelte';
  import type { Ui } from '../table/ui.svelte';
  import TwoStepButton from '../ui/TwoStepButton.svelte';
  import { fileName, toFile } from './transfer';

  let { store, ui, host, dice }: { store: RoomStore; ui: Ui; host: RulesetHost; dice: DiceDirector } = $props();

  const c = $derived.by(() => {
    void store.charactersVersion;
    return ui.sheetOpen ? store.state.character(ui.sheetOpen) : undefined;
  });
  const mod = $derived(c ? host.module(c.ruleset) : null);
  const ctx = $derived(host.ctx);
  const editable = $derived(!!c && host.canEdit(c));
  const name = $derived(c && mod ? mod.nameOf(c.data) : '');
  const members = $derived.by(() => {
    void store.membersVersion;
    return [...store.state.members.values()].filter((m) => m.status === 'approved');
  });

  // The sheet component loads once per ruleset and is kept in state, so data changes re-render it in place
  // (re-creating it would drop focus mid-typing and reset pickers).
  let Sheet = $state<Component<SheetProps> | null>(null);
  let sheetError = $state(false);
  let loadedFor = '';
  $effect(() => {
    const id = c?.ruleset;
    if (!id || !mod || loadedFor === id) return;
    loadedFor = id;
    Sheet = null;
    sheetError = false;
    mod.Sheet().then((C) => { if (loadedFor === id) Sheet = C; }, () => (sheetError = true));
  });

  let amount = $state(5);
  let panel = $state<HTMLElement>();
  let busy = $state(false);

  // Close if the character disappears (deleted, or made secret for a player).
  $effect(() => {
    if (ui.sheetOpen && store.state.loaded && !c) ui.sheetOpen = null;
  });
  // Move focus into the panel when a sheet opens, so keyboard users land in it.
  $effect(() => {
    if (ui.sheetOpen && panel) panel.focus();
  });

  function patch(path: (string | number)[], value: unknown, delay = 0) {
    if (c) store.patchCharacter(c.id, path, value, delay);
  }
  function apply(ops: { path: (string | number)[]; value: unknown }[]) {
    for (const o of ops) patch(o.path, o.value);
  }
  function roll(label: string, expr: string) {
    void dice.roll(expr, false, `${name}: ${label}`).catch((e) => ui.showToast('ทอยไม่สำเร็จ', undefined, (e as Error).message));
  }

  /** Rolls initiative and puts (or updates) this character in the order. */
  async function joinInitiative() {
    if (!c || !mod || busy) return;
    // Captured up front: the sheet may be closed (c gone) while the dice are still rolling.
    const { id, data } = c;
    const who = name;
    busy = true;
    try {
      const { expr, tie } = mod.initiative(data, ctx);
      const r = await dice.roll(expr, false, `${who}: Initiative`);
      const mine = [...store.state.initiative.rows.values()].find((e) => e.character_id === id);
      if (mine) await store.updateInit(mine.id, { init: r.result.total, tie, name: who });
      else await store.addInit({ name: who, init: r.result.total, tie, character_id: id });
    } catch (e) {
      ui.showToast('เข้าลำดับไม่สำเร็จ', undefined, (e as Error).message);
    } finally {
      busy = false;
    }
  }

  function download() {
    if (!c) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(toFile(c), null, 1)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName(name) });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      ui.sheetOpen = null;
    }
  }
</script>

{#if c}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="sheet-panel overlay-ui" aria-label={`ชีทของ ${name}`} tabindex="-1" bind:this={panel} onkeydown={onKey}>
    <header class="sheet-bar">
      <h2>{name || 'ตัวละคร'}{c.visibility === 'gm' ? ' (ลับ)' : ''}</h2>
      <button class="btn small" onclick={() => (ui.sheetOpen = null)} aria-label="ปิดชีท">ปิด</button>
    </header>

    {#if !mod}
      <div class="sheet-body"><div class="spinner" role="status" aria-label="กำลังโหลดชีท"></div></div>
    {:else}
      <div class="sheet-body">
        <section class="block quick" aria-label="ใช้ระหว่างเล่น">
          {#if editable}
            <div class="row">
              <label class="field narrow">จำนวน<input type="number" min="0" max="999" bind:value={amount} /></label>
              <button class="btn small" onclick={() => apply(mod.applyHp(c.data, -Math.abs(amount || 0), ctx))}>รับความเสียหาย</button>
              <button class="btn small" onclick={() => apply(mod.applyHp(c.data, Math.abs(amount || 0), ctx))}>ฟื้น HP</button>
              <button class="btn small primary" disabled={busy} onclick={joinInitiative}>ทอย Initiative เข้าลำดับ</button>
            </div>
          {/if}
          <div class="chips" role="group" aria-label="สถานะ">
            {#each mod.conditions(ctx) as cond (cond.key)}
              {@const on = mod.activeConditions(c.data).includes(cond.key)}
              <button class="chip" aria-pressed={on} disabled={!editable} onclick={() => apply(mod.toggleCondition(c.data, cond.key))}>
                <span aria-hidden="true">{cond.icon}</span> {cond.label}
              </button>
            {/each}
          </div>
        </section>

        {#if sheetError}
          <p class="hint err">โหลดชีทไม่สำเร็จ ลองรีเฟรชหน้า</p>
        {:else if Sheet}
          <!-- A different character gets a fresh sheet (its own pickers and open sections). -->
          {#key c.id}<Sheet data={c.data} {ctx} {editable} isGM={store.isGM} {patch} {roll} />{/key}
        {:else}
          <div class="spinner" role="status" aria-label="กำลังโหลดชีท"></div>
        {/if}
      </div>
    {/if}

    <footer class="sheet-bar">
      <button class="btn small" onclick={download}>ส่งออกเป็นไฟล์</button>
      {#if store.isGM}
        <label class="check"><input type="checkbox" checked={c.visibility === 'gm'}
          onchange={(e) => store.updateCharacter(c.id, { visibility: e.currentTarget.checked ? 'gm' : 'party' })} /> ลับ (เฉพาะ GM)</label>
        <label class="field narrow">เจ้าของ<select aria-label="เจ้าของ" value={c.owner_id ?? ''} onchange={(e) => store.updateCharacter(c.id, { owner_id: e.currentTarget.value || null })}>
          <option value="">ไม่มี (NPC)</option>
          {#each members as m (m.user_id)}<option value={m.user_id}>{m.display_name}</option>{/each}
        </select></label>
      {/if}
      {#if editable}
        <TwoStepButton label="ลบตัวละคร" onconfirm={() => { void store.deleteCharacter(c.id); ui.sheetOpen = null; }} />
      {/if}
    </footer>
  </section>
{/if}
