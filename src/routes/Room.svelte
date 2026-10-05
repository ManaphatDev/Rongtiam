<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { configured, ensureSession, rpc } from '../supa/client';
  import { captchaToken } from '../supa/captcha';
  import { SupabaseBackend } from '../supa/backend';
  import { getGmKey, getProfile, rememberRoom, setGmKey, setProfile } from '../lib/profile';
  import { router } from '../router.svelte';
  import { RoomStore } from '../sync/room.svelte';
  import ProfileFields from '../ui/ProfileFields.svelte';
  import Table from '../table/Table.svelte';
  import { Ui } from '../table/ui.svelte';

  let { slug }: { slug: string } = $props();

  type Phase = 'loading' | 'notfound' | 'join' | 'waiting' | 'banned' | 'table' | 'error';
  let phase = $state<Phase>('loading');
  let error = $state('');
  let roomName = $state('');
  const profile = getProfile();
  let name = $state(profile.name);
  let color = $state(profile.color);
  let busy = $state(false);
  let store = $state<RoomStore | null>(null);
  let gmKey = $state<string | undefined>();
  let captchaHost = $state<HTMLElement>();
  let poll: ReturnType<typeof setInterval> | null = null;
  let userId = '';
  const ui = new Ui();

  interface Info { room_id: string; name: string; status: 'pending' | 'approved' | 'banned' | null; role: 'gm' | 'player' | null }

  async function info() {
    return rpc<Info | null>('room_public_info', { p_slug: slug });
  }

  onMount(async () => {
    if (!configured) {
      phase = 'error';
      error = 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์';
      return;
    }
    try {
      gmKey = getGmKey(slug);
      userId = await ensureSession(await captchaToken(captchaHost!));
      // A GM link (#gm=KEY) makes this browser a GM of the room. The key never leaves the fragment otherwise.
      const fromHash = location.hash.match(/^#gm=([\w-]+)$/)?.[1];
      if (fromHash) {
        history.replaceState(null, '', location.pathname);
        setGmKey(slug, fromHash);
        gmKey = fromHash;
      }
      let i = await info();
      if (!i) {
        phase = 'notfound';
        return;
      }
      roomName = i.name;
      if (gmKey && !(i.status === 'approved' && i.role === 'gm')) {
        try {
          await rpc('claim_gm', { p_slug: slug, p_key: gmKey, p_display_name: name.trim() || 'GM', p_color: color });
          i = (await info()) ?? i;
        } catch {
          // Stale key (rotated); fall through to the normal join flow.
        }
      }
      await route(i);
    } catch {
      phase = 'error';
      error = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (เซิร์ฟเวอร์อาจหลับอยู่ ถ้าไม่ได้ใช้งานนาน GM ต้องเข้าไปเปิดใน Supabase)';
    }
  });

  async function route(i: Info) {
    if (i.status === 'approved') await open(i);
    else if (i.status === 'banned') phase = 'banned';
    else if (i.status === 'pending') waitForApproval();
    else phase = 'join';
  }

  async function requestJoin(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    busy = true;
    error = '';
    try {
      setProfile({ name: name.trim(), color });
      const st = await rpc<string>('request_join', { p_slug: slug, p_display_name: name.trim(), p_color: color });
      if (st === 'approved') await route((await info())!);
      else waitForApproval();
    } catch (err) {
      error = (err as { message?: string }).message === 'banned' ? 'คุณถูกห้ามเข้าห้องนี้' : 'ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง';
    } finally {
      busy = false;
    }
  }

  function waitForApproval() {
    phase = 'waiting';
    stopPoll();
    const check = async () => {
      try {
        const i = await info();
        if (i && i.status !== 'pending') {
          stopPoll();
          await route(i);
        } else if (!i) {
          stopPoll();
          phase = 'notfound';
        }
      } catch {
        // keep polling
      }
    };
    poll = setInterval(check, 3000);
    window.addEventListener('focus', check);
    stopFocus = () => window.removeEventListener('focus', check);
  }
  let stopFocus: (() => void) | null = null;
  function stopPoll() {
    if (poll) clearInterval(poll);
    poll = null;
    stopFocus?.();
    stopFocus = null;
  }

  async function open(i: Info) {
    rememberRoom(slug, i.name);
    const backend = new SupabaseBackend(i.room_id, userId);
    const s = new RoomStore(backend, { user_id: userId, name: name.trim() || 'ผู้เล่น', color, role: i.role ?? 'player' }, (msg) => ui.showToast('ผิดพลาด', undefined, msg));
    store = s;
    ui.tab = i.role === 'gm' ? 'map' : 'chars';
    phase = 'table';
    try {
      await s.connect(i.role === 'gm');
    } catch {
      phase = 'error';
      error = 'เข้าห้องไม่สำเร็จ ลองรีเฟรชหน้า';
    }
  }

  onDestroy(() => {
    stopPoll();
    store?.dispose();
  });
</script>

<div class="cf-host" bind:this={captchaHost}></div>

{#if phase === 'table' && store}
  {#if store.kicked}
    <main class="page"><div class="card">
      <h1>{store.kicked === 'banned' ? 'คุณถูกห้ามเข้าห้องนี้' : 'คุณถูกเชิญออกจากห้อง'}</h1>
      <button class="btn primary" onclick={() => router.go('/')}>กลับหน้าแรก</button>
    </div></main>
  {:else}
    <Table {store} {ui} {slug} {gmKey} />
  {/if}
{:else}
  <main class="page">
    <div class="card">
      {#if phase === 'loading'}
        <h1>กำลังเข้าห้อง…</h1>
        <div class="spinner" aria-hidden="true"></div>
      {:else if phase === 'notfound'}
        <h1>ไม่พบห้องนี้</h1>
        <p class="hint">ลิงก์อาจพิมพ์ผิด หรือห้องถูกลบไปแล้ว</p>
        <button class="btn primary" onclick={() => router.go('/')}>กลับหน้าแรก</button>
      {:else if phase === 'join'}
        <h1>เข้าห้อง “{roomName}”</h1>
        <form class="group" onsubmit={requestJoin}>
          <ProfileFields bind:name bind:color />
          <button class="btn primary" disabled={busy || !name.trim()}>{busy ? 'กำลังส่ง…' : 'ขอเข้าห้อง'}</button>
          <p class="hint">GM จะกดรับคุณเข้าห้องครั้งแรกครั้งเดียว ครั้งต่อไปเข้าได้เลย</p>
        </form>
        {#if error}<p class="err" role="alert">{error}</p>{/if}
      {:else if phase === 'waiting'}
        <h1>รอ GM รับเข้าห้อง…</h1>
        <div class="spinner" aria-hidden="true"></div>
        <p class="hint" aria-live="polite">ส่งคำขอเข้าห้อง “{roomName}” แล้ว เปิดหน้านี้ค้างไว้ได้เลย พอ GM กดรับ หน้าจะเข้าห้องให้เอง</p>
      {:else if phase === 'banned'}
        <h1>คุณถูกห้ามเข้าห้องนี้</h1>
        <button class="btn primary" onclick={() => router.go('/')}>กลับหน้าแรก</button>
      {:else}
        <h1>มีปัญหา</h1>
        <p class="err" role="alert">{error}</p>
        <button class="btn primary" onclick={() => location.reload()}>ลองใหม่</button>
      {/if}
    </div>
  </main>
{/if}
