<script lang="ts">
  import type { SheetProps } from '../core/types';
  import { getSrd, viewOf } from './index';
  import { roomSkillsOf } from './roomSkills';
  import { ABILITIES, ABILITY_TH, BACKGROUNDS_TH, CLASSES_TH, SKILLS, SPECIES_TH, type Skill } from './i18n/th';

  let { data, ctx, editable, isGM, patch, roll }: SheetProps = $props();

  const srd = getSrd();
  const v = $derived(viewOf(data, ctx));
  /** Players may add their own skills unless the GM turned that off. */
  const canAddSkill = $derived(editable && (isGM || roomSkillsOf(ctx).allowPlayerSkills));
  const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const c = $derived(v.c);
  const d = $derived(v.d);
  const cls = $derived(srd.classes.find((x) => x.key === c.classKey));
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const d20 = (n: number) => (n ? `1d20${n > 0 ? '+' : ''}${n}` : '1d20');
  const RANKS = [{ v: 0, label: '—' }, { v: 1, label: 'ชำนาญ' }, { v: 2, label: 'เชี่ยวชาญ' }];
  const ORDINAL = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const int = (e: Event, min: number, max: number) => {
    const n = Math.round(Number((e.currentTarget as HTMLInputElement).value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
  };
  let addWeapon = $state('');
  let addSpell = $state('');
  let openSpell = $state<string | null>(null);
  let addFeat = $state('');
  let addLang = $state('');
  let addTool = $state('');
  const classSpells = $derived(srd.spells.filter((s) => s.classes.includes(c.classKey)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)));
  const knownSpells = $derived(c.spells.known.map((k) => srd.spells.find((s) => s.key === k)).filter((s) => !!s).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)));
</script>

{#snippet tags(label: string, path: 'feats' | 'languages' | 'tools', items: string[], name: (k: string) => string)}
  <h3>{label}</h3>
  <ul class="plain-list">
    {#each items as k, i (i)}
      <li>
        <span class="nm">{name(k)}</span>
        {#if editable}<button class="btn small" aria-label={`เอา ${name(k)} ออก`} onclick={() => patch([path], items.filter((_, j) => j !== i))}>✕</button>{/if}
      </li>
    {:else}
      <li class="emptyline">ยังไม่มี</li>
    {/each}
  </ul>
{/snippet}

<div class="sheet dnd">
  <section class="sheet-head" aria-label="ข้อมูลตัวละคร">
    <label class="field grow">ชื่อ<input type="text" maxlength="60" value={c.name} disabled={!editable}
      oninput={(e) => patch(['name'], e.currentTarget.value, 400)} /></label>
    <label class="field">อาชีพ<select aria-label="อาชีพ" value={c.classKey} disabled={!editable} onchange={(e) => { patch(['classKey'], e.currentTarget.value); patch(['subclass'], null); }}>
      {#each srd.classes as k (k.key)}<option value={k.key}>{CLASSES_TH[k.key] ?? k.name} ({k.name})</option>{/each}
    </select></label>
    {#if cls?.subclasses.length}
      <label class="field">สาย<select aria-label="สาย" value={c.subclass ?? ''} disabled={!editable} onchange={(e) => patch(['subclass'], e.currentTarget.value || null)}>
        <option value="">—</option>
        {#each cls.subclasses as s (s.key)}<option value={s.key}>{s.name}</option>{/each}
      </select></label>
    {/if}
    <label class="field narrow">เลเวล<input type="number" min="1" max="20" value={c.level} disabled={!editable}
      onchange={(e) => patch(['level'], int(e, 1, 20))} /></label>
    <label class="field">เผ่า<select aria-label="เผ่า" value={c.species} disabled={!editable} onchange={(e) => patch(['species'], e.currentTarget.value)}>
      {#each srd.species as s (s.key)}<option value={s.key}>{SPECIES_TH[s.key] ?? s.name}</option>{/each}
    </select></label>
    <label class="field">ฉากหลัง<select aria-label="ฉากหลัง" value={c.background} disabled={!editable} onchange={(e) => patch(['background'], e.currentTarget.value)}>
      {#each srd.backgrounds as b (b.key)}<option value={b.key}>{BACKGROUNDS_TH[b.key] ?? b.name}</option>{/each}
    </select></label>
  </section>

  <section class="stat-row" aria-label="ค่าการต่อสู้">
    <div class="stat"><span>AC</span><b>{d.ac}</b></div>
    <div class="stat hp">
      <span>HP</span>
      <div class="hp-edit">
        <input type="number" aria-label="HP ปัจจุบัน" value={c.hp.current} disabled={!editable}
          onchange={(e) => patch(['hp', 'current'], int(e, 0, d.maxHp))} />
        <small>/ {d.maxHp}</small>
      </div>
      <label class="tiny">ชั่วคราว <input type="number" min="0" value={c.hp.temp} disabled={!editable}
        onchange={(e) => patch(['hp', 'temp'], int(e, 0, 999))} /></label>
    </div>
    <div class="stat"><span>ความเร็ว</span><b>{d.speed}</b><small>ฟุต</small></div>
    <button class="stat as-btn" onclick={() => roll('Initiative', d20(d.initiative))}><span>Initiative</span><b>{signed(d.initiative)}</b></button>
    <div class="stat"><span>โบนัสความชำนาญ</span><b>{signed(d.pb)}</b></div>
    <div class="stat"><span>การรับรู้แฝง</span><b>{d.passivePerception}</b></div>
  </section>

  <section class="abilities" aria-label="ค่าพลัง">
    {#each ABILITIES as a (a)}
      <div class="ability">
        <label class="field">{ABILITY_TH[a].name}<input type="number" min="1" max="30" value={c.abilities[a]} disabled={!editable}
          onchange={(e) => patch(['abilities', a], int(e, 1, 30))} /></label>
        <button class="btn small" onclick={() => roll(`ทดสอบ${ABILITY_TH[a].name}`, d20(d.mods[a]))}>ทดสอบ {signed(d.mods[a])}</button>
        <button class="btn small" class:prof={d.saves[a].proficient} onclick={() => roll(`เซฟ${ABILITY_TH[a].name}`, d20(d.saves[a].bonus))}
          aria-label={`เซฟ${ABILITY_TH[a].name} ${signed(d.saves[a].bonus)}${d.saves[a].proficient ? ' (ชำนาญ)' : ''}`}>
          เซฟ {signed(d.saves[a].bonus)}{d.saves[a].proficient ? ' ●' : ''}
        </button>
      </div>
    {/each}
  </section>

  <div class="sheet-cols">
    <section class="block" aria-label="สกิล">
      <h3>สกิล</h3>
      <ul class="skills">
        {#each Object.keys(SKILLS) as s (s)}
          {@const sk = d.skills[s as Skill]}
          <li>
            <select aria-label={`ระดับ ${SKILLS[s as Skill].th}`} value={sk.rank} disabled={!editable}
              onchange={(e) => patch(['skills', s], Number(e.currentTarget.value) || null)}>
              {#each RANKS as r (r.v)}<option value={r.v}>{r.label}</option>{/each}
            </select>
            <span class="nm">{SKILLS[s as Skill].th} <small>({ABILITY_TH[sk.ability].short})</small></span>
            <button class="btn small" onclick={() => roll(SKILLS[s as Skill].th, d20(sk.bonus))}>{signed(sk.bonus)}</button>
          </li>
        {/each}
        {#each d.extraSkills as sk (sk.id)}
          {@const own = sk.source === 'own'}
          {@const idx = own ? c.customSkills.findIndex((x) => `own:${x.id}` === sk.id) : -1}
          <li class:own>
            <select aria-label={`ระดับ ${sk.name}`} value={sk.rank} disabled={!editable}
              onchange={(e) => patch(own ? ['customSkills', idx, 'rank'] : ['roomSkills', sk.id.slice(5)], Number(e.currentTarget.value) || (own ? 0 : null))}>
              {#each RANKS as r (r.v)}<option value={r.v}>{r.label}</option>{/each}
            </select>
            {#if own && editable}
              <input class="skill-name" type="text" maxlength="40" aria-label="ชื่อสกิลส่วนตัว" value={sk.name}
                oninput={(e) => patch(['customSkills', idx, 'name'], e.currentTarget.value, 400)} />
              <select class="skill-ability" aria-label={`ค่าพลังของ ${sk.name}`} value={sk.ability}
                onchange={(e) => patch(['customSkills', idx, 'ability'], e.currentTarget.value)}>
                {#each ABILITY_KEYS as a (a)}<option value={a}>{ABILITY_TH[a].short}</option>{/each}
              </select>
            {:else}
              <span class="nm">{sk.name} <small>({ABILITY_TH[sk.ability].short}{own ? ' · ส่วนตัว' : ' · ของห้อง'})</small></span>
            {/if}
            <button class="btn small" onclick={() => roll(sk.name, d20(sk.bonus))} aria-label={`ทอย ${sk.name} ${signed(sk.bonus)}`}>{signed(sk.bonus)}</button>
            {#if own && editable}
              <button class="btn small" aria-label={`ลบสกิล ${sk.name}`} onclick={() => patch(['customSkills'], c.customSkills.filter((_, j) => j !== idx))}>✕</button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if canAddSkill}
        <button class="btn small" onclick={() => patch(['customSkills'], [...c.customSkills, { id: crypto.randomUUID().slice(0, 8), name: 'สกิลใหม่', ability: 'int', rank: 1 }])}>เพิ่มสกิลส่วนตัว</button>
      {/if}
    </section>

    <div class="stack">
      <section class="block" aria-label="อาวุธและเกราะ">
        <h3>อาวุธ</h3>
        <ul class="attacks">
          {#each d.attacks as a (a.key)}
            <li>
              <span class="nm">{a.name}{a.proficient ? '' : ' (ไม่ชำนาญ)'}</span>
              <button class="btn small" onclick={() => roll(`${a.name} โจมตี`, d20(a.toHit))}>โจมตี {signed(a.toHit)}</button>
              <button class="btn small" onclick={() => roll(`${a.name} ความเสียหาย`, a.damage)}>{a.damage}</button>
              {#if a.versatile}<button class="btn small" onclick={() => roll(`${a.name} สองมือ`, a.versatile!)}>สองมือ {a.versatile}</button>{/if}
              {#if editable}
                <button class="btn small" aria-label={`เอา ${a.name} ออก`} onclick={() => patch(['weapons'], c.weapons.filter((w) => w !== a.key))}>✕</button>
              {/if}
            </li>
          {:else}
            <li class="emptyline">ยังไม่มีอาวุธ</li>
          {/each}
        </ul>
        {#if editable}
          <div class="row">
            <select aria-label="เพิ่มอาวุธ" bind:value={addWeapon}>
              <option value="">เลือกอาวุธ…</option>
              {#each srd.weapons as w (w.key)}<option value={w.key}>{w.name} ({w.damage})</option>{/each}
            </select>
            <button class="btn small" disabled={!addWeapon} onclick={() => { patch(['weapons'], [...c.weapons, addWeapon]); addWeapon = ''; }}>เพิ่ม</button>
          </div>
        {/if}
        <div class="row">
          <label class="field">เกราะ<select aria-label="เกราะ" value={c.armor ?? ''} disabled={!editable} onchange={(e) => patch(['armor'], e.currentTarget.value || null)}>
            <option value="">ไม่ใส่เกราะ</option>
            {#each srd.armor.filter((a) => a.category !== 'shield') as a (a.key)}<option value={a.key}>{a.name} ({a.category})</option>{/each}
          </select></label>
          <label class="check"><input type="checkbox" checked={c.shield} disabled={!editable} onchange={(e) => patch(['shield'], e.currentTarget.checked)} /> โล่ (+2)</label>
        </div>
      </section>

      <section class="block" aria-label="สถานะชีวิต">
        <h3>เซฟความตาย</h3>
        <div class="row">
          {#each [['success', 'สำเร็จ'], ['fail', 'ล้มเหลว']] as [k, label] (k)}
            <label class="field narrow">{label}<input type="number" min="0" max="3" value={c.death[k as 'success']} disabled={!editable}
              onchange={(e) => patch(['death', k], int(e, 0, 3))} /></label>
          {/each}
          <button class="btn small" onclick={() => roll('เซฟความตาย', '1d20')}>ทอยเซฟความตาย</button>
          <label class="check"><input type="checkbox" checked={c.inspiration} disabled={!editable} onchange={(e) => patch(['inspiration'], e.currentTarget.checked)} /> แรงบันดาลใจ</label>
        </div>
      </section>
    </div>
  </div>

  {#if d.spellcasting}
    {@const sc = d.spellcasting}
    <section class="block" aria-label="เวท">
      <h3>เวท <small>ค่า DC {sc.dc} · โจมตี {signed(sc.attack)} · ร่ายด้วย{ABILITY_TH[sc.ability].name}</small></h3>
      <div class="row">
        <button class="btn small" onclick={() => roll('โจมตีด้วยเวท', d20(sc.attack))}>โจมตีด้วยเวท {signed(sc.attack)}</button>
      </div>
      <div class="slots" role="group" aria-label="ช่องเวทที่ใช้ไปแล้ว">
        {#if sc.pact}
          <label class="field narrow">ช่อง Pact (เลเวล {sc.pact.level}) ใช้ไป<input type="number" min="0" max={sc.pact.slots} value={c.spells.pactUsed}
            disabled={!editable} onchange={(e) => patch(['spells', 'pactUsed'], int(e, 0, sc.pact!.slots))} /><small>จาก {sc.pact.slots}</small></label>
        {:else}
          {#each sc.slots as n, i (i)}
            {#if n}
              <label class="field narrow">เลเวล {ORDINAL[i]}<input type="number" min="0" max={n} value={c.spells.used[i]} disabled={!editable}
                onchange={(e) => patch(['spells', 'used', i], int(e, 0, n))} /><small>ใช้ไป / {n}</small></label>
            {/if}
          {/each}
        {/if}
      </div>
      <ul class="spells">
        {#each knownSpells as s (s.key)}
          <li>
            <button class="pick" aria-expanded={openSpell === s.key} onclick={() => (openSpell = openSpell === s.key ? null : s.key)}>
              <span class="lv">{s.level ? `เลเวล ${s.level}` : 'แคนทริป'}</span> {s.name}
              {#if s.concentration}<small>(สมาธิ)</small>{/if}
            </button>
            {#if s.damage}<button class="btn small" onclick={() => roll(s.name, s.damage!)}>{s.damage}</button>{/if}
            {#if editable}<button class="btn small" aria-label={`เอา ${s.name} ออก`} onclick={() => patch(['spells', 'known'], c.spells.known.filter((k) => k !== s.key))}>✕</button>{/if}
            {#if openSpell === s.key}
              <div class="spell-desc">
                <p class="hint">{s.castingTime} · {s.range} · {s.components} · {s.duration}{s.save ? ` · เซฟ${ABILITY_TH[s.save].name}` : ''}</p>
                <p>{s.desc}</p>
                {#if s.higher}<p class="hint">{s.higher}</p>{/if}
              </div>
            {/if}
          </li>
        {:else}
          <li class="emptyline">ยังไม่ได้เลือกเวท</li>
        {/each}
      </ul>
      {#if editable}
        <div class="row">
          <select aria-label="เพิ่มเวท" bind:value={addSpell}>
            <option value="">เลือกเวทของอาชีพนี้…</option>
            {#each classSpells.filter((s) => !c.spells.known.includes(s.key)) as s (s.key)}
              <option value={s.key}>{s.level ? `เลเวล ${s.level}` : 'แคนทริป'} · {s.name}</option>
            {/each}
          </select>
          <button class="btn small" disabled={!addSpell} onclick={() => { patch(['spells', 'known'], [...c.spells.known, addSpell]); addSpell = ''; }}>เพิ่ม</button>
        </div>
      {/if}
    </section>
  {/if}

  <section class="block" aria-label="ของและเงิน">
    <h3>ของในกระเป๋า</h3>
    <ul class="inventory">
      {#each c.inventory as item, i (i)}
        <li>
          <input type="text" aria-label="ชื่อของ" maxlength="80" value={item.name} disabled={!editable} oninput={(e) => patch(['inventory', i, 'name'], e.currentTarget.value, 400)} />
          <input type="number" aria-label="จำนวน" min="0" value={item.qty} disabled={!editable} onchange={(e) => patch(['inventory', i, 'qty'], int(e, 0, 9999))} />
          {#if editable}<button class="btn small" aria-label={`ทิ้ง ${item.name}`} onclick={() => patch(['inventory'], c.inventory.filter((_, j) => j !== i))}>✕</button>{/if}
        </li>
      {/each}
    </ul>
    {#if editable}<button class="btn small" onclick={() => patch(['inventory'], [...c.inventory, { name: '', qty: 1, note: '' }])}>เพิ่มของ</button>{/if}
    <div class="row money">
      {#each ['pp', 'gp', 'sp', 'cp'] as m (m)}
        <label class="field narrow">{m.toUpperCase()}<input type="number" value={c.money[m as 'gp']} disabled={!editable}
          onchange={(e) => patch(['money', m], int(e, -999999, 999999))} /></label>
      {/each}
    </div>
  </section>

  <section class="block" aria-label="Feat ภาษา และเครื่องมือ">
    {@render tags('Feat', 'feats', c.feats, (k) => srd.feats.find((f) => f.key === k)?.name ?? k)}
    {#if editable}
      <div class="row">
        <select aria-label="เพิ่ม feat" bind:value={addFeat}>
          <option value="">เลือก feat…</option>
          {#each srd.feats.filter((f) => !c.feats.includes(f.key)) as f (f.key)}<option value={f.key}>{f.name}</option>{/each}
        </select>
        <button class="btn small" disabled={!addFeat} onclick={() => { patch(['feats'], [...c.feats, addFeat]); addFeat = ''; }}>เพิ่ม</button>
      </div>
    {/if}
    {@render tags('ภาษา', 'languages', c.languages, (k) => k)}
    {#if editable}
      <div class="row">
        <input type="text" aria-label="เพิ่มภาษา" maxlength="40" bind:value={addLang} />
        <button class="btn small" disabled={!addLang.trim()} onclick={() => { patch(['languages'], [...c.languages, addLang.trim()]); addLang = ''; }}>เพิ่ม</button>
      </div>
    {/if}
    {@render tags('เครื่องมือ', 'tools', c.tools, (k) => k)}
    {#if editable}
      <div class="row">
        <input type="text" aria-label="เพิ่มเครื่องมือ" maxlength="80" bind:value={addTool} />
        <button class="btn small" disabled={!addTool.trim()} onclick={() => { patch(['tools'], [...c.tools, addTool.trim()]); addTool = ''; }}>เพิ่ม</button>
      </div>
    {/if}
  </section>

  <div class="sheet-cols">
    <label class="field block">ความสามารถและ feat<textarea rows="6" maxlength="20000" value={c.features} disabled={!editable}
      oninput={(e) => patch(['features'], e.currentTarget.value, 600)}></textarea></label>
    <label class="field block">บันทึก<textarea rows="6" maxlength="20000" value={c.notes} disabled={!editable}
      oninput={(e) => patch(['notes'], e.currentTarget.value, 600)}></textarea></label>
  </div>

  {#if editable}
    <details class="block">
      <summary>ค่าที่กำหนดเอง (แทนที่ค่าที่คำนวณ)</summary>
      <p class="hint">เว้นว่างไว้เพื่อใช้ค่าที่คำนวณ ใช้กับกฎบ้านหรือไอเทมเวทมนตร์</p>
      <div class="row">
        {#each [['ac', 'AC'], ['maxHp', 'HP สูงสุด'], ['speed', 'ความเร็ว'], ['initiative', 'Initiative']] as [k, label] (k)}
          <label class="field narrow">{label}<input type="number" value={c.overrides[k as 'ac'] ?? ''}
            onchange={(e) => patch(['overrides', k], e.currentTarget.value === '' ? null : Math.round(Number(e.currentTarget.value)))} /></label>
        {/each}
      </div>
    </details>
  {/if}
</div>
