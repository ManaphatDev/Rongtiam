<script lang="ts">
  // Hosts a ruleset's character builder over the table: loads its component once, rolls dice for it, and creates
  // the finished character.
  import type { Component } from 'svelte';
  import type { DiceDirector } from '../dice/director';
  import type { BuilderProps } from '../rulesets/core/types';
  import type { RulesetHost } from '../rulesets/host.svelte';
  import type { RoomStore } from '../sync/room.svelte';
  import type { RollResult } from '../sync/types';
  import type { Ui } from '../table/ui.svelte';

  let { store, ui, host, dice }: { store: RoomStore; ui: Ui; host: RulesetHost; dice: DiceDirector } = $props();

  // Loaded once into state (never inside {#await}), so data changes don't remount the builder and drop its focus.
  let Builder = $state<Component<BuilderProps> | null>(null);
  let failed = $state(false);
  let loadedFor = '';
  let attempt = $state(0); // bumped by "ลองใหม่" to load again after a failure
  $effect(() => {
    void attempt;
    if (!ui.builderOpen) return;
    const id = host.roomRuleset;
    if (loadedFor === id) return;
    loadedFor = id;
    Builder = null;
    failed = false;
    host.ensure(id).then((m) => m?.Builder?.()).then(
      (C) => {
        if (loadedFor !== id) return;
        if (C) Builder = C;
        else failed = true;
      },
      () => {
        if (loadedFor === id) failed = true;
      },
    );
  });
  // Opening a sheet puts the builder away; its draft is kept for next time.
  $effect(() => {
    if (ui.sheetOpen) ui.builderOpen = false;
  });

  async function rollDice(label: string, expr: string, onDecided?: (result: RollResult) => void): Promise<RollResult> {
    try {
      return (await dice.roll(expr, false, label, onDecided)).result;
    } catch (e) {
      ui.showToast('ทอยไม่สำเร็จ', undefined, (e as Error).message);
      throw e;
    }
  }

  function retry() {
    loadedFor = '';
    attempt++;
  }

  /** Creates the character; true when it was made (the builder then clears its draft). */
  async function done(data: Record<string, unknown>) {
    const ruleset = host.roomRuleset; // read before the await
    const row = await store.createCharacter({ ruleset, data });
    if (!row) return false;
    ui.builderOpen = false;
    ui.sheetOpen = row.id;
    return true;
  }
</script>

{#if ui.builderOpen}
  {#if Builder}
    <Builder ctx={host.ctx} roomId={store.state.room?.id ?? 'local'} {rollDice} onDone={done} onClose={() => (ui.builderOpen = false)} />
  {:else}
    <section class="sheet-panel overlay-ui" aria-label="ตัวช่วยสร้างตัวละคร">
      <header class="sheet-bar">
        <h2>สร้างตัวละคร D&amp;D</h2>
        <button class="btn small" type="button" onclick={() => (ui.builderOpen = false)}>ปิด</button>
      </header>
      <div class="sheet-body">
        {#if failed}
          <p class="hint err" role="alert">โหลดตัวช่วยสร้างไม่สำเร็จ</p>
          <button class="btn" type="button" onclick={retry}>ลองใหม่</button>
        {:else}
          <div class="spinner" role="status" aria-label="กำลังโหลด…"></div>
        {/if}
      </div>
    </section>
  {/if}
{/if}
