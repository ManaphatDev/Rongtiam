<script lang="ts">
  import { configured, ensureSession, rpc } from '../supa/client';
  import { captchaToken } from '../supa/captcha';
  import { getProfile, getRecent, rememberRoom, setGmKey, setProfile } from '../lib/profile';
  import { router } from '../router.svelte';
  import ProfileFields from '../ui/ProfileFields.svelte';

  const profile = getProfile();
  let roomName = $state('');
  let name = $state(profile.name);
  let color = $state(profile.color);
  let busy = $state(false);
  let error = $state('');
  let joinText = $state('');
  let captchaHost = $state<HTMLElement>();
  const recent = getRecent();

  async function create(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!roomName.trim() || !name.trim()) {
      error = 'ใส่ชื่อห้องและชื่อของคุณก่อน';
      return;
    }
    busy = true;
    try {
      await ensureSession(await captchaToken(captchaHost!));
      setProfile({ name: name.trim(), color });
      const r = await rpc<{ room_id: string; slug: string; gm_key: string }>('create_room', {
        p_name: roomName.trim(), p_display_name: name.trim(), p_color: color,
      });
      setGmKey(r.slug, r.gm_key);
      rememberRoom(r.slug, roomName.trim());
      router.go(`/r/${r.slug}`);
    } catch (err) {
      error = (err as { message?: string }).message === 'room limit reached'
        ? 'สร้างห้องได้สูงสุด 20 ห้อง'
        : 'สร้างห้องไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่';
    } finally {
      busy = false;
    }
  }

  function join(e: SubmitEvent) {
    e.preventDefault();
    const m = joinText.trim().match(/([1-9A-HJ-NP-Za-km-z]{10})(?:#gm=([\w-]+))?\s*$/);
    if (!m) {
      error = 'ลิงก์หรือรหัสห้องไม่ถูกต้อง';
      return;
    }
    if (m[2]) {
      location.assign(`/r/${m[1]}#gm=${m[2]}`);
      return;
    }
    router.go(`/r/${m[1]}`);
  }
</script>

<main class="page">
  <div class="card">
    <h1>โรงเตี๊ยม</h1>
    <p class="hint">โต๊ะเล่นเกมสวมบทบาทออนไลน์ เล่นพร้อมกันหลายคนแบบเรียลไทม์ แค่ส่งลิงก์ให้เพื่อน ไม่ต้องสมัครสมาชิก</p>

    {#if !configured}
      <p class="err">ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (Supabase) ใส่ค่า VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY ในไฟล์ .env.local ก่อน</p>
      {#if import.meta.env.DEV}
        <button class="btn" onclick={() => router.go('/local')}>ลองโต๊ะแบบออฟไลน์ (สำหรับนักพัฒนา)</button>
      {/if}
    {:else}
      <form class="group" onsubmit={create}>
        <h2>สร้างห้องใหม่ (คุณจะเป็น GM)</h2>
        <label class="field">ชื่อห้อง
          <input type="text" bind:value={roomName} maxlength="60" placeholder="เช่น ปาร์ตี้วันเสาร์" required />
        </label>
        <ProfileFields bind:name bind:color />
        <div class="cf-host" bind:this={captchaHost}></div>
        <button class="btn primary" disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้างห้อง'}</button>
      </form>

      <form class="group" onsubmit={join}>
        <h2>เข้าห้องของเพื่อน</h2>
        <div class="linkbox">
          <input type="text" bind:value={joinText} placeholder="วางลิงก์ห้องหรือรหัส 10 ตัว" aria-label="ลิงก์ห้อง" />
          <button class="btn">เข้า</button>
        </div>
      </form>

      {#if error}<p class="err" role="alert">{error}</p>{/if}

      {#if recent.length}
        <div class="group">
          <h2>ห้องที่เคยเข้า</h2>
          <ul class="recent">
            {#each recent as r (r.slug)}
              <li><a href={`/r/${r.slug}`} onclick={(e) => { e.preventDefault(); router.go(`/r/${r.slug}`); }}>
                <span>{r.name}</span><small>{new Date(r.at).toLocaleDateString('th-TH')}</small>
              </a></li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
    <p class="hint"><a href="/credits" onclick={(e) => { e.preventDefault(); router.go('/credits'); }}>เครดิตและสัญญาอนุญาต</a></p>
  </div>
</main>
