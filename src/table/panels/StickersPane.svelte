<script lang="ts">
  import type { RoomStore } from '../../sync/room.svelte';
  import type { TableActions } from '../actions';
  import Thumb from './Thumb.svelte';

  let { store, actions }: { store: RoomStore; actions: TableActions } = $props();

  const EMOJIS = ['❗', '❓', '⚔️', '🛡️', '🏹', '💀', '🔥', '⚡', '💰', '🗝️', '🚪', '👁️', '🧪', '🕸️', '🐉', '⚠️', '❤️', '⭐', '👍', '😂', '😱', '🎯', '🍺', '🏰'];
  const lib = $derived.by(() => {
    void store.assetsVersion;
    return [...store.state.assets.values()].filter((a) => a.kind === 'sticker').sort((a, b) => a.rev - b.rev);
  });
  let fileInput = $state<HTMLInputElement>();
</script>

<div class="group">
  <h2>สติกเกอร์สำเร็จรูป</h2>
  <div class="emoji-grid">
    {#each EMOJIS as em (em)}
      <button aria-label={`แปะสติกเกอร์ ${em}`} onclick={() => actions.placeSticker({ emoji: em })}>{em}</button>
    {/each}
  </div>
</div>
<div class="group">
  <h2>สติกเกอร์จากรูป (ใช้ร่วมกันทั้งห้อง)</h2>
  <button class="btn primary" onclick={() => fileInput?.click()}>เพิ่มรูปเป็นสติกเกอร์</button>
  <input type="file" accept="image/*" multiple hidden bind:this={fileInput}
    onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void actions.addToLib(f, false); }} />
  <div class="lib-grid">
    {#each lib as a (a.file)}
      <div class="lib-item">
        <button class="place" aria-label="แปะสติกเกอร์นี้" onclick={() => actions.placeSticker({ img: a.file })}><Thumb {store} file={a.file} /></button>
        {#if store.isGM || a.created_by === store.userId}
          <button class="rm" aria-label="เอาออกจากคลัง" onclick={() => store.removeAsset(a.file, 'sticker')}>×</button>
        {/if}
      </div>
    {/each}
  </div>
  <p class="hint">กดที่รูปเพื่อแปะลงกลางจอ แล้วลากไปวางตรงที่ต้องการ ใช้รูปพื้นหลังโปร่งใส (PNG) จะสวยที่สุด</p>
</div>
