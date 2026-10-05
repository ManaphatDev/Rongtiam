<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { RoomStore } from '../sync/room.svelte';
  import { critText } from '../dice/basic';
  import { Stage } from './Stage';
  import { TableActions } from './actions';
  import type { Tab, Ui } from './ui.svelte';
  import SelectionPanel from './panels/SelectionPanel.svelte';
  import MapPane from './panels/MapPane.svelte';
  import CharsPane from './panels/CharsPane.svelte';
  import StickersPane from './panels/StickersPane.svelte';
  import DicePane from './panels/DicePane.svelte';
  import PlayersPane from './panels/PlayersPane.svelte';

  let { store, ui, slug = 'local', gmKey = $bindable() }: { store: RoomStore; ui: Ui; slug?: string; gmKey?: string } = $props();

  let stageEl: HTMLElement, worldEl: HTMLElement, mapsEl: HTMLElement, itemsEl: HTMLElement, pingsEl: HTMLElement, gridEl: HTMLElement;
  let stage = $state<Stage | null>(null);
  let actions = $state<TableActions | null>(null);
  const unsub: (() => void)[] = [];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'map', label: 'แมพ' }, { id: 'chars', label: 'ตัวละคร' }, { id: 'stickers', label: 'สติกเกอร์' },
    { id: 'dice', label: 'ลูกเต๋า' }, { id: 'players', label: 'ผู้เล่น' },
  ];

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

  onMount(() => {
    const s = new Stage({ stage: stageEl, world: worldEl, maps: mapsEl, items: itemsEl, pings: pingsEl, grid: gridEl }, store, ui,
      (files, at) => actions?.routeFiles(files, at));
    stage = s;
    actions = new TableActions(store, s, ui);

    // Rolls by anyone pop up on the table for everyone.
    unsub.push(store.onRoll((r) => {
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

  onDestroy(() => {
    for (const u of unsub) u();
    stage?.destroy();
  });
</script>

<div class="app" class:noside={ui.sideHidden} class:notools={ui.toolsHidden}>
  <main class="stage" class:tool-select={ui.tool === 'select'} class:tool-hand={ui.tool === 'hand'} class:tool-ping={ui.tool === 'ping'}
    bind:this={stageEl} aria-label="โต๊ะเกม">
    <div class="world" bind:this={worldEl}>
      <div class="layer" id="mapsLayer" bind:this={mapsEl}></div>
      <div id="gridEl" style="display:none" bind:this={gridEl}></div>
      <div class="layer" id="items" bind:this={itemsEl}></div>
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

    {#if ui.toast}
      {#key ui.toast.id}
        <div class="toast" role="status">
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
      <hr />
      <button class="tool" title="ซ่อน/แสดงแผงด้านข้าง" onclick={() => (ui.sideHidden = !ui.sideHidden)}>
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>ซ่อนแผง
      </button>
      <button class="tool" title="ซ่อนแถบเครื่องมือนี้ (กด T)" onclick={() => (ui.toolsHidden = true)}>
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>ซ่อนแถบ
      </button>
    </div>
    <button class="showui" onclick={() => { ui.sideHidden = false; ui.toolsHidden = false; }}>แสดงแผงและเครื่องมือ</button>
  </main>

  <aside class="side">
    <div class="brand">
      <h1>{roomName || 'โรงเตี๊ยม'}</h1>
      <small class={`conn ${store.status}`}><i></i>{store.status === 'live' ? `ออนไลน์ ${store.online.length} คน` : store.status === 'offline' ? 'ออฟไลน์' : 'กำลังเชื่อมต่อ'}</small>
    </div>
    <div class="tabs five" role="tablist" aria-label="เมนู">
      {#each TABS as t (t.id)}
        <button class="tab" role="tab" aria-selected={ui.tab === t.id} onclick={() => (ui.tab = t.id)}>
          {t.label}{#if t.id === 'players' && pending.length}<span class="badge">{pending.length}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="side-body">
      {#if stage && actions}
        <SelectionPanel {store} {ui} {stage} {actions} />
        <section class="pane on">
          {#if ui.tab === 'map'}<MapPane {store} {ui} {stage} {actions} />
          {:else if ui.tab === 'chars'}<CharsPane {store} {ui} {stage} {actions} />
          {:else if ui.tab === 'stickers'}<StickersPane {store} {actions} />
          {:else if ui.tab === 'dice'}<DicePane {store} />
          {:else}<PlayersPane {store} {ui} {slug} bind:gmKey />{/if}
        </section>
      {/if}
    </div>
  </aside>
</div>
