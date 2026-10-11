<script lang="ts">
  import type { SrdClass } from '../../data/schema';

  let { cls }: { cls: SrdClass } = $props();
  const sub = $derived(cls.subclasses[0]);
</script>

{#if sub}
  <p>เลเวล 3 ได้สายของอาชีพ ใน SRD อาชีพนี้มีสายเดียวคือ <b>{sub.name}</b></p>
  <details><summary>รายละเอียดของ {sub.name}</summary><p class="hint">{sub.desc}</p></details>
{:else}
  <p class="hint">SRD ไม่มีสายของอาชีพนี้ ข้ามขั้นนี้ได้</p>
{/if}
