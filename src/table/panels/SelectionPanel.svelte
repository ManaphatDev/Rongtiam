<script lang="ts">
  import { COLORS } from '../../lib/profile';
  import { normDeg } from '../../lib/geometry';
  import type { RoomStore } from '../../sync/room.svelte';
  import type { ItemRow, Props } from '../../sync/types';
  import type { Stage } from '../Stage';
  import type { TableActions } from '../actions';
  import type { Ui } from '../ui.svelte';

  let { store, ui, stage, actions }: { store: RoomStore; ui: Ui; stage: Stage; actions: TableActions } = $props();

  const it = $derived.by(() => {
    void store.itemsVersion;
    return ui.selectedId ? store.item(ui.selectedId) : undefined;
  });
  const canEdit = $derived(!!it && stage.canEdit(it));
  const TITLES: Record<string, string> = { char: 'ตัวละครที่เลือก', sticker: 'สติกเกอร์ที่เลือก', map: 'แมพที่เลือก', fog: 'รูปทรงหมอกที่เลือก' };
  let fileInput = $state<HTMLInputElement>();

  const n = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);
  function set(props: Props, delay = 150) {
    if (it) store.patch(it.id, { props }, delay);
  }
  function range(key: keyof Props) {
    return (e: Event) => set({ [key]: +(e.currentTarget as HTMLInputElement).value });
  }
  const sizeMax = (r: ItemRow) => Math.max(8000, Math.round(n(r.props.size) * 2));
</script>

{#if it}
  <section class="selpanel" aria-label={TITLES[it.kind]}>
    <h2>{TITLES[it.kind] ?? 'ที่เลือกอยู่'}</h2>
    {#if !canEdit}
      <p class="hint">{it.locked ? '🔒 ชิ้นนี้ถูก GM ล็อกไว้' : 'คุณดูได้อย่างเดียว'}</p>
    {:else if it.kind === 'fog'}
      <div class="seg two" role="group" aria-label="รูปทรงนี้ทำอะไร">
        <button aria-pressed={it.props.mode !== 'cut'} onclick={() => stage.fogTool.setMode(it, 'add')}>เติมหมอก</button>
        <button aria-pressed={it.props.mode === 'cut'} onclick={() => stage.fogTool.setMode(it, 'cut')}>ตัดหมอก</button>
      </div>
      <p class="hint">รูปทรงที่อยู่บนสุดมีผลก่อน: "ตัด" เปิดช่องในหมอกที่อยู่ใต้มัน "เติม" ปิดช่องที่อยู่ใต้มันทับกลับ</p>
      <button class="btn small warn" onclick={() => stage.deleteSel()}>ลบรูปทรงนี้</button>
    {:else}
      {#if it.kind === 'char' || it.kind === 'map'}
        <label class="field">ชื่อ<input type="text" maxlength="40" value={String(it.props.name ?? '')}
          oninput={(e) => set({ name: e.currentTarget.value }, 400)} /></label>
      {/if}

      {#if it.kind === 'char'}
        <div class="field">สีขอบ
          <div class="swatches">
            {#each COLORS as c (c)}
              <button class="sw" style:background={c} aria-label={`สีขอบ ${c}`} aria-pressed={it.props.color === c}
                onclick={() => set({ color: c }, 0)}></button>
            {/each}
          </div>
        </div>
        <label class="field">ขนาดตัวละคร<input type="range" min="20" max="800" value={n(it.props.size, 70)} oninput={range('size')} /></label>
        <label class="field">ซูมรูปในวงกลม<input type="range" min="1" max="3" step="0.05" value={n(it.props.zoom, 1)} oninput={range('zoom')} /></label>
        <label class="field">เลื่อนรูปซ้าย–ขวา<input type="range" min="-50" max="50" value={n(it.props.ox)} oninput={range('ox')} /></label>
        <label class="field">เลื่อนรูปขึ้น–ลง<input type="range" min="-50" max="50" value={n(it.props.oy)} oninput={range('oy')} /></label>
        <button class="btn small" onclick={() => fileInput?.click()}>เปลี่ยนรูปตัวละคร</button>
        <input type="file" accept="image/*" hidden bind:this={fileInput}
          onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void actions.changeCharImage(it.id, f); }} />
      {/if}

      {#if it.kind === 'sticker'}
        <label class="field">ขนาดสติกเกอร์<input type="range" min="20" max="800" value={n(it.props.size, 70)} oninput={range('size')} /></label>
      {/if}

      {#if it.kind === 'map'}
        <label class="field">ขนาดแมพ<input type="range" min="200" max={sizeMax(it)} step="10" value={n(it.props.size)} oninput={range('size')} /></label>
        <div class="row">
          <button class="btn small" onclick={() => actions.moveMap(it, -1)}>ส่งไปข้างหลัง</button>
          <button class="btn small" onclick={() => actions.moveMap(it, 1)}>ดึงมาข้างหน้า</button>
        </div>
      {/if}

      {#if it.kind !== 'char'}
        <label class="field"><span class="lbl">หมุน <output>{Math.round(n(it.props.rot))}°</output></span>
          <input type="range" min="-180" max="180" step="1" value={Math.round(n(it.props.rot))}
            oninput={(e) => set({ rot: normDeg(+e.currentTarget.value) })} /></label>
        <div class="row">
          <button class="btn small" onclick={() => stage.rotateSel(-90)}>↺ 90°</button>
          <button class="btn small" onclick={() => set({ rot: 0 }, 0)}>ตั้งตรง</button>
          <button class="btn small" onclick={() => stage.rotateSel(90)}>↻ 90°</button>
        </div>
        <p class="hint">หรือลากปุ่มกลมสีเหลืองเหนือชิ้นที่เลือกเพื่อหมุน (กด Shift ค้างเพื่อหมุนทีละ 15°) กด Q / E เพื่อหมุนเล็กน้อย</p>
      {/if}

      {#if store.isGM}
        <label class="check"><input type="checkbox" checked={it.locked} onchange={(e) => store.patch(it.id, { locked: e.currentTarget.checked })} />
          ล็อก (ผู้เล่นขยับไม่ได้ กันลากเผลอ)</label>
        <label class="check"><input type="checkbox" checked={it.hidden} onchange={(e) => store.patch(it.id, { hidden: e.currentTarget.checked })} />
          ซ่อนจากผู้เล่น (คุณยังเห็นแบบจางๆ)</label>
      {/if}

      <div class="row">
        <button class="btn small" onclick={() => set({ flip: !it.props.flip }, 0)}>พลิกซ้าย–ขวา</button>
        <button class="btn small" onclick={() => actions.duplicate(it)}>ทำสำเนา</button>
        <button class="btn small warn" onclick={() => stage.deleteSel()}>ลบ</button>
      </div>
    {/if}
  </section>
{/if}
