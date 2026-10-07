<script lang="ts">
  import type { EquipmentOption, Srd } from '../../data/schema';
  import type { Draft } from '../draft';
  import { backgroundOf, classOf } from '../helpers';
  import Pick from './Pick.svelte';

  let { draft = $bindable(), srd }: { draft: Draft; srd: Srd } = $props();

  const cls = $derived(classOf(draft, srd));
  const bg = $derived(backgroundOf(draft, srd));
  const label = (o: EquipmentOption) => (o.items.length ? `ชุด ${o.id}` : `รับเป็นทอง ${o.gp} GP`);
  const hint = (o: EquipmentOption) =>
    o.items.length ? `${o.items.map((i) => (i.qty > 1 ? `${i.qty} ${i.name}` : i.name)).join(', ')} · ${o.gp} GP` : undefined;
  const opts = (list: EquipmentOption[]) => list.map((o) => ({ id: o.id, label: label(o), hint: hint(o) }));
</script>

{#if cls}
  <Pick legend="อุปกรณ์เริ่มต้นของอาชีพ" options={opts(cls.equipmentOptions)} value={draft.classEquip} onpick={(id) => (draft.classEquip = id)} />
{:else}
  <p class="hint">เลือกอาชีพก่อน</p>
{/if}
{#if bg}
  <Pick legend="อุปกรณ์เริ่มต้นของฉากหลัง" options={opts(bg.equipmentOptions)} value={draft.bgEquip} onpick={(id) => (draft.bgEquip = id)} />
{:else}
  <p class="hint">เลือกฉากหลังก่อน</p>
{/if}
