<script lang="ts">
  // The guided level-up: one level per mount (the host re-keys it by level), a draft saved after every change, and
  // one batch of sheet patches at the end. All rules live in validateLevel()/levelUp(); this only shows them.
  import { tick } from 'svelte';
  import type { LevelUpProps } from '../../core/types';
  import { srdFor } from '../homebrew/merge';
  import { parseCharacter } from '../model';
  import { diffOps, levelUp } from './apply';
  import type { LevelDraft } from './draft';
  import { loadLevelDraft, saveLevelDraft } from './persist';
  import { classOfChar, levelSteps, type LevelStepId } from './steps';
  import AsiStep from './steps/AsiStep.svelte';
  import BoonStep from './steps/BoonStep.svelte';
  import ClassPicksStep from './steps/ClassPicksStep.svelte';
  import HpStep from './steps/HpStep.svelte';
  import LevelReview from './steps/LevelReview.svelte';
  import SubclassStep from './steps/SubclassStep.svelte';
  import { validateLevel } from './validate';

  let { ctx, id, data, isGM, rollDice, apply, onClose }: LevelUpProps = $props();

  // svelte-ignore state_referenced_locally
  const srd = srdFor(ctx);
  // Mounted once per character and level (the host keys it), so the character being levelled is read once.
  // svelte-ignore state_referenced_locally
  const c = parseCharacter(data);
  const cls = classOfChar(c, srd);
  const next = c.level + 1;
  // svelte-ignore state_referenced_locally
  const saved = loadLevelDraft(id, next);
  let draft = $state(saved.draft);
  let step = $state(saved.step);
  let reached = $state(saved.step);
  let rolling = $state(false);
  let error = $state('');
  let panel = $state<HTMLElement>();
  let heading = $state<HTMLElement>();

  const LABELS: Record<LevelStepId, string> = {
    hp: 'HP', subclass: 'สายอาชีพ', asi: 'ค่าพลัง / feat', boon: 'Epic Boon', class: 'ความสามารถอาชีพ', review: 'ตรวจสอบ',
  };
  const steps = levelSteps(c, srd);
  const at = $derived(Math.min(step, steps.length - 1));
  const current = $derived(steps[at]);
  // The sheet as it is now (a GM may have changed it since this opened): what the review checks and what confirm applies.
  const fresh = $derived(parseCharacter(data));
  const all = $derived(validateLevel(fresh, draft, srd, isGM));
  const mine = $derived(all.filter((i) => i.step === current));
  const con = Math.floor((c.abilities.con - 10) / 2);

  $effect(() => {
    // While the dice roll, the stored draft already holds the decided result; the in-memory one doesn't yet.
    if (rolling) return;
    saveLevelDraft(id, next, { step, draft: $state.snapshot(draft) as LevelDraft });
  });
  $effect(() => {
    panel?.focus();
  });

  function go(to: number) {
    step = Math.max(0, Math.min(to, steps.length - 1));
    reached = Math.max(reached, step);
    void tick().then(() => heading?.focus());
  }
  const jump = (s: LevelStepId) => go(steps.indexOf(s));

  async function rollHp() {
    if (rolling || draft.hp.rolled !== null || !cls) return;
    rolling = true;
    error = '';
    // Captured before the first await: the panel may close while the dice roll, and the result must still be kept.
    const key = id;
    const startedOn = step;
    const target = draft;
    const die = cls.hitDie;
    const keep = (total: number) => total >= 1 && total <= die;
    // A roll that was decided (and stored) but whose dice never landed is still the roll.
    const restore = () => {
      const stored = loadLevelDraft(key, next).draft.hp;
      if (target.hp.rolled === null && stored.method === 'roll' && stored.rolled !== null) target.hp = stored;
    };
    try {
      const r = await rollDice('HP', `1d${die}`, (result) => {
        if (!keep(result.total)) return;
        const kept = $state.snapshot(target) as LevelDraft;
        kept.hp = { method: 'roll', rolled: result.total };
        saveLevelDraft(key, next, { step: startedOn, draft: kept });
      });
      if (keep(r.total)) target.hp = { method: 'roll', rolled: r.total };
      else error = 'ผลทอยผิดปกติ ลองทอยใหม่';
    } catch {
      // the table already told the player the roll failed
      restore();
    } finally {
      rolling = false;
    }
  }

  function confirm() {
    error = '';
    try {
      // The character as it is now, so the patches never overwrite what changed since this opened.
      const now = parseCharacter(data);
      if (now.level !== c.level) {
        error = 'ตัวละครเปลี่ยนเลเวลไปแล้ว ปิดแล้วเปิดตัวช่วยใหม่';
        return;
      }
      const n = levelUp(now, $state.snapshot(draft) as LevelDraft, srd, isGM);
      // The draft is kept: if the server refuses this level, the HP roll is still there. Drafts are keyed by level,
      // so a leftover one is never read for another level.
      apply(diffOps(now, n));
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="sheet-panel overlay-ui" aria-label="ตัวช่วยขึ้นเลเวล" tabindex="-1" bind:this={panel} onkeydown={onKey}>
  <header class="sheet-bar">
    <h2>{c.name || 'ตัวละคร'}: ขึ้นเลเวล {next}</h2>
    <button class="btn small" type="button" onclick={onClose}>ปิด</button>
  </header>

  <nav aria-label="ขั้นตอน">
    <ol class="builder-steps">
      {#each steps as s, i (s)}
        <li aria-current={i === at ? 'step' : undefined}>
          <button type="button" disabled={i > reached || rolling} onclick={() => go(i)}>{i + 1}. {LABELS[s]}</button>
        </li>
      {/each}
    </ol>
  </nav>

  <div class="sheet-body">
    <div class="sheet builder">
      <h3 tabindex="-1" bind:this={heading}>{LABELS[current]}</h3>
      {#if !cls}<p class="hint err">อาชีพบนชีทไม่อยู่ใน SRD แก้อาชีพบนชีทก่อน</p>
      {:else if current === 'hp'}<HpStep bind:draft hitDie={cls.hitDie} {con} {rolling} onroll={rollHp} />
      {:else if current === 'subclass'}<SubclassStep {cls} />
      {:else if current === 'asi'}<AsiStep bind:draft {c} {srd} />
      {:else if current === 'boon'}<BoonStep bind:draft {c} {srd} />
      {:else if current === 'class'}<ClassPicksStep bind:draft {c} {srd} />
      {:else}<LevelReview c={fresh} {srd} {draft} {isGM} issues={all} labels={LABELS} onjump={jump} />
      {/if}
      {#if mine.length}
        <ul class="builder-issues" aria-live="polite">
          {#each mine as i, n (n)}<li>{i.message}</li>{/each}
        </ul>
      {/if}
    </div>
  </div>

  <footer class="sheet-bar">
    <button class="btn" type="button" disabled={at === 0 || rolling} onclick={() => go(at - 1)}>ย้อนกลับ</button>
    {#if current === 'review'}
      <button class="btn primary" type="button" disabled={all.length > 0} onclick={confirm}>ยืนยันขึ้นเลเวล {next}</button>
    {:else}
      <button class="btn primary" type="button" disabled={mine.length > 0 || rolling} onclick={() => go(at + 1)}>ถัดไป</button>
    {/if}
    {#if error}<span class="hint err" role="status">{error}</span>{/if}
  </footer>
</section>
