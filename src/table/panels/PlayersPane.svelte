<script lang="ts">
  import { gmUrl, roomUrl, setGmKey, setProfile } from '../../lib/profile';
  import type { RoomStore } from '../../sync/room.svelte';
  import type { Ui } from '../ui.svelte';
  import TwoStepButton from '../../ui/TwoStepButton.svelte';
  import ProfileFields from '../../ui/ProfileFields.svelte';

  let { store, ui, slug, gmKey = $bindable() }: { store: RoomStore; ui: Ui; slug: string; gmKey: string | undefined } = $props();

  const onlineIds = $derived(new Set(store.online.map((p) => p.user_id)));
  const members = $derived.by(() => {
    void store.membersVersion;
    return [...store.state.members.values()].sort((a, b) => (a.role === b.role ? a.display_name.localeCompare(b.display_name, 'th') : a.role === 'gm' ? -1 : 1));
  });
  const approved = $derived(members.filter((m) => m.status === 'approved'));
  const pending = $derived(members.filter((m) => m.status === 'pending'));
  const banned = $derived(members.filter((m) => m.status === 'banned'));

  const me = $derived(store.meMember);
  let name = $state('');
  let color = $state('');
  $effect(() => {
    if (me && !name) {
      name = me.display_name;
      color = me.color;
    }
  });

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      ui.showToast('คัดลอกแล้ว', undefined, what);
    } catch {
      ui.showToast('คัดลอกไม่ได้', undefined, 'เลือกข้อความแล้วคัดลอกเอง');
    }
  }

  async function rotate() {
    try {
      const k = await store.backend.rotateGmKey();
      setGmKey(slug, k);
      gmKey = k;
      ui.showToast('เปลี่ยนลิงก์ GM แล้ว', undefined, 'ลิงก์เก่าใช้ไม่ได้อีกต่อไป');
    } catch {
      ui.showToast('เปลี่ยนลิงก์ไม่สำเร็จ');
    }
  }

  function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    if (!me || !name.trim()) return;
    setProfile({ name: name.trim(), color });
    void store.member(me.user_id, { display_name: name.trim(), color });
  }
</script>

<div class="group">
  <h2>ชวนเพื่อน</h2>
  <div class="linkbox">
    <input type="text" readonly value={roomUrl(slug)} aria-label="ลิงก์ห้อง" onfocus={(e) => e.currentTarget.select()} />
    <button class="btn small" onclick={() => copy(roomUrl(slug), 'ลิงก์ห้อง')}>คัดลอก</button>
  </div>
  <p class="hint">ส่งลิงก์นี้ให้เพื่อน เพื่อนใส่ชื่อแล้วกดขอเข้า{store.isGM ? ' คุณกดรับครั้งแรกครั้งเดียว' : ' GM จะกดรับ'}</p>
</div>

{#if store.isGM && pending.length}
  <div class="group">
    <h2>ขอเข้าห้อง ({pending.length})</h2>
    <ul class="people">
      {#each pending as m (m.user_id)}
        <li>
          <span class="pdot" style:background={m.color}></span><span class="pname">{m.display_name}</span>
          <button class="btn small primary" onclick={() => store.member(m.user_id, { status: 'approved' })}>รับ</button>
          <button class="btn small" onclick={() => store.kick(m.user_id)}>ไม่รับ</button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<div class="group">
  <h2>ผู้เล่นในห้อง</h2>
  <ul class="people">
    {#each approved as m (m.user_id)}
      <li class:off={!onlineIds.has(m.user_id)}>
        <span class="pdot" style:background={m.color}></span>
        <span class="pname">{m.display_name}{m.user_id === store.userId ? ' (คุณ)' : ''}</span>
        <span class="ptag">{m.role === 'gm' ? 'GM' : ''}{onlineIds.has(m.user_id) ? ' ออนไลน์' : ''}</span>
        {#if store.isGM && m.user_id !== store.userId}
          {#if m.role === 'player'}
            <button class="btn small" onclick={() => store.member(m.user_id, { role: 'gm' })} title="ให้เป็น GM ด้วย">GM</button>
          {/if}
          <TwoStepButton label="เชิญออก" onconfirm={() => store.kick(m.user_id)} />
        {/if}
      </li>
    {/each}
  </ul>
  {#if store.isGM}
    <p class="hint">เชิญออก = ต้องขอเข้าใหม่และให้คุณกดรับอีกครั้ง</p>
  {/if}
</div>

{#if store.isGM}
  <div class="group">
    <h2>ลิงก์ GM (ลับ)</h2>
    {#if gmKey}
      <div class="linkbox">
        <input type="text" readonly value={gmUrl(slug, gmKey)} aria-label="ลิงก์ GM" onfocus={(e) => e.currentTarget.select()} />
        <button class="btn small" onclick={() => copy(gmUrl(slug, gmKey!), 'ลิงก์ GM')}>คัดลอก</button>
      </div>
    {/if}
    <p class="hint">ใช้เปิดห้องในฐานะ GM จากเครื่องอื่น ห้ามส่งให้ผู้เล่น ถ้าหลุดไปให้กดเปลี่ยนลิงก์</p>
    <TwoStepButton label="เปลี่ยนลิงก์ GM" onconfirm={rotate} />
  </div>
  {#if banned.length}
    <div class="group">
      <h2>ถูกห้ามเข้า</h2>
      <ul class="people">
        {#each banned as m (m.user_id)}
          <li><span class="pdot" style:background={m.color}></span><span class="pname">{m.display_name}</span>
            <button class="btn small" onclick={() => store.kick(m.user_id)}>ยกเลิกการห้าม</button></li>
        {/each}
      </ul>
    </div>
  {/if}
{/if}

<form class="group" onsubmit={saveProfile}>
  <h2>ตัวคุณ</h2>
  <ProfileFields bind:name bind:color />
  <button class="btn small">บันทึกชื่อและสี</button>
</form>
