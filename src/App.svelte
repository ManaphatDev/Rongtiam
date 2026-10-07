<script lang="ts">
  import { router } from './router.svelte';
  import Home from './routes/Home.svelte';
  import Room from './routes/Room.svelte';
  import Local from './routes/Local.svelte';
  import Credits from './routes/Credits.svelte';
</script>

{#if router.route.name === 'home'}
  <Home />
{:else if router.route.name === 'room'}
  {#key router.route.slug}
    <Room slug={router.route.slug} />
  {/key}
{:else if router.route.name === 'local'}
  <Local />
{:else if router.route.name === 'credits'}
  <Credits />
{:else}
  <div class="page">
    <div class="card">
      <h1>ไม่พบหน้านี้</h1>
      <button class="btn primary" onclick={() => router.go('/')}>กลับหน้าแรก</button>
    </div>
  </div>
{/if}
