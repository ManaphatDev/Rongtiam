<script lang="ts">
  // Character sheets in the room: choose the system (GM), create, import, and open sheets.
  import { RULESETS } from '../rulesets/registry';
  import type { RulesetHost } from '../rulesets/host.svelte';
  import type { RoomStore } from '../sync/room.svelte';
  import type { Ui } from '../table/ui.svelte';
  import { fromText, ImportError } from './transfer';

  let { store, ui, host }: { store: RoomStore; ui: Ui; host: RulesetHost } = $props();

  const ruleset = $derived(host.roomRuleset);
  const list = $derived(host.characters());
  /** The system has a guided builder (D&D); otherwise "create" just opens a blank sheet. */
  const hasBuilder = $derived(ruleset !== 'none' && !!host.module(ruleset)?.Builder);
  let importInput = $state<HTMLInputElement>();
  let error = $state('');
  let busy = $state(false);

  const owner = (id: string | null) => {
    void store.membersVersion;
    return id ? store.state.members.get(id)?.display_name ?? '' : 'NPC';
  };

  async function create(secret: boolean) {
    error = '';
    busy = true;
    try {
      const mod = await host.ensure(ruleset);
      if (!mod) throw new Error('โหลดระบบกฎไม่สำเร็จ');
      const row = await store.createCharacter({
        ruleset, data: mod.newCharacter(host.ctx),
        ...(secret ? { visibility: 'gm' as const, owner_id: null } : {}),
      });
      if (row) ui.sheetOpen = row.id;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function startCreate() {
    if (!hasBuilder) {
      void create(false);
      return;
    }
    ui.sheetOpen = null;
    ui.builderOpen = true;
  }

  async function importFile(f: File) {
    error = '';
    try {
      const file = fromText(await f.text());
      const mod = await host.ensure(file.ruleset);
      if (!mod) throw new ImportError(`ห้องนี้ไม่รู้จักระบบกฎ "${file.ruleset}"`);
      let data: Record<string, unknown>;
      try {
        data = mod.parse(file.data);
      } catch {
        throw new ImportError('ข้อมูลในไฟล์ไม่ตรงกับระบบกฎของไฟล์');
      }
      const row = await store.createCharacter({ ruleset: file.ruleset, data });
      if (row) ui.sheetOpen = row.id;
    } catch (e) {
      error = e instanceof ImportError ? e.message : 'นำเข้าไม่สำเร็จ';
    }
  }
</script>

<div class="group">
  <h2>ชีทตัวละคร</h2>
  {#if store.isGM}
    <label class="field">ระบบกฎของห้อง
      <select aria-label="ระบบกฎของห้อง" value={ruleset} onchange={(e) => store.setRuleset(e.currentTarget.value)}>
        <option value="none" disabled={ruleset !== 'none'}>เลือกระบบ…</option>
        {#each RULESETS as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
    </label>
  {/if}

  {#if ruleset === 'dnd2024' && store.isGM}
    {#await import('../rulesets/dnd2024/RoomSkillsEditor.svelte') then { default: RoomSkillsEditor }}
      <RoomSkillsEditor {store} ctx={host.ctx} />
    {/await}
  {/if}
  {#if ruleset === 'custom' && store.isGM}
    <button class="btn" onclick={() => { ui.sheetOpen = null; ui.templateOpen = true; }}>ออกแบบชีท (แม่แบบ)</button>
  {/if}

  {#if ruleset === 'none'}
    <p class="hint">{store.isGM ? 'เลือกระบบกฎก่อน แล้วทุกคนจะสร้างชีทได้' : 'รอ GM เลือกระบบกฎของห้อง'}</p>
  {:else}
    <div class="row">
      <button class="btn primary" disabled={busy} onclick={startCreate}>สร้างตัวละคร</button>
      {#if hasBuilder}<button class="btn" disabled={busy} onclick={() => create(false)}>สร้างชีทเปล่า</button>{/if}
      {#if store.isGM}<button class="btn" disabled={busy} onclick={() => create(true)}>สร้าง NPC ลับ</button>{/if}
    </div>
  {/if}
  <button class="btn small" onclick={() => importInput?.click()}>นำเข้าจากไฟล์</button>
  <input type="file" accept=".json,application/json" hidden bind:this={importInput}
    onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void importFile(f); }} />
  {#if error}<p class="hint err" role="status">{error}</p>{/if}
  {#if ruleset === 'dnd2024'}
    <p class="hint">กติกาจาก SRD 5.2 (CC-BY-4.0) <a href="/credits" target="_blank" rel="noopener">ดูเครดิต</a></p>
  {/if}

  <ul class="roster">
    {#each list as ch (ch.id)}
      {@const mod = host.module(ch.ruleset)}
      <li class:sel={ch.id === ui.sheetOpen}>
        <button class="pick" aria-pressed={ch.id === ui.sheetOpen} onclick={() => (ui.sheetOpen = ui.sheetOpen === ch.id ? null : ch.id)}>
          <span class="nm">{mod ? mod.nameOf(ch.data) : '…'}</span>
          <small class="hint">{owner(ch.owner_id)}{ch.visibility === 'gm' ? ' · ลับ' : ''}</small>
        </button>
      </li>
    {:else}
      <li class="emptyline">ยังไม่มีชีทตัวละคร</li>
    {/each}
  </ul>
</div>
