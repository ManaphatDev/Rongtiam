<script lang="ts">
  import type { RoomStore } from '../../sync/room.svelte';

  let { store, file }: { store: RoomStore; file: string | undefined } = $props();
  let src = $state<string | undefined>();

  $effect(() => {
    const f = file;
    src = f ? store.assets.peek(f) : undefined;
    if (f && !src) store.assets.url(f).then((u) => { if (file === f) src = u; }, () => {});
  });
</script>

{#if src}<img alt="" {src} />{/if}
