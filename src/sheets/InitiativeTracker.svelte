<script lang="ts">
  // Initiative order floating over the table. Everyone sees it; GMs run turns and add monsters.
  import type { DiceDirector } from '../dice/director';
  import type { RulesetHost } from '../rulesets/host.svelte';
  import type { RoomStore } from '../sync/room.svelte';
  import type { InitRow } from '../sync/types';
  import type { Stage } from '../table/Stage';
  import type { Ui } from '../table/ui.svelte';
  import TwoStepButton from '../ui/TwoStepButton.svelte';
  import { nextTurn, ordered, prevTurn, type Turn } from './initiative';

  let { store, ui, host, dice, stage }: { store: RoomStore; ui: Ui; host: RulesetHost; dice: DiceDirector; stage: Stage } = $props();

  const order = $derived.by(() => {
    void store.initiativeVersion;
    return ordered([...store.state.initiative.rows.values()]);
  });
  const turn = $derived<Turn>(store.settings.initiative ?? { round: 1, current: null });
  let monster = $state('');
  let bonus = $state(0);
  let secret = $state(false);

  /** The token standing for an entry: its own item, or a token bound to its character. */
  function tokenOf(e: InitRow): string | null {
    if (e.item_id && store.item(e.item_id)) return e.item_id;
    if (!e.character_id) return null;
    void store.itemsVersion;
    return store.state.all().find((i) => i.kind === 'char' && (i.meta?.core as { characterId?: string } | undefined)?.characterId === e.character_id)?.id ?? null;
  }

  // Ring the token whose turn it is.
  $effect(() => {
    const cur = order.find((e) => e.id === turn.current);
    stage.setActiveTurn(cur ? tokenOf(cur) : null);
  });

  const setTurn = (t: Turn) => store.updateSettings({ ...store.settings, initiative: t });
  const mine = (e: InitRow) => {
    void store.charactersVersion;
    const c = e.character_id ? store.state.character(e.character_id) : undefined;
    return !!c && host.canEdit(c);
  };

  async function addMonster(e: SubmitEvent) {
    e.preventDefault();
    const name = monster.trim();
    if (!name) return;
    const b = Math.round(bonus) || 0;
    try {
      const r = await dice.roll(b ? `1d20${b > 0 ? '+' : ''}${b}` : '1d20', secret, `${name}: Initiative`);
      await store.addInit({ name: name.slice(0, 60), init: r.result.total, tie: b, hidden: secret });
      monster = '';
    } catch (err) {
      ui.showToast('เพิ่มไม่สำเร็จ', undefined, (err as Error).message);
    }
  }
</script>

{#if ui.initOpen || order.length}
  <section class="init-panel overlay-ui" aria-label="ลำดับการเล่น (Initiative)">
    <header>
      <h2>ลำดับ <small>รอบที่ {turn.round}</small></h2>
      {#if store.isGM}
        <button class="btn small" onclick={() => setTurn(prevTurn(order, turn))} aria-label="เทิร์นก่อนหน้า" disabled={!order.length}>‹</button>
        <button class="btn small primary" onclick={() => setTurn(nextTurn(order, turn))} disabled={!order.length}>เทิร์นถัดไป</button>
      {/if}
      <button class="btn small" onclick={() => (ui.initOpen = !ui.initOpen)} aria-expanded={ui.initOpen} aria-label={ui.initOpen ? 'ย่อ' : 'ขยาย'}>{ui.initOpen ? '–' : '+'}</button>
    </header>
    {#if ui.initOpen}
      <ol class="init-list">
        {#each order as e (e.id)}
          {@const tok = tokenOf(e)}
          <li class:current={e.id === turn.current} aria-current={e.id === turn.current ? 'true' : undefined}>
            <span class="score">{e.init}</span>
            <button class="pick" disabled={!tok} onclick={() => tok && (ui.select(tok), stage.centerOn(tok))}>
              {e.name}{e.hidden ? ' (ลับ)' : ''}
            </button>
            {#if store.isGM}
              <input type="number" aria-label={`ค่า initiative ของ ${e.name}`} value={e.init}
                onchange={(ev) => store.updateInit(e.id, { init: Math.round(+ev.currentTarget.value) || 0 })} />
            {/if}
            {#if store.isGM || mine(e)}
              <button class="btn small" aria-label={`เอา ${e.name} ออกจากลำดับ`} onclick={() => store.deleteInit(e.id)}>✕</button>
            {/if}
          </li>
        {:else}
          <li class="emptyline">ยังไม่มีใครในลำดับ เปิดชีทแล้วกด "ทอย Initiative เข้าลำดับ"</li>
        {/each}
      </ol>
      {#if store.isGM}
        <form class="row" onsubmit={addMonster}>
          <label class="field grow">มอนสเตอร์<input type="text" maxlength="60" bind:value={monster} placeholder="เช่น ก็อบลิน 1" /></label>
          <label class="field narrow">โบนัส<input type="number" bind:value={bonus} /></label>
          <label class="check"><input type="checkbox" bind:checked={secret} /> ลับ</label>
          <button class="btn small" type="submit" disabled={!monster.trim()}>ทอยเข้าลำดับ</button>
        </form>
        {#if order.length}
          <TwoStepButton label="ล้างลำดับ" onconfirm={() => { for (const e of order) void store.deleteInit(e.id); setTurn({ round: 1, current: null }); }} />
        {/if}
      {/if}
    {/if}
  </section>
{/if}
