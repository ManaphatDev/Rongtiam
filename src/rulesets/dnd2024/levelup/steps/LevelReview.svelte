<script lang="ts">
  import type { Srd } from '../../data/schema';
  import { derive } from '../../derive';
  import { ABILITIES, ABILITY_TH, SKILLS, type Skill } from '../../i18n/th';
  import type { D2024 } from '../../model';
  import { levelUp } from '../apply';
  import type { LevelDraft } from '../draft';
  import { classOfChar, type LevelStepId } from '../steps';
  import type { LevelIssue } from '../validate';

  let { c, srd, draft, isGM, issues, labels, onjump }: {
    c: D2024; srd: Srd; draft: LevelDraft; isGM: boolean; issues: LevelIssue[]; labels: Record<LevelStepId, string>;
    onjump: (step: LevelStepId) => void;
  } = $props();

  const next = $derived(c.level + 1);
  const cls = $derived(classOfChar(c, srd));
  const sub = $derived(cls?.subclasses.find((s) => s.key === (c.subclass ?? (next === 3 ? cls?.subclasses[0]?.key : null))));
  const features = $derived([...(cls?.features ?? []), ...(sub?.features ?? [])].filter((f) => f.levels.includes(next)));
  const hp = $derived(derive(c, srd).maxHp);
  const others = $derived(issues.filter((i) => i.step !== 'review'));

  // What confirming would change, shown only when the draft is complete.
  const after = $derived.by(() => {
    if (issues.length) return null;
    try {
      return levelUp(c, $state.snapshot(draft) as LevelDraft, srd, isGM);
    } catch {
      return null;
    }
  });
  const summary = $derived.by(() => {
    if (!after) return null;
    const name = (k: string) => srd.feats.find((f) => f.key === k)?.name ?? k;
    return {
      hp: derive(after, srd).maxHp,
      scores: ABILITIES.filter((a) => after.abilities[a] !== c.abilities[a]),
      feats: after.feats.slice(c.feats.length).map(name),
      expertise: Object.entries(after.skills).filter(([k, r]) => r === 2 && c.skills[k as Skill] !== 2).map(([k]) => SKILLS[k as Skill]?.th ?? k),
    };
  });
</script>

<p>เลเวล {c.level} → <b>{next}</b> · HP สูงสุดตอนนี้ {hp}</p>
{#if after && summary}
  <h4>สรุปค่าที่เปลี่ยน</h4>
  <ul>
    <li>HP สูงสุด {hp} → {summary.hp}</li>
    {#each summary.scores as a (a)}<li>{ABILITY_TH[a].name} {c.abilities[a]} → {after.abilities[a]}</li>{/each}
    {#if summary.feats.length}<li>Feat: {summary.feats.join(', ')}</li>{/if}
    {#if summary.expertise.length}<li>Expertise: {summary.expertise.join(', ')}</li>{/if}
  </ul>
{/if}
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
