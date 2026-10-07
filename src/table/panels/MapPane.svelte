<script lang="ts">
  import type { RoomStore } from '../../sync/room.svelte';
  import type { Stage } from '../Stage';
  import type { TableActions } from '../actions';
  import type { Ui } from '../ui.svelte';
  import TwoStepButton from '../../ui/TwoStepButton.svelte';
  import Thumb from './Thumb.svelte';

  let { store, ui, stage, actions }: { store: RoomStore; ui: Ui; stage: Stage; actions: TableActions } = $props();

  const maps = $derived.by(() => {
    void store.itemsVersion;
    return store.state.all().filter((i) => i.kind === 'map').sort((a, b) => a.z - b.z);
  });
  const grid = $derived(store.settings.grid);
  let fileInput = $state<HTMLInputElement>();

  function setGrid(g: Partial<typeof grid>) {
    void store.updateSettings({ ...store.settings, grid: { ...grid, ...g } });
  }
</script>

<div class="group">
  <h2>แมพ</h2>
  {#if store.isGM}
    <button class="btn primary" onclick={() => fileInput?.click()}>เพิ่มแมพ</button>
    <input type="file" accept="image/*" multiple hidden bind:this={fileInput}
      onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void actions.addMaps(f); }} />
    <p class="hint">เลือกได้หลายรูปพร้อมกัน แมพใหม่จะวางต่อด้านขวาของแมพที่เลือกอยู่ ใช้ภาพอะไรก็ได้ ลากไฟล์มาวางบนโต๊ะ หรือกด Ctrl+V ก็ได้</p>
  {:else}
    <p class="hint">GM เป็นคนวางแมพ คุณเลื่อนและซูมดูได้ตามสบาย</p>
  {/if}
  <label class="check"><input type="checkbox" checked={ui.snap} onchange={(e) => ui.setSnap(e.currentTarget.checked)} /> ขอบแมพดูดติดกันตอนลากวาง</label>
  {#if store.isGM}<p class="hint">กด Alt ค้างตอนลากเพื่อปิดการดูดชั่วคราว</p>{/if}
</div>

<div class="group">
  <h2>แมพบนโต๊ะ</h2>
  <ul class="roster">
    {#each maps as m (m.id)}
      <li class:sel={m.id === ui.selectedId}>
        <button class="pick" onclick={() => { if (store.isGM) ui.select(m.id); stage.centerOn(m.id); }}>
          <span class="thumb"><Thumb {store} file={m.props.img} /></span>
          <span class="nm">{m.props.name ?? 'แมพ'}{m.hidden ? ' (ซ่อน)' : ''}</span>
        </button>
        {#if store.isGM}
          <button class="lock" aria-pressed={m.locked} title={m.locked ? 'ปลดล็อกแมพ' : 'ล็อกแมพ'} aria-label={m.locked ? 'ปลดล็อกแมพ' : 'ล็อกแมพ'}
            onclick={() => store.patch(m.id, { locked: !m.locked })}>🔒</button>
        {/if}
      </li>
    {:else}
      <li class="emptyline">ยังไม่มีแมพบนโต๊ะ</li>
    {/each}
  </ul>
  <button class="btn" onclick={() => stage.fitView()}>ปรับให้เห็นแมพทั้งหมด</button>
</div>

<div class="group">
  <h2>วิธีใช้เมาส์</h2>
  <p class="hint"><b>เลือก:</b> คลิกหรือลากเพื่อหยิบตัวละคร สติกเกอร์{store.isGM ? ' หรือแมพ' : ''} ย้ายหรือหมุนได้<br />
  <b>เลื่อนจอ:</b> ลากเพื่อเลื่อนมุมมองโดยไม่ไปโดนของบนโต๊ะ ลองกด Space ค้างหรือกดปุ่มกลางเมาส์ก็ได้<br />
  <b>ชี้จุด:</b> คลิกที่แมพให้มีวงสั่นขึ้นให้ทุกคนเห็น (ดับเบิลคลิกก็ได้)<br />
  ล้อเมาส์หรือสองนิ้วบนมือถือ ใช้ซูมได้ทุกเครื่องมือ<br />
  <b>คีย์บอร์ด:</b> กด Tab เพื่อเลือกของบนโต๊ะทีละชิ้น ใช้ลูกศรเลื่อน (กด Shift ค้างเพื่อเลื่อนทีละช่อง) Q / E หมุน Delete ลบ</p>
</div>

{#if store.isGM}
  <div class="group">
    <h2>ตาราง</h2>
    <label class="check"><input type="checkbox" checked={grid.on} onchange={(e) => setGrid({ on: e.currentTarget.checked })} /> แสดงตารางทับแมพ (ทุกคนเห็น)</label>
    <label class="field">ขนาดช่อง<input type="range" min="20" max="300" value={grid.size} onchange={(e) => setGrid({ size: +e.currentTarget.value })} /></label>
    <p class="hint">ตัวละครขยับได้อิสระ ตารางมีไว้ช่วยนับระยะเดินเท่านั้น</p>
  </div>
  <div class="group">
    <h2>จัดการเกม</h2>
    <div class="row">
      <TwoStepButton label="ลบแมพทั้งหมด" onconfirm={() => { actions.clearMaps(); stage.fitView(); }} />
      <TwoStepButton label="ล้างโต๊ะทั้งหมด" onconfirm={() => actions.clearTable()} />
    </div>
  </div>
{/if}
