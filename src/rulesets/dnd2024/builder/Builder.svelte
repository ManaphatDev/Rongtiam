<script lang="ts">
  // The guided D&D 2024 character builder: nine steps over the table, a draft saved after every change, and one
  // createCharacter at the end. All the rules live in validate()/build(); this only shows them.
  import { tick } from 'svelte';
  import TwoStepButton from '../../../ui/TwoStepButton.svelte';
  import type { BuilderProps } from '../../core/types';
  import { getSrd } from '../index';
  import { ROLL_EXPR, pointBuyStart, scoresFromRoll } from './abilities';
  import { build } from './build';
  import { emptyDraft, type Draft } from './draft';
  import { needsSpellStep } from './helpers';
  import { clearDraft, loadDraft, saveDraft } from './persist';
  import BackgroundStep from './steps/BackgroundStep.svelte';
  import ClassStep from './steps/ClassStep.svelte';
  import DetailsStep from './steps/DetailsStep.svelte';
  import EquipmentStep from './steps/EquipmentStep.svelte';
  import LanguagesStep from './steps/LanguagesStep.svelte';
  import ReviewStep from './steps/ReviewStep.svelte';
  import ScoresStep from './steps/ScoresStep.svelte';
  import SpeciesStep from './steps/SpeciesStep.svelte';
  import SpellsStep from './steps/SpellsStep.svelte';
  import { validate, type StepId } from './validate';

  let { roomId, rollDice, onDone, onClose }: BuilderProps = $props();

  const srd = getSrd();
  // The room never changes while this panel is mounted, so the draft is loaded once, from the first roomId.
  // svelte-ignore state_referenced_locally
  const saved = loadDraft(roomId, srd);
  let draft = $state(saved.draft);
  let step = $state(saved.step);
  /** The furthest step visited: earlier steps can be revisited from the step list. */
  let reached = $state(saved.step);
  let busy = $state(false);
  let rolling = $state(false);
  let error = $state('');
  let panel = $state<HTMLElement>();
  let heading = $state<HTMLElement>();

  const ALL: { id: StepId | 'review'; label: string }[] = [
    { id: 'class', label: 'อาชีพ' }, { id: 'background', label: 'ฉากหลัง' }, { id: 'species', label: 'เผ่า' },
    { id: 'languages', label: 'ภาษา' }, { id: 'scores', label: 'ค่าพลัง' }, { id: 'equipment', label: 'อุปกรณ์' },
    { id: 'spells', label: 'เวท' }, { id: 'details', label: 'รายละเอียด' }, { id: 'review', label: 'ตรวจสอบ' },
  ];
  const steps = $derived(ALL.filter((s) => s.id !== 'spells' || needsSpellStep(draft, srd)));
  const at = $derived(Math.min(step, steps.length - 1));
  const current = $derived(steps[at].id);
  const all = $derived(validate(draft, srd));
  const mine = $derived(all.filter((i) => i.step === current));

  // The draft is saved on every change; the panel takes focus when it opens so keyboard users land in it.
  $effect(() => {
    saveDraft(roomId, { step, draft: $state.snapshot(draft) as Draft });
  });
  $effect(() => {
    panel?.focus();
  });

  function go(to: number) {
    step = Math.max(0, Math.min(to, steps.length - 1));
    reached = Math.max(reached, step);
    void tick().then(() => heading?.focus());
  }
  const jump = (id: StepId) => go(steps.findIndex((s) => s.id === id));

  async function rollScores() {
    if (rolling || draft.rolled) return;
    rolling = true;
    error = '';
    // Captured before the first await: the panel may be closed while the dice are still rolling, and the result
    // must still be kept (otherwise closing and reopening would buy a re-roll).
    const id = roomId;
    const startedOn = step;
    const target = draft;
    const apply = (d: Draft, rolled: number[]) => {
      d.rolled = rolled;
      d.scores = { method: 'roll', assign: {}, base: pointBuyStart() };
    };
    // A result without six totals is not a roll of ROLL_EXPR: keep nothing, so the player can throw again.
    const whole = (rolled: number[]) => rolled.length === 6;
    try {
      const final = await rollDice('ค่าพลัง', ROLL_EXPR, (result) => {
        // The result is final before the dice land: save it now (the screen only shows it after they land), so a
        // reload or closed tab mid-roll cannot buy a second roll.
        const rolled = scoresFromRoll(result);
        if (!whole(rolled)) return;
        const kept = $state.snapshot(target) as Draft;
        apply(kept, rolled);
        saveDraft(id, { step: startedOn, draft: kept });
      });
      const rolled = scoresFromRoll(final);
      if (!whole(rolled)) {
        error = 'ผลทอยไม่ครบ 6 ค่า ลองทอยใหม่';
        return;
      }
      apply(target, rolled);
      saveDraft(id, { step: startedOn, draft: $state.snapshot(target) as Draft });
    } catch {
      // the table already told the player the roll failed
    } finally {
      rolling = false;
    }
  }

  async function finish() {
    if (busy) return;
    busy = true;
    error = '';
    const id = roomId;
    try {
      const data = build($state.snapshot(draft) as Draft, srd) as unknown as Record<string, unknown>;
      if (await onDone(data)) clearDraft(id);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function discard() {
    clearDraft(roomId);
    draft = emptyDraft();
    step = 0;
    reached = 0;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="sheet-panel overlay-ui" aria-label="ตัวช่วยสร้างตัวละคร" tabindex="-1" bind:this={panel} onkeydown={onKey}>
  <header class="sheet-bar">
    <h2>สร้างตัวละคร D&amp;D</h2>
    <button class="btn small" type="button" onclick={onClose}>ปิด</button>
  </header>

  <nav aria-label="ขั้นตอน">
    <ol class="builder-steps">
      {#each steps as s, i (s.id)}
        <li aria-current={i === at ? 'step' : undefined}>
          <button type="button" disabled={i > reached} onclick={() => go(i)}>{i + 1}. {s.label}</button>
        </li>
      {/each}
    </ol>
  </nav>

  <div class="sheet-body">
    <div class="sheet builder">
      <h3 tabindex="-1" bind:this={heading}>{steps[at].label}</h3>
      {#if current === 'class'}<ClassStep bind:draft {srd} />
      {:else if current === 'background'}<BackgroundStep bind:draft {srd} />
      {:else if current === 'species'}<SpeciesStep bind:draft {srd} />
      {:else if current === 'languages'}<LanguagesStep bind:draft />
      {:else if current === 'scores'}<ScoresStep bind:draft {srd} {rolling} onroll={rollScores} />
      {:else if current === 'equipment'}<EquipmentStep bind:draft {srd} />
      {:else if current === 'spells'}<SpellsStep bind:draft {srd} />
      {:else if current === 'details'}<DetailsStep bind:draft />
      {:else}<ReviewStep {draft} {srd} onjump={jump} />
      {/if}
      {#if mine.length}
        <ul class="builder-issues" aria-live="polite">
          {#each mine as i, n (n)}<li>{i.message}</li>{/each}
        </ul>
      {/if}
    </div>
  </div>

  <footer class="sheet-bar">
    <button class="btn" type="button" disabled={at === 0} onclick={() => go(at - 1)}>ย้อนกลับ</button>
    {#if current === 'review'}
      <button class="btn primary" type="button" disabled={busy || all.length > 0} onclick={finish}>สร้างตัวละครนี้</button>
    {:else}
      <button class="btn primary" type="button" disabled={mine.length > 0} onclick={() => go(at + 1)}>ถัดไป</button>
    {/if}
    {#if error}<span class="hint err" role="status">{error}</span>{/if}
    <!-- Not while the dice are rolling: the result would land in a draft that was just wiped. -->
    {#if !rolling}<TwoStepButton label="ลบร่างและเริ่มใหม่" onconfirm={discard} />{/if}
  </footer>
</section>
