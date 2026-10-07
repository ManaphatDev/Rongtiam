<script lang="ts">
  import { router } from '../router.svelte';
</script>

<main class="page">
  <div class="card credits">
    <h1>เครดิตและสัญญาอนุญาต</h1>
    <h2>ข้อมูลกติกา D&amp;D 2024</h2>
    <p lang="en">This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC,
      available at <a href="https://www.dndbeyond.com/srd" rel="noopener noreferrer" target="_blank">https://www.dndbeyond.com/srd</a>.
      The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at
      <a href="https://creativecommons.org/licenses/by/4.0/legalcode" rel="noopener noreferrer" target="_blank">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p>
    <p class="hint">ข้อมูลดึงผ่าน <a href="https://open5e.com" rel="noopener noreferrer" target="_blank">Open5e</a> ชื่อภาษาไทยเป็นคำแปลของโรงเตี๊ยม
      คำอธิบายเวทและความสามารถคงเป็นภาษาอังกฤษตามต้นฉบับ</p>
    <p class="hint" lang="en">Rongtiam is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.</p>
    <button class="btn" onclick={() => router.go('/')}>กลับหน้าแรก</button>
  </div>
</main>
