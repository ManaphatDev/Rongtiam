<script lang="ts">
  // Renders one homebrew entry from field descriptors and shows zod's problems next to the fields they belong to.
  import Self from './HbForm.svelte';
  import type { Srd } from '../data/schema';
  import type { Field } from './fields';

  let { fields, data = $bindable(), srd, issues, prefix = '' }: {
    fields: Field[]; data: Record<string, unknown>; srd: Srd; issues: { path: string; message: string }[]; prefix?: string;
  } = $props();

  const at = (f: Field) => `${prefix}${f.path}`;
  const errs = (f: Field) => issues.filter((i) => i.path === at(f) || i.path.startsWith(`${at(f)}.`)).map((i) => i.message);
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  function setText(f: Field & { nullable?: boolean }, v: string) {
    data[f.path] = f.nullable && v.trim() === '' ? null : v;
  }
  function setInt(f: Field & { nullable?: boolean }, v: string) {
    data[f.path] = v === '' ? (f.nullable ? null : NaN) : Math.round(Number(v));
  }
  function setOne(f: Field & { nullable?: boolean }, v: string) {
    const was = data[f.path];
    data[f.path] = v === '' && f.nullable ? null : typeof was === 'number' ? Number(v) : v;
  }
  function toggle(f: Field, id: string) {
    const list = (data[f.path] as string[]) ?? [];
    data[f.path] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }
</script>

{#each fields as f (f.path)}
  {@const e = errs(f)}
  {#if f.k === 'text'}
    <label class="field">{f.label}<input type="text" maxlength={f.max} value={str(data[f.path])} aria-invalid={e.length > 0}
      oninput={(ev) => setText(f, ev.currentTarget.value)} /></label>
  {:else if f.k === 'area'}
    <label class="field">{f.label}<textarea rows="4" maxlength={f.max} value={str(data[f.path])} aria-invalid={e.length > 0}
      oninput={(ev) => setText(f, ev.currentTarget.value)}></textarea></label>
  {:else if f.k === 'int'}
    <label class="field narrow">{f.label}<input type="number" min={f.min} max={f.max} value={str(data[f.path])} aria-invalid={e.length > 0}
      onchange={(ev) => setInt(f, ev.currentTarget.value)} /></label>
  {:else if f.k === 'bool'}
    <label class="check"><input type="checkbox" checked={!!data[f.path]} onchange={(ev) => (data[f.path] = ev.currentTarget.checked)} /> {f.label}</label>
  {:else if f.k === 'one'}
    <label class="field">{f.label}<select value={str(data[f.path])} aria-invalid={e.length > 0} onchange={(ev) => setOne(f, ev.currentTarget.value)}>
      {#if f.nullable}<option value="">—</option>{/if}
      {#each f.options(srd) as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
    </select></label>
  {:else if f.k === 'many'}
    <fieldset class="pick-set"><legend>{f.label}</legend>
      <div class="pick-grid">
        {#each f.options(srd) as o (o.id)}
          <button type="button" class="chip" aria-pressed={((data[f.path] as string[]) ?? []).includes(o.id)} onclick={() => toggle(f, o.id)}>{o.label}</button>
        {/each}
      </div>
    </fieldset>
  {:else if f.k === 'rows'}
    {@const rows = (data[f.path] as Record<string, unknown>[]) ?? []}
    <fieldset class="pick-set"><legend>{f.label}</legend>
      {#each rows as _, i (i)}
        <div class="block">
          <Self fields={f.fields} bind:data={rows[i]} {srd} {issues} prefix={`${at(f)}.${i}.`} />
          <button type="button" class="btn small" onclick={() => (data[f.path] = rows.filter((__, j) => j !== i))}>เอาออก</button>
        </div>
      {/each}
      {#if rows.length < f.max}<button type="button" class="btn small" onclick={() => (data[f.path] = [...rows, f.blank()])}>เพิ่มแถว</button>{/if}
    </fieldset>
  {/if}
  {#each e as m, n (n)}<p class="hint err">{m}</p>{/each}
{/each}
