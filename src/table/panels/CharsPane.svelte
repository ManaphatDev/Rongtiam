<script lang="ts">
  import type { RoomStore } from '../../sync/room.svelte';
  import type { Stage } from '../Stage';
  import type { TableActions } from '../actions';
  import type { Ui } from '../ui.svelte';
  import Thumb from './Thumb.svelte';

  let { store, ui, stage, actions }: { store: RoomStore; ui: Ui; stage: Stage; actions: TableActions } = $props();

  const chars = $derived.by(() => {
    void store.itemsVersion;
    return store.state.all().filter((i) => i.kind === 'char').sort((a, b) => String(a.props.name).localeCompare(String(b.props.name), 'th'));
  });
  let newName = $state('');
  let fileInput = $state<HTMLInputElement>();
</script>

<div class="group">
  <h2>เพิ่มตัวละคร</h2>
  <label class="field">ชื่อ (ไม่ใส่ก็ได้)<input type="text" bind:value={newName} maxlength="40" placeholder="เช่น อาเธอร์ พ่อมดเฒ่า" /></label>
  <button class="btn primary" onclick={() => fileInput?.click()}>เลือกรูปตัวละคร</button>
  <input type="file" accept="image/*" multiple hidden bind:this={fileInput}
    onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void actions.addChars(f, newName).then(() => (newName = '')); }} />
  <p class="hint">เลือกได้หลายรูปพร้อมกัน ใช้เครื่องมือ "เลือก" ลากตัวละครไปไหนก็ได้ ปรับขนาด สีขอบ และตำแหน่งรูปในวงกลมได้เมื่อคลิกเลือก</p>
</div>
<div class="group">
  <h2>ตัวละครบนโต๊ะ</h2>
  <ul class="roster">
    {#each chars as c (c.id)}
      <li class:sel={c.id === ui.selectedId}>
        <button class="pick" onclick={() => { ui.select(c.id); stage.centerOn(c.id); }}>
          <span class="dot" style:border-color={String(c.props.color ?? '#fff')}><Thumb {store} file={c.props.img} /></span>
          <span class="nm">{c.props.name}{c.hidden ? ' (ซ่อน)' : ''}{c.locked ? ' 🔒' : ''}</span>
        </button>
      </li>
    {:else}
      <li class="emptyline">ยังไม่มีตัวละครบนโต๊ะ</li>
    {/each}
  </ul>
</div>
