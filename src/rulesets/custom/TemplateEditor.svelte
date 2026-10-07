<script lang="ts">
  // GM editor for the custom ruleset's template: the game system itself, stored as room content.
  import { untrack } from 'svelte';
  import { z } from 'zod';
  import type { RoomStore } from '../../sync/room.svelte';
  import TwoStepButton from '../../ui/TwoStepButton.svelte';
  import { templateOf, TEMPLATE_KEY, TEMPLATE_KIND } from './index';
  import { STARTER_TEMPLATE, TemplateZ, type CustomTemplate } from './model';
  import type { RulesetContext } from '../core/types';

  let { store, ctx, onclose }: { store: RoomStore; ctx: RulesetContext; onclose: () => void } = $props();

  // A deep copy the GM edits freely, taken once (a save by someone else meanwhile doesn't overwrite the draft);
  // it is validated and saved as a whole.
  let t = $state<CustomTemplate>(structuredClone(untrack(() => $state.snapshot(templateOf(ctx))) as CustomTemplate));
  let problems = $state<string[]>([]);
  let saved = $state(false);
  let importInput = $state<HTMLInputElement>();
  let panel = $state<HTMLElement>();

  $effect(() => panel?.focus());

  const KINDS = [
    { v: 'number', label: 'ตัวเลข' }, { v: 'text', label: 'ข้อความ' }, { v: 'formula', label: 'สูตร' }, { v: 'choice', label: 'เลือกจากคลัง' },
  ] as const;
  const COL_KINDS = [{ v: 'number', label: 'ตัวเลข' }, { v: 'text', label: 'ข้อความ' }, { v: 'formula', label: 'สูตร' }] as const;

  /** A fresh key that doesn't clash (keys are what formulas use: @key). */
  const freshKey = (prefix: string, taken: string[]) => {
    for (let i = taken.length + 1; ; i++) if (!taken.includes(`${prefix}${i}`)) return `${prefix}${i}`;
  };
  function move<T>(list: T[], i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  }
  const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z_]/, '_').slice(0, 31);

  function describe(issue: z.core.$ZodIssue) {
    const where = issue.path.map((p) => (typeof p === 'number' ? `#${p + 1}` : String(p))).join(' › ');
    return `${where || 'แม่แบบ'}: ${issue.message}`;
  }

  async function save() {
    saved = false;
    const r = TemplateZ.safeParse($state.snapshot(t));
    if (!r.success) {
      problems = r.error.issues.map(describe);
      return;
    }
    // Catch references to fields that don't exist before players hit them.
    const keys = new Set(r.data.fields.map((f) => f.key));
    const missing = [
      ...r.data.fields.filter((f) => f.kind === 'choice' && !r.data.catalogs.some((c) => c.key === f.catalog)).map((f) => `ช่อง ${f.label}: ยังไม่ได้เลือกคลัง`),
      ...r.data.bars.filter((b) => !keys.has(b.current)).map((b) => `แถบ ${b.label}: ไม่มีช่อง ${b.current}`),
    ];
    if (missing.length) {
      problems = missing;
      return;
    }
    problems = [];
    await store.saveContent(TEMPLATE_KIND, TEMPLATE_KEY, r.data as unknown as Record<string, unknown>);
    saved = true;
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'tabletop-template', template: $state.snapshot(t) }, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `${t.name.replace(/[\\/:*?"<>|]+/g, '_') || 'template'}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile(f: File) {
    try {
      const raw = JSON.parse(await f.text());
      const r = TemplateZ.safeParse(raw?.format === 'tabletop-template' ? raw.template : raw);
      if (!r.success) {
        problems = ['ไฟล์นี้ไม่ใช่แม่แบบที่ใช้ได้', ...r.error.issues.slice(0, 5).map(describe)];
        return;
      }
      t = r.data;
      problems = [];
    } catch {
      problems = ['อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ .json'];
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="sheet-panel overlay-ui tpl" aria-label="แก้แม่แบบชีท" tabindex="-1" bind:this={panel}
  onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onclose(); } }}>
  <header class="sheet-bar">
    <h2>แม่แบบชีท: {t.name}</h2>
    <button class="btn small" onclick={onclose} aria-label="ปิดตัวแก้แม่แบบ">ปิด</button>
  </header>

  <div class="sheet-body">
    <p class="hint">ออกแบบระบบเกมของคุณเอง: ช่องข้อมูล สูตรคำนวณ ปุ่มทอย และคลังของ (เช่น อาชีพ อาวุธ) ให้ผู้เล่นเลือก
      สูตรอ้างถึงช่องอื่นด้วย <b>@คีย์</b> เช่น <b>1d20 + @might</b> อ้างถึงค่าในคลังที่เลือกด้วย <b>@คีย์ช่อง.คีย์คอลัมน์</b>
      และในรายการใช้ <b>@row.คีย์คอลัมน์</b></p>

    <label class="field">ชื่อระบบ<input type="text" maxlength="60" bind:value={t.name} /></label>

    <section class="block" aria-label="หมวด">
      <h3>หมวดในชีท</h3>
      {#each t.sections as s, i (i)}
        <div class="row">
          <label class="field grow">ชื่อหมวด<input type="text" maxlength="40" bind:value={s.label} /></label>
          <button class="btn small" aria-label={`ย้าย ${s.label} ขึ้น`} onclick={() => move(t.sections, i, -1)}>↑</button>
          <button class="btn small" aria-label={`ลบหมวด ${s.label}`} disabled={t.sections.length < 2} onclick={() => t.sections.splice(i, 1)}>✕</button>
        </div>
      {/each}
      <button class="btn small" onclick={() => t.sections.push({ id: freshKey('s', t.sections.map((s) => s.id)), label: 'หมวดใหม่' })}>เพิ่มหมวด</button>
    </section>

    <section class="block" aria-label="ช่องข้อมูล">
      <h3>ช่องข้อมูล</h3>
      {#each t.fields as f, i (i)}
        <fieldset class="tpl-row">
          <legend>{f.label || f.key}</legend>
          <label class="field">ชื่อที่แสดง<input type="text" maxlength="40" bind:value={f.label} /></label>
          <label class="field narrow">คีย์ (@)<input type="text" maxlength="31" value={f.key} onchange={(e) => (f.key = keyOf(e.currentTarget.value))} /></label>
          <label class="field">ชนิด<select aria-label="ชนิด" bind:value={f.kind}>{#each KINDS as k (k.v)}<option value={k.v}>{k.label}</option>{/each}</select></label>
          <label class="field">หมวด<select aria-label="หมวด" bind:value={f.section}>{#each t.sections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select></label>
          {#if f.kind === 'formula'}
            <label class="field grow">สูตร<input type="text" maxlength="400" value={f.formula ?? ''} oninput={(e) => (f.formula = e.currentTarget.value)} placeholder="เช่น 10 + @might * 2" /></label>
          {:else if f.kind === 'choice'}
            <label class="field">คลัง<select aria-label="คลัง" value={f.catalog ?? ''} onchange={(e) => (f.catalog = e.currentTarget.value || undefined)}>
              <option value="">เลือก…</option>{#each t.catalogs as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
            </select></label>
          {:else}
            <label class="field narrow">ค่าเริ่มต้น<input type={f.kind === 'number' ? 'number' : 'text'} value={f.default ?? ''}
              onchange={(e) => (f.default = f.kind === 'number' ? Number(e.currentTarget.value) || 0 : e.currentTarget.value)} /></label>
          {/if}
          <div class="row">
            <button class="btn small" aria-label={`ย้าย ${f.label} ขึ้น`} onclick={() => move(t.fields, i, -1)}>↑</button>
            <button class="btn small" aria-label={`ย้าย ${f.label} ลง`} onclick={() => move(t.fields, i, 1)}>↓</button>
            <button class="btn small" aria-label={`ลบช่อง ${f.label}`} onclick={() => t.fields.splice(i, 1)}>✕</button>
          </div>
        </fieldset>
      {/each}
      <button class="btn small" onclick={() => t.fields.push({ key: freshKey('f', t.fields.map((f) => f.key)), label: 'ช่องใหม่', kind: 'number', default: 0, section: t.sections[0].id })}>เพิ่มช่อง</button>
    </section>

    <section class="block" aria-label="คลังของ">
      <h3>คลังของ (เช่น อาชีพ อาวุธ เวท)</h3>
      {#each t.catalogs as c, ci (ci)}
        <fieldset class="tpl-row">
          <legend>{c.label}</legend>
          <label class="field">ชื่อคลัง<input type="text" maxlength="40" bind:value={c.label} /></label>
          <label class="field narrow">คีย์<input type="text" value={c.key} onchange={(e) => (c.key = keyOf(e.currentTarget.value))} /></label>
          <button class="btn small" aria-label={`ลบคลัง ${c.label}`} onclick={() => t.catalogs.splice(ci, 1)}>✕</button>
          <div class="tpl-sub">
            <b>คอลัมน์</b>
            {#each c.columns as col, k (k)}
              <div class="row">
                <label class="field">ชื่อ<input type="text" maxlength="40" bind:value={col.label} /></label>
                <label class="field narrow">คีย์<input type="text" value={col.key} onchange={(e) => (col.key = keyOf(e.currentTarget.value))} /></label>
                <label class="field">ชนิด<select aria-label="ชนิดคอลัมน์" bind:value={col.kind}>{#each COL_KINDS as kk (kk.v)}<option value={kk.v}>{kk.label}</option>{/each}</select></label>
                <button class="btn small" aria-label={`ลบคอลัมน์ ${col.label}`} onclick={() => c.columns.splice(k, 1)}>✕</button>
              </div>
            {/each}
            <button class="btn small" onclick={() => c.columns.push({ key: freshKey('c', c.columns.map((x) => x.key)), label: 'คอลัมน์', kind: 'number' })}>เพิ่มคอลัมน์</button>
          </div>
          <div class="tpl-sub">
            <b>รายการในคลัง</b>
            {#each c.items as item, k (k)}
              <div class="row">
                <label class="field">ชื่อ<input type="text" maxlength="60" bind:value={item.name} /></label>
                {#each c.columns as col (col.key)}
                  <label class="field narrow">{col.label}<input type={col.kind === 'number' ? 'number' : 'text'} value={item.values[col.key] ?? ''}
                    onchange={(e) => (item.values[col.key] = col.kind === 'number' ? Number(e.currentTarget.value) || 0 : e.currentTarget.value)} /></label>
                {/each}
                <button class="btn small" aria-label={`ลบ ${item.name}`} onclick={() => c.items.splice(k, 1)}>✕</button>
              </div>
            {/each}
            <button class="btn small" onclick={() => c.items.push({ id: freshKey('i', c.items.map((x) => x.id)), name: 'ของใหม่', values: {} })}>เพิ่มรายการ</button>
          </div>
        </fieldset>
      {/each}
      <button class="btn small" onclick={() => t.catalogs.push({ key: freshKey('cat', t.catalogs.map((c) => c.key)), label: 'คลังใหม่', columns: [], items: [] })}>เพิ่มคลัง</button>
    </section>

    <section class="block" aria-label="รายการของตัวละคร">
      <h3>รายการที่ตัวละครพกติดตัว</h3>
      {#each t.lists as l, i (i)}
        <div class="row">
          <label class="field">ชื่อ<input type="text" maxlength="40" bind:value={l.label} /></label>
          <label class="field narrow">คีย์<input type="text" value={l.key} onchange={(e) => (l.key = keyOf(e.currentTarget.value))} /></label>
          <label class="field">เลือกจากคลัง<select aria-label="เลือกจากคลัง" value={l.catalog ?? ''} onchange={(e) => (l.catalog = e.currentTarget.value || undefined)}>
            <option value="">พิมพ์เอง</option>{#each t.catalogs as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
          </select></label>
          <label class="field">ปุ่มทอยต่อแถว<input type="text" maxlength="40" value={l.roll?.label ?? ''} placeholder="เช่น โจมตี"
            onchange={(e) => (l.roll = e.currentTarget.value ? { label: e.currentTarget.value, expr: l.roll?.expr ?? '1d20' } : undefined)} /></label>
          {#if l.roll}<label class="field grow">สูตรทอย<input type="text" maxlength="400" value={l.roll.expr} placeholder="เช่น @row.damage"
            onchange={(e) => (l.roll = { label: l.roll!.label, expr: e.currentTarget.value })} /></label>{/if}
          <button class="btn small" aria-label={`ลบรายการ ${l.label}`} onclick={() => t.lists.splice(i, 1)}>✕</button>
        </div>
      {/each}
      <button class="btn small" onclick={() => t.lists.push({ key: freshKey('list', t.lists.map((l) => l.key)), label: 'รายการใหม่' })}>เพิ่มรายการ</button>
    </section>

    <section class="block" aria-label="สกิล">
      <h3>สกิล</h3>
      <label class="check"><input type="checkbox" checked={!!t.skills}
        onchange={(e) => (t.skills = e.currentTarget.checked ? { roll: '1d20 + @stat + @rank', allowPlayerSkills: true, list: [] } : undefined)} /> ใช้ระบบสกิล</label>
      {#if t.skills}
        <label class="field">สูตรทอยสกิล (@stat = ค่าพลังของสกิล, @rank = ระดับ)<input type="text" maxlength="400" bind:value={t.skills.roll} /></label>
        <label class="check"><input type="checkbox" bind:checked={t.skills.allowPlayerSkills} /> ให้ผู้เล่นเพิ่มสกิลส่วนตัวในชีทตัวเองได้</label>
        {#each t.skills.list as s, i (i)}
          <div class="row">
            <label class="field">ชื่อสกิล<input type="text" maxlength="40" bind:value={s.label} /></label>
            <label class="field narrow">คีย์<input type="text" value={s.key} onchange={(e) => (s.key = keyOf(e.currentTarget.value))} /></label>
            <label class="field">ใช้ค่าพลัง<select aria-label="ใช้ค่าพลัง" bind:value={s.stat}>
              {#each t.fields.filter((f) => f.kind === 'number' || f.kind === 'formula') as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
            </select></label>
            <button class="btn small" aria-label={`ลบสกิล ${s.label}`} onclick={() => t.skills!.list.splice(i, 1)}>✕</button>
          </div>
        {/each}
        <button class="btn small" onclick={() => t.skills!.list.push({ key: freshKey('sk', t.skills!.list.map((s) => s.key)), label: 'สกิลใหม่', stat: t.fields.find((f) => f.kind === 'number')?.key ?? '' })}>เพิ่มสกิล</button>
      {/if}
    </section>

    <section class="block" aria-label="ปุ่มทอย">
      <h3>ปุ่มทอย</h3>
      {#each t.rolls as r, i (i)}
        <div class="row">
          <label class="field">ชื่อปุ่ม<input type="text" maxlength="40" bind:value={r.label} /></label>
          <label class="field grow">สูตร<input type="text" maxlength="400" bind:value={r.expr} /></label>
          <label class="field">หมวด<select aria-label="หมวดของปุ่ม" bind:value={r.section}>{#each t.sections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select></label>
          <button class="btn small" aria-label={`ลบปุ่ม ${r.label}`} onclick={() => t.rolls.splice(i, 1)}>✕</button>
        </div>
      {/each}
      <button class="btn small" onclick={() => t.rolls.push({ id: freshKey('r', t.rolls.map((r) => r.id)), label: 'ทอย', expr: '1d20', section: t.sections[0].id })}>เพิ่มปุ่มทอย</button>
    </section>

    <section class="block" aria-label="แถบบนโทเคนและสถานะ">
      <h3>แถบบนโทเคน (ตัวแรกคือ HP ที่รับความเสียหาย)</h3>
      {#each t.bars as b, i (i)}
        <div class="row">
          <label class="field">ชื่อ<input type="text" maxlength="40" bind:value={b.label} /></label>
          <label class="field">ค่าปัจจุบันจากช่อง<select aria-label="ค่าปัจจุบันจากช่อง" bind:value={b.current}>
            {#each t.fields.filter((f) => f.kind === 'number') as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
          </select></label>
          <label class="field">สูงสุด (คีย์หรือสูตร)<input type="text" maxlength="400" bind:value={b.max} /></label>
          <label class="field narrow">สี<input type="color" bind:value={b.color} /></label>
          <button class="btn small" aria-label={`ลบแถบ ${b.label}`} onclick={() => t.bars.splice(i, 1)}>✕</button>
        </div>
      {/each}
      {#if t.bars.length < 4}
        <button class="btn small" onclick={() => t.bars.push({ label: 'แถบ', current: t.fields.find((f) => f.kind === 'number')?.key ?? '', max: '10', color: '#3e8ef7' })}>เพิ่มแถบ</button>
      {/if}
      <h3>สถานะ</h3>
      {#each t.conditions as c, i (i)}
        <div class="row">
          <label class="field narrow">ไอคอน<input type="text" maxlength="8" bind:value={c.icon} /></label>
          <label class="field">ชื่อ<input type="text" maxlength="40" bind:value={c.label} /></label>
          <button class="btn small" aria-label={`ลบสถานะ ${c.label}`} onclick={() => t.conditions.splice(i, 1)}>✕</button>
        </div>
      {/each}
      <button class="btn small" onclick={() => t.conditions.push({ key: freshKey('cond', t.conditions.map((c) => c.key)), label: 'สถานะใหม่', icon: '⭐' })}>เพิ่มสถานะ</button>
      <h3>Initiative</h3>
      <div class="row">
        <label class="field grow">สูตรทอย<input type="text" maxlength="400" value={t.initiative?.expr ?? ''} placeholder="เช่น 1d20 + @agility"
          onchange={(e) => (t.initiative = e.currentTarget.value ? { expr: e.currentTarget.value, tie: t.initiative?.tie } : undefined)} /></label>
        <label class="field">ตัดสินเมื่อเสมอ<input type="text" maxlength="400" value={t.initiative?.tie ?? ''} placeholder="เช่น @agility"
          onchange={(e) => t.initiative && (t.initiative.tie = e.currentTarget.value || undefined)} /></label>
      </div>
    </section>

    {#if problems.length}
      <div class="block err-list" role="alert">
        <b>ยังบันทึกไม่ได้ แก้ตรงนี้ก่อน:</b>
        <ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul>
      </div>
    {/if}
  </div>

  <footer class="sheet-bar">
    <button class="btn primary" onclick={save}>บันทึกแม่แบบ</button>
    {#if saved}<span class="hint" role="status">บันทึกแล้ว ทุกคนในห้องใช้แม่แบบนี้ทันที</span>{/if}
    <button class="btn small" onclick={download}>ส่งออก</button>
    <button class="btn small" onclick={() => importInput?.click()}>นำเข้า</button>
    <input type="file" accept=".json,application/json" hidden bind:this={importInput}
      onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void importFile(f); }} />
    <TwoStepButton label="เริ่มใหม่จากตัวอย่าง" onconfirm={() => (t = structuredClone(STARTER_TEMPLATE))} />
  </footer>
</section>
