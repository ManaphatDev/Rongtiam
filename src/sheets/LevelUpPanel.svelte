<script lang="ts">
  // Hosts a ruleset's level-up over the table: loads its component once, rolls dice for it and writes each level to
  // the sheet. It stays open, one level after another, until the character reaches the level it was opened for,
  // then shows the sheet again.
  import type { Component } from 'svelte';
  import type { DiceDirector } from '../dice/director';
  import type { LevelUpProps } from '../rulesets/core/types';
  import type { RulesetHost } from '../rulesets/host.svelte';
  import type { RoomStore } from '../sync/room.svelte';
  import type { CharOp, RollResult } from '../sync/types';
  import type { Ui } from '../table/ui.svelte';

  let { store, ui, host, dice }: { store: RoomStore; ui: Ui; host: RulesetHost; dice: DiceDirector } = $props();

  const c = $derived.by(() => {
    void store.charactersVersion;
    return ui.levelUpOpen ? store.state.character(ui.levelUpOpen) : undefined;
  });
  const level = $derived(Number(c?.data.level ?? 1));

  /** The level this visit goes to: what the GM allowed, or one more level when a GM opens it directly. */
  let target = $state(0);
  let targetFor = '';
  $effect(() => {
    if (!ui.levelUpOpen) {
      target = 0;
      targetFor = '';
    } else if (c && (target === 0 || targetFor !== ui.levelUpOpen)) {
      // Opened for another character without closing in between: work out its target afresh.
      targetFor = ui.levelUpOpen;
      const allowed = Number(c.data.levelAllowed ?? level);
      target = Math.min(20, store.isGM ? Math.max(allowed, level + 1) : allowed);
    }
  });
  // Done: back to the sheet. Gone (deleted, made secret): just close.
  $effect(() => {
    if (ui.levelUpOpen && c && target && level >= target) {
      ui.sheetOpen = c.id;
      ui.levelUpOpen = null;
    }
  });
  $effect(() => {
    if (ui.levelUpOpen && store.state.loaded && !c) ui.levelUpOpen = null;
  });
  // Opening a sheet puts the wizard away; its draft is kept for next time.
  $effect(() => {
    if (ui.sheetOpen && ui.levelUpOpen) ui.levelUpOpen = null;
  });

  // Loaded once into state (never inside {#await}), so data changes don't remount it and drop its focus.
  let LevelUp = $state<Component<LevelUpProps> | null>(null);
  let failed = $state(false);
  let attempt = $state(0);
  let loadedFor = '';
  $effect(() => {
    void attempt;
    const ruleset = c?.ruleset;
    if (!ui.levelUpOpen || !ruleset || loadedFor === ruleset) return;
    loadedFor = ruleset;
    LevelUp = null;
    failed = false;
    host.ensure(ruleset).then((m) => m?.LevelUp?.()).then(
      (C) => {
        if (loadedFor !== ruleset) return;
        if (C) LevelUp = C;
        else failed = true;
      },
      () => {
        if (loadedFor === ruleset) failed = true;
      },
    );
  });
  function retry() {
    loadedFor = '';
    attempt++;
  }

  function apply(ops: CharOp[]) {
    if (!c) return;
    for (const o of ops) store.patchCharacter(c.id, o.path, o.value);
  }
  async function rollDice(label: string, expr: string, onDecided?: (result: RollResult) => void): Promise<RollResult> {
    try {
      return (await dice.roll(expr, false, label, onDecided)).result;
    } catch (e) {
      ui.showToast('ทอยไม่สำเร็จ', undefined, (e as Error).message);
      throw e;
    }
  }
  const close = () => (ui.levelUpOpen = null);
</script>

{#if ui.levelUpOpen && c}
  {#if LevelUp}
    <!-- A fresh wizard for every level: its draft and steps belong to that level. -->
    {#key `${c.id}:${level}`}
      <LevelUp ctx={host.ctx} id={c.id} data={c.data} isGM={store.isGM} {rollDice} {apply} onClose={close} />
    {/key}
  {:else}
    <section class="sheet-panel overlay-ui" aria-label="ตัวช่วยขึ้นเลเวล">
      <header class="sheet-bar">
        <h2>ขึ้นเลเวล</h2>
        <button class="btn small" type="button" onclick={close}>ปิด</button>
      </header>
      <div class="sheet-body">
        {#if failed}
          <p class="hint err" role="alert">โหลดตัวช่วยขึ้นเลเวลไม่สำเร็จ</p>
          <button class="btn" type="button" onclick={retry}>ลองใหม่</button>
        {:else}
          <div class="spinner" role="status" aria-label="กำลังโหลด…"></div>
        {/if}
      </div>
    </section>
  {/if}
{/if}
