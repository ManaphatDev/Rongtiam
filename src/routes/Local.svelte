<script lang="ts">
  // Dev-only offline table backed by LocalBackend (no Supabase needed).
  import { onDestroy, onMount } from 'svelte';
  import { LocalBackend } from '../sync/local';
  import { RoomStore } from '../sync/room.svelte';
  import Table from '../table/Table.svelte';
  import { Ui } from '../table/ui.svelte';

  const ui = new Ui();
  const backend = new LocalBackend();
  const store = new RoomStore(backend, { user_id: backend.userId, name: 'GM', color: '#e5484d', role: 'gm' }, (m) => ui.showToast('ผิดพลาด', undefined, m));
  let ready = $state(false);

  onMount(async () => {
    await store.connect(true);
    ready = true;
  });
  onDestroy(() => store.dispose());
</script>

{#if ready}<Table {store} {ui} />{/if}
