<script lang="ts">
  // Destructive action: first click arms, second click within 3 s confirms (port of legacy twoStep()).
  let { label, onconfirm, small = true }: { label: string; onconfirm: () => void; small?: boolean } = $props();
  let armed = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function click() {
    if (armed) {
      if (timer) clearTimeout(timer);
      armed = false;
      onconfirm();
      return;
    }
    armed = true;
    timer = setTimeout(() => (armed = false), 3000);
  }
</script>

<button class="btn warn" class:small class:armed onclick={click}>{armed ? 'กดอีกครั้งเพื่อยืนยัน' : label}</button>
