<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { derive } from '../../derive';
  import type { D2024 } from '../../model';
  import type { LevelDraft } from '../draft';
  import { classOfChar, type LevelStepId } from '../steps';
  import type { LevelIssue } from '../validate';

  let { c, draft, srd, issues, labels, onjump }: {
    c: D2024; draft: LevelDraft; srd: Srd; issues: LevelIssue[]; labels: Record<LevelStepId, string>;
    onjump: (step: LevelStepId) => void;
  } = $props();

  const next = $derived(c.level + 1);
  const cls = $derived(classOfChar(c, srd));
  const sub = $derived(cls?.subclasses.find((s) => s.key === (c.subclass ?? (next === 3 ? cls?.subclasses[0]?.key : null))));
  const features = $derived([...(cls?.features ?? []), ...(sub?.features ?? [])].filter((f) => f.levels.includes(next)));
  const hp = $derived(derive(c, srd).maxHp);
  const others = $derived(issues.filter((i) => i.step !== 'review'));
</script>

<p>เลเวล {c.level} → <b>{next}</b> · HP สูงสุดตอนนี้ {hp}</p>
{#if features.length}
  <h4>ฟีเจอร์ที่ได้ในเลเวล {next}</h4>
  {#each features as f (f.name)}
    <details><summary>{f.name}</summary><p class="hint">{f.desc}</p></details>
  {/each}
{/if}
<p class="hint">ระบบยังไม่คำนวณผลของฟีเจอร์ให้ (เช่น Extra Attack) รายละเอียดจะอยู่ในช่อง "ความสามารถและ feat" บนชีท</p>
{#if others.length}
  <p class="hint err">ยังขึ้นเลเวลไม่ได้ เหลือ {others.length} ข้อที่ต้องแก้:</p>
  <ul>
    {#each others as i, n (n)}
      <li><button class="btn small" type="button" onclick={() => onjump(i.step)}>ไปที่ขั้น{labels[i.step]}</button> {i.message}</li>
    {/each}
  </ul>
{/if}
