<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { RoomStore } from '../sync/room.svelte';
  import { DiceDirector } from '../dice/director';
  import { RulesetHost } from '../rulesets/host.svelte';
  import SheetPanel from '../sheets/SheetPanel.svelte';
  import InitiativeTracker from '../sheets/InitiativeTracker.svelte';
  import { critText } from '../dice/model';
  import { Stage } from './Stage';
  import { TableActions } from './actions';
  import type { Tab, Ui } from './ui.svelte';
  import SelectionPanel from './panels/SelectionPanel.svelte';
  import MapPane from './panels/MapPane.svelte';
  import FogPane from './panels/FogPane.svelte';
  import CharsPane from './panels/CharsPane.svelte';
  import StickersPane from './panels/StickersPane.svelte';
  import DicePane from './panels/DicePane.svelte';
  import PlayersPane from './panels/PlayersPane.svelte';
  import ThemeToggle from '../ui/ThemeToggle.svelte';

  let { store, ui, slug = 'local', gmKey = $bindable() }: { store: RoomStore; ui: Ui; slug?: string; gmKey?: string } = $props();

  let stageEl: HTMLElement, worldEl: HTMLElement, mapsEl: HTMLElement, itemsEl: HTMLElement, fogEl: HTMLElement, pingsEl: HTMLElement, gridEl: HTMLElement;
  let stage = $state<Stage | null>(null);
  let actions = $state<TableActions | null>(null);
  let dice = $state<DiceDirector | null>(null);
  const host = $derived(new RulesetHost(store));
  const unsub: (() => void)[] = [];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'map', label: 'แมพ' }, { id: 'chars', label: 'ตัวละคร' }, { id: 'stickers', label: 'สติกเกอร์' },
    { id: 'dice', label: 'ลูกเต๋า' }, { id: 'players', label: 'ผู้เล่น' },
  ];
  // Fog is the GM's tab, right after the map.
  const tabs = $derived(store.isGM ? [TABS[0], { id: 'fog' as Tab, label: 'หมอก' }, ...TABS.slice(1)] : TABS);

  /** Arrow keys, Home and End move between tabs (and select them), as the ARIA tabs pattern expects. */
  function tabKey(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === ui.tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    pickTab(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  }

  function pickTab(id: Tab) {
    ui.tab = id;
    // The fog tool belongs to the fog tab: going elsewhere goes back to picking things up.
    if (id === 'fog') ui.tool = 'fog';
    else if (ui.tool === 'fog') ui.tool = 'select';
  }
  function fogTool() {
    ui.tool = 'fog';
    ui.tab = 'fog';
  }

  const pending = $derived.by(() => {
    void store.membersVersion;
    return store.isGM ? [...store.state.members.values()].filter((m) => m.status === 'pending') : [];
  });
  const empty = $derived.by(() => {
    void store.itemsVersion;
    return store.state.loaded && store.state.ids().length === 0;
  });
  const roomName = $derived.by(() => {
    void store.roomVersion;
    return store.state.room?.name ?? '';
  });
  let dismissed = $state(new Set<string>());
  const toastText = $derived(ui.toast ? [ui.toast.t1, ui.toast.t2, ui.toast.t3].filter((x) => x !== undefined && x !== '').join(' ') : '');

  onMount(() => {
    const s = new Stage({ stage: stageEl, world: worldEl, maps: mapsEl, items: itemsEl, fog: fogEl, pings: pingsEl, grid: gridEl }, store, ui,
      (files, at) => actions?.routeFiles(files, at));
    stage = s;
    actions = new TableActions(store, s, ui);
    s.setStatusSource((it) => host.tokenStatus(it));
    unsub.push(host.onLoad(() => s.renderTokens()));

    const d = new DiceDirector(store, stageEl, (text) => ui.showToast(text));
    dice = d;
    d.prefetch();
    unsub.push(() => d.destroy());

    // Rolls by anyone pop up on the table for everyone, once their dice have landed.
    unsub.push(store.onRoll(async (r) => {
      await d.after(r.id);
      const who = store.state.members.get(r.user_id)?.display_name ?? '';
      ui.showToast(`${who} · ${r.label}${r.visibility === 'gm' ? ' (ลับ)' : ''}`, r.result.total, critText(r.result.crit) || r.result.breakdown);
    }));

    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        actions?.routeFiles(files);
      }
    };
    document.addEventListener('paste', onPaste);
    unsub.push(() => document.removeEventListener('paste', onPaste));
  });

  // Fit the view once the first snapshot arrives (unless this browser has a saved view for the room).
  let fitted = false;
  $effect(() => {
    void store.itemsVersion;
    if (!fitted && stage && store.state.loaded) {
      fitted = true;
      if (!localStorage.getItem(`view:${store.backend.roomId}`)) stage.fitView();
    }
  });

  $effect(() => {
    void ui.selectedId;
    stage?.refreshSelection();
  });

  // An unfinished polygon or stroke is dropped when the tool or shape type changes.
  $effect(() => {
    void ui.tool;
    void ui.fogTool;
    stage?.fogTool.cancel();
  });

  // Drawing fog works on fog shapes only, so a selected token or map is let go.
  $effect(() => {
    if (ui.tool !== 'fog' || !ui.selectedId) return;
    if (store.item(ui.selectedId)?.kind !== 'fog') ui.select(null);
  });

  // Hidden fog drawing tools make no sense for a demoted/non-GM viewer.
  $effect(() => {
    if (!store.isGM && ui.tool === 'fog') ui.tool = 'select';
  });

  onDestroy(() => {
    for (const u of unsub) u();
    stage?.destroy();
  });
</script>

<div class="app" class:noside={ui.sideHidden} class:notools={ui.toolsHidden}>
  <main class="stage" class:tool-select={ui.tool === 'select'} class:tool-hand={ui.tool === 'hand'} class:tool-ping={ui.tool === 'ping'}
    class:tool-fog={ui.tool === 'fog'} class:gmfog={store.isGM && !ui.playerView} class:playerview={store.isGM && ui.playerView}
    bind:this={stageEl} aria-label="โต๊ะเกม">
    <div class="tools" role="toolbar" aria-label="เครื่องมือเมาส์">
      <button class="tool" aria-pressed={ui.tool === 'select'} title="เลือก/หยิบ (กด 1 หรือ V)" onclick={() => (ui.tool = 'select')}>
        <svg viewBox="0 0 24 24"><path d="M5 3l14 7-6.2 2.2L10.5 19z" /></svg>เลือก
      </button>
      <button class="tool" aria-pressed={ui.tool === 'hand'} title="เลื่อนมุมมอง (กด 2 หรือกด Space ค้างไว้)" onclick={() => (ui.tool = 'hand')}>
        <svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>เลื่อนจอ
      </button>
      <button class="tool" aria-pressed={ui.tool === 'ping'} title="ชี้จุดให้เพื่อนดู (กด 3)" onclick={() => (ui.tool = 'ping')}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>ชี้จุด
      </button>
      {#if store.isGM}
        <button class="tool" aria-pressed={ui.tool === 'fog'} title="วาดหมอก (กด 4)" onclick={fogTool}>
          <svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 8.6 4.7 4.7 0 0 0 7 18zM4 21h16" /></svg>หมอก
        </button>
      {/if}
      <hr />
      <button class="tool" title="ซูมเข้า (+)" onclick={() => stage?.zoomCenter(1.3)}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>ซูม+
      </button>
      <button class="tool" title="ซูมออก (−)" onclick={() => stage?.zoomCenter(1 / 1.3)}>
        <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>ซูม−
      </button>
      <button class="tool" title="ปรับให้เห็นแมพทั้งหมด (F)" onclick={() => stage?.fitView()}>
        <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>พอดีจอ
      </button>
      <button class="tool" aria-pressed={ui.initOpen} title="ลำดับการเล่น (Initiative)" onclick={() => (ui.initOpen = !ui.initOpen)}>
        <svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>ลำดับ
      </button>
      {#if store.isGM}
        <button class="tool" title="พาผู้เล่นทุกคนมาดูตรงที่คุณกำลังดูอยู่ (ซูมและตำแหน่งเดียวกัน)" onclick={() => stage?.syncView()}>
          <svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>พาดู
        </button>
      {/if}
      <hr />
      <button class="tool" title="ซ่อน/แสดงแผงด้านข้าง" onclick={() => (ui.sideHidden = !ui.sideHidden)}>
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>ซ่อนแผง
      </button>
      <button class="tool" title="ซ่อนแถบเครื่องมือนี้ (กด T)" onclick={() => (ui.toolsHidden = true)}>
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>ซ่อนแถบ
      </button>
    </div>
    <div class="world" bind:this={worldEl}>
      <div class="layer" id="mapsLayer" bind:this={mapsEl}></div>
      <div id="gridEl" style="display:none" bind:this={gridEl}></div>
      <div class="layer" id="items" bind:this={itemsEl}></div>
      <div class="layer" id="fog" bind:this={fogEl}></div>
      <div class="layer" id="pings" bind:this={pingsEl}></div>
    </div>

    {#if empty}
      <div class="empty">
        <div>
          {#if store.isGM}
            <strong>วางแมพลงบนโต๊ะ</strong>
            ลากรูปมาวางตรงนี้ หรือเปิดแท็บ "แมพ" แล้วกด "เพิ่มแมพ" ใช้ภาพอะไรก็ได้ และเพิ่มหลายแผ่นมาต่อกันได้
          {:else}
            <strong>รอ GM วางแมพ</strong>
            ระหว่างนี้เพิ่มตัวละครของคุณได้ที่แท็บ "ตัวละคร"
          {/if}
        </div>
      </div>
    {/if}
    <div class="dropveil"></div>

    <div class="sr-only" role="status">{toastText}</div>
    {#if ui.toast}
      {#key ui.toast.id}
        <div class="toast" aria-hidden="true">
          {#if ui.toast.t1}<div class="t1">{ui.toast.t1}</div>{/if}
          {#if ui.toast.t2 !== undefined}<div class="t2">{ui.toast.t2}</div>{/if}
          {#if ui.toast.t3}<div class="t3">{ui.toast.t3}</div>{/if}
        </div>
      {/key}
    {/if}

    {#if pending.some((m) => !dismissed.has(m.user_id))}
      <div class="requests overlay-ui" aria-live="polite">
        {#each pending.filter((m) => !dismissed.has(m.user_id)) as m (m.user_id)}
          <div class="request">
            <span><b style:color={m.color}>●</b> <b>{m.display_name}</b> ขอเข้าห้อง</span>
            <div class="row">
              <button class="btn small primary" onclick={() => store.member(m.user_id, { status: 'approved' })}>รับเข้าห้อง</button>
              <button class="btn small" onclick={() => store.kick(m.user_id)}>ไม่รับ</button>
              <button class="btn small" onclick={() => (dismissed = new Set([...dismissed, m.user_id]))} aria-label="ไว้ทีหลัง">ไว้ทีหลัง</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if store.status === 'offline'}
      <div class="banner" role="status">การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…</div>
    {/if}

    {#if dice}<SheetPanel {store} {ui} {host} {dice} />{/if}
    {#if ui.templateOpen && store.isGM}
      {#await import('../rulesets/custom/TemplateEditor.svelte') then { default: TemplateEditor }}
        <TemplateEditor {store} ctx={host.ctx} onclose={() => (ui.templateOpen = false)} />
      {/await}
    {/if}
    {#if dice && stage}<InitiativeTracker {store} {ui} {host} {dice} {stage} />{/if}
    <button class="showui" onclick={() => { ui.sideHidden = false; ui.toolsHidden = false; }}>แสดงแผงและเครื่องมือ</button>
  </main>

  <aside class="side">
    <div class="brand">
      <h1>{roomName || 'โรงเตี๊ยม'}</h1>
      <ThemeToggle />
      <small class={`conn ${store.status}`}><i></i>{store.status === 'live' ? `ออนไลน์ ${store.online.length} คน` : store.status === 'offline' ? 'ออฟไลน์' : 'กำลังเชื่อมต่อ'}</small>
    </div>
    <div class="tabs" class:five={tabs.length === 5} class:six={tabs.length === 6} role="tablist" aria-label="เมนู" tabindex="-1" onkeydown={tabKey}>
      {#each tabs as t (t.id)}
        <button class="tab" role="tab" id={`tab-${t.id}`} aria-selected={ui.tab === t.id} aria-controls="tabpanel"
          tabindex={ui.tab === t.id ? 0 : -1} onclick={() => pickTab(t.id)}>
          {t.label}{#if t.id === 'players' && pending.length}<span class="badge">{pending.length}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="side-body">
      {#if stage && actions}
        <SelectionPanel {store} {ui} {stage} {actions} {host} />
        <div class="pane on" role="tabpanel" id="tabpanel" aria-labelledby={`tab-${ui.tab}`}>
          {#if ui.tab === 'map'}<MapPane {store} {ui} {stage} {actions} />
          {:else if ui.tab === 'fog' && store.isGM}<FogPane {store} {ui} {stage} />
          {:else if ui.tab === 'chars'}<CharsPane {store} {ui} {stage} {actions} {host} />
          {:else if ui.tab === 'stickers'}<StickersPane {store} {actions} />
          {:else if ui.tab === 'dice'}{#if dice}<DicePane {store} {dice} />{/if}
          {:else}<PlayersPane {store} {ui} {slug} bind:gmKey />{/if}
        </div>
      {/if}
    </div>
  </aside>
</div>
