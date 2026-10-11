<script lang="ts">
  // The GM's homebrew: one tab per kind, a list with add/edit/delete, a form per entry, and file export/import.
  // Each entry is one room_content row; saving validates it with the same zod the readers use.
  import type { RulesetContext } from '../../core/types';
  import type { RoomStore } from '../../../sync/room.svelte';
  import TwoStepButton from '../../../ui/TwoStepButton.svelte';
  import { BLANK, FIELDS, KIND_LABEL } from './fields';
  import { fromHbText, HbFileError, MAX_FILE_BYTES, planImport, toHbFile, type ImportPlan } from './file';
  import HbForm from './HbForm.svelte';
  import { HB_KINDS, HB_SCHEMAS, kindOfRow, MAX_PER_KIND, rowKind, slugKey, type HbKind } from './kinds';
  import { brokenRows, srdFor } from './merge';
  import { getSrd } from '../index';
  import { usageCount } from './usage';

  let { store, ctx, onclose }: { store: RoomStore; ctx: RulesetContext; onclose: () => void } = $props();

  let tab = $state<HbKind>('weapon');
  /** The entry being edited: its row id (null = new), key, and a working copy of its data. */
  let editing = $state<{ id: string | null; key: string | null; data: Record<string, unknown> } | null>(null);
  let issues = $state<{ path: string; message: string }[]>([]);
  let message = $state('');
  /** A save or import is in flight: the buttons wait so a double click can't write twice. */
  let busy = $state(false);
  let plan = $state<{ plan: ImportPlan; items: ImportPlan['add'] } | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let panel = $state<HTMLElement>();
  $effect(() => panel?.focus());

  const srd = $derived(srdFor(ctx));
  const rows = $derived.by(() => {
    void store.contentVersion;
    return [...store.state.content.rows.values()].filter((r) => r.kind === rowKind(tab)).sort((a, b) => a.key.localeCompare(b.key));
  });
  const broken = $derived(new Set(brokenRows(ctx).map((b) => `${b.kind}/${b.key}`)));
  const characters = $derived.by(() => {
    void store.charactersVersion;
    return [...store.state.characters.rows.values()].map((c) => c.data);
  });
  const nameOf = (data: Record<string, unknown>) => String(data.name ?? '') || '(ไม่มีชื่อ)';

  function startNew() {
    message = '';
    issues = [];
    editing = { id: null, key: null, data: BLANK[tab]() };
  }
  function startEdit(r: { id: string; key: string; data: Record<string, unknown> }) {
    message = '';
    issues = [];
    editing = { id: r.id, key: r.key, data: structuredClone($state.snapshot(r.data)) as Record<string, unknown> };
  }

  async function save() {
    if (!editing) return;
    const p = HB_SCHEMAS[tab].safeParse($state.snapshot(editing.data));
    if (!p.success) {
      issues = p.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      message = 'แก้ช่องที่ผิดก่อนบันทึก';
      return;
    }
    if (!editing.key && rows.length >= MAX_PER_KIND) {
      message = `มี${KIND_LABEL[tab]}ครบ ${MAX_PER_KIND} ชิ้นแล้ว ลบชิ้นที่ไม่ใช้ก่อน`;
      return;
    }
    if (busy) return;
    busy = true;
    try {
      // Keys are unique across every kind, so a key alone says which entry a character uses.
      const taken = [...store.state.content.rows.values()].filter((r) => r.kind.startsWith('hb-')).map((r) => r.key);
      const key = editing.key ?? slugKey(String(p.data.name), taken);
      if (await store.saveContent(rowKind(tab), key, p.data as Record<string, unknown>)) {
        editing = null;
        message = 'บันทึกแล้ว';
      } else message = 'บันทึกไม่สำเร็จ ลองอีกครั้ง';
    } finally {
      busy = false;
    }
  }

  function exportFile() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(toHbFile([...store.state.content.rows.values()]), null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'homebrew.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readFile(f: File) {
    message = '';
    if (f.size > MAX_FILE_BYTES) {
      message = 'ไฟล์ใหญ่เกิน 1 MB';
      return;
    }
    try {
      const file = fromHbText(await f.text());
      const p = planImport(file, getSrd(), [...store.state.content.rows.values()]);
      plan = { plan: p, items: [...p.add, ...p.replace] };
    } catch (e) {
      message = e instanceof HbFileError ? e.message : 'อ่านไฟล์ไม่สำเร็จ';
    }
  }
  async function confirmImport() {
    if (!plan || busy) return;
    const items = plan.items;
    busy = true;
    try {
      let ok = 0;
      for (const i of items) {
        // Store what zod accepts, never the file's own object (planImport already checked that it parses).
        const data = HB_SCHEMAS[kindOfRow(i.kind)!].parse(i.data) as Record<string, unknown>;
        if (await store.saveContent(i.kind, i.key, data)) ok++;
      }
      message = `นำเข้าแล้ว ${ok} จาก ${items.length} ชิ้น`;
      plan = null;
    } finally {
      busy = false;
    }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="sheet-panel overlay-ui" aria-label="จัดการ homebrew" tabindex="-1" bind:this={panel} onkeydown={onKey}>
  <header class="sheet-bar">
    <h2>Homebrew ของห้อง</h2>
    <button class="btn small" type="button" onclick={onclose}>ปิด</button>
  </header>
  <nav aria-label="ชนิด">
    <ol class="builder-steps">
      {#each HB_KINDS as k (k)}
        <li aria-current={tab === k ? 'step' : undefined}>
          <button type="button" aria-pressed={tab === k} onclick={() => { tab = k; editing = null; }}>{KIND_LABEL[k]}</button>
        </li>
      {/each}
    </ol>
  </nav>
  <div class="sheet-body">
    <div class="sheet builder">
      {#if plan}
        <h3>นำเข้าไฟล์</h3>
        <p>เพิ่ม {plan.plan.add.length} · แทนที่ {plan.plan.replace.length} (key ซ้ำ) · ข้าม {plan.plan.skip.length}</p>
        {#if plan.plan.skip.length}
          <ul>{#each plan.plan.skip as s, n (n)}<li class="hint">{s.key}: {s.reason}</li>{/each}</ul>
        {/if}
        <div class="row">
          <button class="btn primary" type="button" disabled={!plan.items.length || busy} onclick={confirmImport}>ยืนยันนำเข้า</button>
          <button class="btn" type="button" onclick={() => (plan = null)}>ยกเลิก</button>
        </div>
      {:else if editing}
        <h3>{editing.key ? `แก้${KIND_LABEL[tab]}` : `เพิ่ม${KIND_LABEL[tab]}`}</h3>
        <HbForm fields={FIELDS[tab]} bind:data={editing.data} {srd} {issues} />
        <div class="row">
          <button class="btn primary" type="button" disabled={busy} onclick={save}>บันทึก</button>
          <button class="btn" type="button" onclick={() => (editing = null)}>ยกเลิก</button>
        </div>
      {:else}
        <ul class="plain-list">
          {#each rows as r (r.id)}
            {@const used = usageCount(r.key, characters)}
            <li>
              <span class="nm">{nameOf(r.data)}{broken.has(`${r.kind}/${r.key}`) ? ' · ข้อมูลเสีย' : ''}</span>
              <button class="btn small" type="button" onclick={() => startEdit(r)}>แก้</button>
              <TwoStepButton label={used ? `ลบ (ตัวละคร ${used} ตัวใช้อยู่)` : 'ลบ'} onconfirm={() => void store.deleteContent(r.id)} />
            </li>
          {:else}
            <li class="emptyline">ยังไม่มี{KIND_LABEL[tab]}ของห้อง</li>
          {/each}
        </ul>
        <button class="btn primary" type="button" onclick={startNew}>เพิ่ม</button>
      {/if}
      {#if message}<p class="hint" role="status">{message}</p>{/if}
    </div>
  </div>
  <footer class="sheet-bar">
    <button class="btn small" type="button" onclick={exportFile}>ส่งออกเป็นไฟล์</button>
    <button class="btn small" type="button" onclick={() => fileInput?.click()}>นำเข้าไฟล์</button>
    <input type="file" accept="application/json,.json" hidden bind:this={fileInput}
      onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void readFile(f); e.currentTarget.value = ''; }} />
  </footer>
</section>
