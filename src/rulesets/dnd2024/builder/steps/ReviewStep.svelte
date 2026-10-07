<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { derive } from '../../derive';
  import { ABILITIES, ABILITY_TH, BACKGROUNDS_TH, CLASSES_TH, SKILLS, SPECIES_TH, type Skill } from '../../i18n/th';
  import { build } from '../build';
  import type { Draft } from '../draft';
  import { validate, type StepId } from '../validate';

  let { draft, srd, onjump }: { draft: Draft; srd: Srd; onjump: (step: StepId) => void } = $props();

  const STEP_LABEL: Record<StepId, string> = {
    class: 'อาชีพ', background: 'ฉากหลัง', species: 'เผ่า', languages: 'ภาษา', scores: 'ค่าพลัง',
    equipment: 'อุปกรณ์', spells: 'เวท', details: 'รายละเอียด',
  };
  const issues = $derived(validate(draft, srd));
  const c = $derived.by(() => {
    if (issues.length) return null;
    try {
      return build($state.snapshot(draft) as Draft, srd);
    } catch {
      return null;
    }
  });
  const d = $derived(c ? derive(c, srd) : null);
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const spellName = (k: string) => srd.spells.find((s) => s.key === k)?.name ?? k;
</script>

{#if issues.length}
  <p class="hint err" role="status">ยังสร้างไม่ได้ เหลือ {issues.length} ข้อที่ต้องแก้:</p>
  <ul class="plain-list">
    {#each issues as i, n (n)}
      <li>
        <span class="nm">{i.message}</span>
        <button type="button" class="btn small" onclick={() => onjump(i.step)}>ไปที่ขั้น{STEP_LABEL[i.step]}</button>
      </li>
    {/each}
  </ul>
{:else if c && d}
  <h4>{c.name} <small class="hint">{CLASSES_TH[c.classKey] ?? c.classKey} · {SPECIES_TH[c.species] ?? c.species} · {BACKGROUNDS_TH[c.background] ?? c.background} · เลเวล 1</small></h4>
  <section class="stat-row" aria-label="สรุปค่า">
    <div class="stat"><span>AC</span><b>{d.ac}</b></div>
    <div class="stat"><span>HP</span><b>{d.maxHp}</b></div>
    <div class="stat"><span>ความเร็ว</span><b>{d.speed}</b><small>ฟุต</small></div>
    <div class="stat"><span>โบนัสความชำนาญ</span><b>{signed(d.pb)}</b></div>
    <div class="stat"><span>Initiative</span><b>{signed(d.initiative)}</b></div>
  </section>
  <section class="stat-row" aria-label="ค่าพลัง">
    {#each ABILITIES as a (a)}
      <div class="stat"><span>{ABILITY_TH[a].short}</span><b>{c.abilities[a]}</b><small>{signed(d.mods[a])}</small></div>
    {/each}
  </section>
  <p>เซฟที่ชำนาญ: {ABILITIES.filter((a) => d.saves[a].proficient).map((a) => `${ABILITY_TH[a].name} ${signed(d.saves[a].bonus)}`).join(', ')}</p>
  <p>สกิลที่ชำนาญ: {(Object.keys(SKILLS) as Skill[]).filter((s) => d.skills[s].rank > 0)
    .map((s) => `${SKILLS[s].th} ${signed(d.skills[s].bonus)}${d.skills[s].rank === 2 ? ' (เชี่ยวชาญ)' : ''}`).join(', ')}</p>
  {#if d.spellcasting}
    <p>เวท: DC {d.spellcasting.dc}, โจมตี {signed(d.spellcasting.attack)} — {c.spells.known.map(spellName).join(', ')}</p>
  {/if}
  <p>ภาษา: {c.languages.join(', ')}{c.tools.length ? ` · เครื่องมือ: ${c.tools.join(', ')}` : ''}</p>
  <p>เงิน: {c.money.gp} GP · อุปกรณ์: {[...c.weapons.map((k) => srd.weapons.find((w) => w.key === k)?.name ?? k), ...c.inventory.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name))].join(', ')}</p>
  <p class="hint">
    ระบบยังไม่คำนวณผลของ feat และลักษณะเผ่าบางอย่างให้ (เช่น โบนัสของ Alert หรือ Dwarven Toughness)
    รายละเอียดทั้งหมดอยู่ในช่อง "ความสามารถและ feat" บนชีท ถ้าต้องแก้ตัวเลข ใช้ช่อง "ค่าที่กำหนดเอง"
  </p>
{/if}
