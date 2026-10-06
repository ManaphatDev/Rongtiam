<script lang="ts">
  import type { RoomStore } from '../../sync/room.svelte';
  import type { FogMode } from '../../fog/geometry';
  import type { Stage } from '../Stage';
  import type { FogTool, Ui } from '../ui.svelte';
  import TwoStepButton from '../../ui/TwoStepButton.svelte';

  let { store, ui, stage }: { store: RoomStore; ui: Ui; stage: Stage } = $props();

  const TOOLS: { id: FogTool; label: string; key: string; hint: string }[] = [
    { id: 'rect', label: 'สี่เหลี่ยม', key: 'R', hint: 'ลากเป็นกรอบสี่เหลี่ยม' },
    { id: 'poly', label: 'หลายเหลี่ยม', key: 'P', hint: 'คลิกทีละมุม กด Enter หรือดับเบิลคลิกเพื่อปิดรูป (Esc ยกเลิก, Backspace ลบมุมล่าสุด)' },
    { id: 'brush', label: 'แปรง', key: 'B', hint: 'ลากระบายเป็นเส้นหนา ปรับความกว้างได้ด้านล่าง' },
    { id: 'pick', label: 'เลือกรูปทรง', key: 'S', hint: 'คลิกรูปทรงหมอกเพื่อเลือก ลบ หรือสลับเติม/ตัด' },
  ];
  const MODES: { id: FogMode; label: string }[] = [{ id: 'add', label: 'เติมหมอก' }, { id: 'cut', label: 'ตัดหมอก' }];

  const count = $derived.by(() => {
    void store.itemsVersion;
    return store.state.all().filter((i) => i.kind === 'fog').length;
  });
  const tool = $derived(TOOLS.find((t) => t.id === ui.fogTool)!);
</script>

<div class="group">
  <h2>หมอก</h2>
  <p class="hint">หมอกคลุมทับตัวละครและแมพ ผู้เล่นมองทะลุไม่ได้ ส่วนคุณเห็นเป็นสีจาง</p>
  <div class="seg four" role="group" aria-label="รูปแบบการวาด">
    {#each TOOLS as t (t.id)}
      <button aria-pressed={ui.tool === 'fog' && ui.fogTool === t.id} title={`${t.label} (กด ${t.key})`}
        onclick={() => { ui.tool = 'fog'; ui.fogTool = t.id; }}>{t.label}</button>
    {/each}
  </div>
  <p class="hint">{tool.hint}</p>
  <div class="seg two" role="group" aria-label="วาดแล้วทำอะไร">
    {#each MODES as m (m.id)}
      <button aria-pressed={ui.fogMode === m.id} onclick={() => (ui.fogMode = m.id)}>{m.label}</button>
    {/each}
  </div>
  <p class="hint">กด Alt ค้างตอนวาดเพื่อสลับเติม/ตัดชั่วคราว หรือกด X</p>
  {#if ui.fogTool === 'brush'}
    <label class="field"><span class="lbl">ความกว้างแปรง <output>{ui.brushWidth}</output></span>
      <input type="range" min="10" max="500" step="5" value={ui.brushWidth} oninput={(e) => ui.setBrush(+e.currentTarget.value)} /></label>
  {/if}
</div>

<div class="group">
  <h2>จัดการหมอก <small class="hint">({count} รูปทรง)</small></h2>
  <div class="row">
    <button class="btn" disabled={ui.fogUndo === 0} onclick={() => stage.fogTool.undo()} title="ย้อนกลับการแก้ไขหมอกของคุณ (Ctrl+Z)">ย้อนกลับ</button>
    <button class="btn" disabled={count < 2} onclick={() => stage.fogTool.compact()}
      title="รวมรูปทรงทั้งหมดเป็นชิ้นเดียว ภาพที่เห็นเหมือนเดิมแต่เบาลง">รวมรูปทรง</button>
  </div>
  <div class="row">
    <TwoStepButton label="คลุมหมดทั้งโต๊ะ" onconfirm={() => stage.fogTool.coverAll()} />
    <TwoStepButton label="ล้างหมอก" onconfirm={() => stage.fogTool.clear()} />
  </div>
  <p class="hint">"คลุมหมด" แทนที่หมอกเดิมด้วยหมอกผืนเดียวทั้งโต๊ะ แล้วใช้ "ตัดหมอก" เปิดทางทีละช่อง</p>
</div>

<div class="group">
  <h2>มุมมองผู้เล่น</h2>
  <label class="check"><input type="checkbox" checked={ui.playerView} onchange={(e) => (ui.playerView = e.currentTarget.checked)} />
    ดูแบบผู้เล่น (หมอกทึบ และซ่อนของที่ซ่อนไว้)</label>
  <p class="hint">ปุ่ม "พาดู" ที่แถบเครื่องมือด้านซ้ายจะพาผู้เล่นทุกคนมาดูจุดและระดับซูมเดียวกับคุณ</p>
</div>
