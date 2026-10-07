<script lang="ts">
  // GM: the room's own skills (house rules), shown on every D&D sheet, and whether players may add their own.
  import type { RoomStore } from '../../sync/room.svelte';
  import type { RulesetContext } from '../core/types';
  import { ABILITY_TH } from './i18n/th';
  import { roomSkillsOf, RoomSkillsZ, SKILLS_KEY, SKILLS_KIND, type RoomSkills } from './roomSkills';

  let { store, ctx }: { store: RoomStore; ctx: RulesetContext } = $props();

  const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const current = $derived(roomSkillsOf(ctx));
  let name = $state('');
  let ability = $state<(typeof ABILITY_KEYS)[number]>('dex');

  function save(next: RoomSkills) {
    void store.saveContent(SKILLS_KIND, SKILLS_KEY, RoomSkillsZ.parse(next));
  }
  function add(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const taken = new Set(current.skills.map((s) => s.key));
    let i = current.skills.length + 1;
    while (taken.has(`skill${i}`)) i++;
    save({ ...current, skills: [...current.skills, { key: `skill${i}`, name: n.slice(0, 40), ability }] });
    name = '';
  }
</script>

<details class="block">
  <summary>สกิลของห้อง (กฎบ้าน)</summary>
  <p class="hint">สกิลที่เพิ่มตรงนี้จะขึ้นในชีท D&amp;D ของทุกคน ผู้เล่นเลือกระดับชำนาญเองได้</p>
  <ul class="roster">
    {#each current.skills as s (s.key)}
      <li>
        <span class="pick static"><span class="nm">{s.name}</span><small class="hint">{ABILITY_TH[s.ability].short}</small></span>
        <button class="btn small" aria-label={`ลบสกิล ${s.name}`} onclick={() => save({ ...current, skills: current.skills.filter((x) => x.key !== s.key) })}>✕</button>
      </li>
    {:else}
      <li class="emptyline">ยังไม่มีสกิลของห้อง</li>
    {/each}
  </ul>
  <form class="row" onsubmit={add}>
    <label class="field grow">ชื่อสกิล<input type="text" maxlength="40" bind:value={name} placeholder="เช่น ขับยาน" /></label>
    <label class="field narrow">ค่าพลัง<select aria-label="ค่าพลัง" bind:value={ability}>
      {#each ABILITY_KEYS as a (a)}<option value={a}>{ABILITY_TH[a].short}</option>{/each}
    </select></label>
    <button class="btn small" type="submit" disabled={!name.trim()}>เพิ่ม</button>
  </form>
  <label class="check"><input type="checkbox" checked={current.allowPlayerSkills}
    onchange={(e) => save({ ...current, allowPlayerSkills: e.currentTarget.checked })} /> ให้ผู้เล่นเพิ่มสกิลส่วนตัวในชีทตัวเองได้</label>
</details>
