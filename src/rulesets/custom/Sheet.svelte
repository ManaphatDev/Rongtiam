<script lang="ts">
  import type { SheetProps } from '../core/types';
  import { viewCustom } from './index';

  let { data, ctx, editable, isGM, patch, roll }: SheetProps = $props();

  const v = $derived(viewCustom(data, ctx));
  const t = $derived(v.t);
  const c = $derived(v.c);
  const d = $derived(v.d);
  let addRow = $state<Record<string, string>>({});
  const rowId = () => crypto.randomUUID().slice(0, 8);
</script>

<div class="sheet custom">
  <section class="sheet-head" aria-label="ข้อมูลตัวละคร">
    <label class="field grow">ชื่อ<input type="text" maxlength="60" value={c.name} disabled={!editable}
      oninput={(e) => patch(['name'], e.currentTarget.value, 400)} /></label>
    <p class="hint">ระบบ: {t.name}</p>
  </section>

  {#if d.bars.length}
    <section class="stat-row" aria-label="แถบค่า">
      {#each d.bars as b (b.label)}
        <div class="stat"><span>{b.label}</span><b>{b.current}</b><small>/ {b.max}</small></div>
      {/each}
    </section>
  {/if}

  {#each t.sections as s (s.id)}
    {@const fields = t.fields.filter((f) => f.section === s.id)}
    {@const rolls = t.rolls.filter((r) => r.section === s.id)}
    {#if fields.length || rolls.length}
      <section class="block" aria-label={s.label}>
        <h3>{s.label}</h3>
        <div class="custom-fields">
          {#each fields as f (f.key)}
            {#if f.kind === 'number'}
              <label class="field">{f.label}<input type="number" value={c.values[f.key] ?? f.default ?? 0} disabled={!editable}
                onchange={(e) => patch(['values', f.key], Number(e.currentTarget.value) || 0)} /></label>
            {:else if f.kind === 'text'}
              <label class="field">{f.label}<input type="text" maxlength="400" value={String(c.values[f.key] ?? f.default ?? '')} disabled={!editable}
                oninput={(e) => patch(['values', f.key], e.currentTarget.value, 400)} /></label>
            {:else if f.kind === 'choice'}
              {@const cat = t.catalogs.find((k) => k.key === f.catalog)}
              <label class="field">{f.label}<select aria-label={f.label} value={String(c.values[f.key] ?? f.default ?? '')} disabled={!editable}
                onchange={(e) => patch(['values', f.key], e.currentTarget.value || null)}>
                <option value="">—</option>
                {#each cat?.items ?? [] as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
              </select></label>
            {:else}
              <div class="field computed">
                <span>{f.label}</span>
                <b>{d.values[f.key]}</b>
                {#if d.errors[f.key]}<small class="err" role="note">{d.errors[f.key]}</small>{/if}
              </div>
            {/if}
          {/each}
        </div>
        {#if rolls.length}
          <div class="row">
            {#each d.rolls.filter((r) => rolls.some((x) => x.id === r.id)) as r (r.id)}
              <button class="btn small" onclick={() => roll(r.label, r.expr)}>{r.label} <small>{r.expr}</small></button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/each}

  {#if t.skills}
    {@const stats = t.fields.filter((f) => f.kind === 'number' || f.kind === 'formula')}
    <section class="block" aria-label="สกิล">
      <h3>สกิล</h3>
      <ul class="skills">
        {#each d.skills as sk (sk.id)}
          {@const own = sk.source === 'own'}
          {@const idx = own ? c.customSkills.findIndex((x) => `own:${x.id}` === sk.id) : -1}
          <li class:own>
            <input type="number" class="skill-rank" aria-label={`ระดับ ${sk.label}`} value={sk.rank} disabled={!editable}
              onchange={(e) => patch(own ? ['customSkills', idx, 'rank'] : ['skillRanks', sk.id], Number(e.currentTarget.value) || 0)} />
            {#if own && editable}
              <input class="skill-name" type="text" maxlength="40" aria-label="ชื่อสกิลส่วนตัว" value={sk.label}
                oninput={(e) => patch(['customSkills', idx, 'label'], e.currentTarget.value, 400)} />
              <select class="skill-ability" aria-label={`ค่าพลังของ ${sk.label}`} value={sk.stat}
                onchange={(e) => patch(['customSkills', idx, 'stat'], e.currentTarget.value)}>
                {#each stats as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
              </select>
            {:else}
              <span class="nm">{sk.label} <small>({stats.find((f) => f.key === sk.stat)?.label ?? sk.stat}{own ? ' · ส่วนตัว' : ''})</small></span>
            {/if}
            <button class="btn small" onclick={() => roll(sk.label, sk.expr)}>{sk.expr}</button>
            {#if own && editable}
              <button class="btn small" aria-label={`ลบสกิล ${sk.label}`} onclick={() => patch(['customSkills'], c.customSkills.filter((_, j) => j !== idx))}>✕</button>
            {/if}
          </li>
        {/each}
      </ul>
      {#each Object.entries(d.errors).filter(([k]) => k.startsWith('skill:')) as [k, msg] (k)}<p class="hint err">{msg}</p>{/each}
      {#if editable && (isGM || t.skills.allowPlayerSkills) && stats.length}
        <button class="btn small" onclick={() => patch(['customSkills'], [...c.customSkills, { id: crypto.randomUUID().slice(0, 8), label: 'สกิลใหม่', stat: stats[0].key, rank: 0 }])}>เพิ่มสกิลส่วนตัว</button>
      {/if}
    </section>
  {/if}

  {#each t.lists as list (list.key)}
    {@const cat = list.catalog ? t.catalogs.find((k) => k.key === list.catalog) : undefined}
    {@const rows = c.lists[list.key] ?? []}
    <section class="block" aria-label={list.label}>
      <h3>{list.label}</h3>
      <ul class="inventory">
        {#each rows as row, i (row.id)}
          {@const item = cat?.items.find((x) => x.id === row.item)}
          {@const r = d.rolls.find((x) => x.id === `${list.key}:${row.id}`)}
          <li>
            {#if item}<span class="nm">{item.name}</span>
            {:else}
              <input type="text" aria-label="ชื่อ" maxlength="60" value={row.name ?? ''} disabled={!editable}
                oninput={(e) => patch(['lists', list.key, i, 'name'], e.currentTarget.value, 400)} />
            {/if}
            {#if r}<button class="btn small" onclick={() => roll(r.label, r.expr)}>{list.roll?.label} <small>{r.expr}</small></button>{/if}
            {#if d.errors[`${list.key}:${row.id}`]}<small class="err">{d.errors[`${list.key}:${row.id}`]}</small>{/if}
            {#if editable}
              <button class="btn small" aria-label="เอาออก" onclick={() => patch(['lists', list.key], rows.filter((_, j) => j !== i))}>✕</button>
            {/if}
          </li>
        {:else}
          <li class="emptyline">ยังไม่มี</li>
        {/each}
      </ul>
      {#if editable}
        <div class="row">
          {#if cat}
            <select aria-label={`เพิ่มใน${list.label}`} value={addRow[list.key] ?? ''} onchange={(e) => (addRow = { ...addRow, [list.key]: e.currentTarget.value })}>
              <option value="">เลือกจาก{cat.label}…</option>
              {#each cat.items as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
            </select>
            <button class="btn small" disabled={!addRow[list.key]}
              onclick={() => { patch(['lists', list.key], [...rows, { id: rowId(), item: addRow[list.key], values: {} }]); addRow = { ...addRow, [list.key]: '' }; }}>เพิ่ม</button>
          {:else}
            <button class="btn small" onclick={() => patch(['lists', list.key], [...rows, { id: rowId(), name: '', values: {} }])}>เพิ่มแถว</button>
          {/if}
        </div>
      {/if}
    </section>
  {/each}

  <label class="field block">บันทึก<textarea rows="6" maxlength="20000" value={c.notes} disabled={!editable}
    oninput={(e) => patch(['notes'], e.currentTarget.value, 600)}></textarea></label>
</div>
