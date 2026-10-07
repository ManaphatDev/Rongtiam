# เฟส 5a: ตัวช่วยสร้างตัวละคร D&D 2024 (เลเวล 1)

วันที่ 2026-10-07 · กิ่ง `phase-5a-builder` (แตกจาก `phase-4-rules`) · สถานะ: รอผู้ใช้รีวิว

## 1. เป้าหมาย

เฟส 5 ในแผนหลักมีสามส่วน และตกลงให้ทำทีละส่วน โดยแต่ละส่วนมี spec → แผน → ลงมือของตัวเอง:

| ส่วน | เนื้อหา | สถานะ |
|---|---|---|
| **5a** | grants overlay + ตัวช่วยสร้างตัวละครเลเวล 1 | **เอกสารนี้** |
| 5b | เลเวลอัพ 2–20 และปุ่ม "เริ่มที่เลเวล N" (รันขั้นเลเวลอัพซ้ำ) | spec แยก |
| 5c | homebrew (ฟอร์ม spell/feat/species/background/item, นำเข้า class/subclass เป็น JSON) | spec แยก |

**เป้าหมายของ 5a:** ผู้เล่นบนมือถือ (375×812) สร้างตัวละคร D&D 2024 เลเวล 1 ที่ถูกกติกาได้ทีละขั้น โดยไม่ต้องกรอกชีทด้วยมือ ชีทที่ได้ใช้งานต่อได้ทันทีและยังแก้อิสระเหมือนเดิม

**เกณฑ์สำเร็จ:**
- สร้าง Fighter, Cleric, Wizard จนจบบน 375×812 ได้ในเทสต์ e2e
- `build()` สำเร็จกับทุกชุด อาชีพ × ฉากหลัง × เผ่า และผลผ่าน `parseCharacter`
- รายงาน gap ของ `scripts/srd/build.ts` ว่าง
- ชีทที่ได้แสดง AC, HP, save, สกิล, เวท ตรงกับที่ `derive()` คำนวณ

### ที่ผู้ใช้ตัดสินใจแล้ว

1. แบ่ง 5a → 5b → 5c
2. grants overlay เก็บเฉพาะ **จุดที่ผู้เล่นต้องเลือก และ proficiency** ฟีเจอร์ต่างๆ ลงชีทเป็นข้อความ ไม่คำนวณผลเพิ่ม
3. 5a สร้างได้ที่ **เลเวล 1 เท่านั้น**
4. แนวทาง **A**: draft ในเครื่อง + `build()` บริสุทธิ์ + สร้างแถวครั้งเดียว

### สมมติฐาน (ผู้ใช้ยืนยันโดยรับหัวข้อ 2 แล้ว แต่แก้ได้ตอนรีวิว)

- ชีทแบบกรอกเองยังอยู่ ปุ่ม "สร้างชีทเปล่า" และ "สร้าง NPC ลับ" ยังสร้างชีทเปล่า
- ทอยค่าพลังได้ครั้งเดียวต่อ draft (ผลเก็บใน draft ทอยซ้ำเพื่อเลือกผลที่ชอบไม่ได้)
- การตรวจกติกาเป็นแนวทางให้ผู้เล่น ไม่ใช่การบังคับฝั่งเซิร์ฟเวอร์ (ผู้เล่นแก้ชีทตัวเองอิสระอยู่แล้ว)

## 2. นอกขอบเขต (ตั้งใจไม่ทำใน 5a)

- ผลของฟีเจอร์ feat และลักษณะเผ่าที่เกินกว่าที่ `derive.ts` คำนวณอยู่แล้ว (เช่น Tough, Alert, Dwarven Toughness, Defense, Divine Order แบบ Protector ที่ให้ martial proficiency) บันทึกเป็นข้อความ ผู้เล่นใช้ `overrides` ได้เท่าที่มี
- ตัวนับทรัพยากรอาชีพ (Rage, Second Wind, Channel Divinity, Sorcery Points) และปุ่มพักสั้น/ยาว
- เวทที่ได้จากสายเลือด/มรดกของเผ่า (เช่น cantrip ของ Tiefling) เพิ่มเองบนชีท
- ขนาดตัว (size) ของเผ่า และ expertise ใน Thieves' Tools (ชีทไม่มีระดับของ tool)
- เลเวลอัพ, เริ่มที่เลเวลสูง (5b), homebrew (5c)
- การแปลข้อความกติกาของ SRD (spell, feat, ฟีเจอร์) ยังเป็นอังกฤษ ข้อความ UI ของวิซาร์ดเป็นไทย

## 3. ภาพรวมและผังไฟล์

```
scripts/srd/build.ts             + สกัด Core Traits และอุปกรณ์เริ่มต้นจาก desc ดิบ → srd.json (zod ตรวจ, รายงาน gap)
src/rulesets/dnd2024/
  data/schema.ts                 + ฟิลด์ใหม่ของ ClassZ / BackgroundZ (หัวข้อ 4.1)
  model.ts                       + feats, languages, tools; choices.build (หัวข้อ 4.4)
  overlay/                       (ใหม่) ข้อมูลที่เขียนเอง ไม่ใช้ชื่อ rules/ เพราะชนกับ rules.ts เดิม
    types.ts  classes/<key>.ts ×12  species.ts  languages.ts  index.ts
  builder/                       (ใหม่) ตรรกะบริสุทธิ์ + UI
    draft.ts  validate.ts  abilities.ts  equipment.ts  build.ts  persist.ts
    Builder.svelte  steps/*.svelte
  Sheet.svelte                   + แสดง feats / languages / tools
  index.ts                       + Builder: () => import('./builder/Builder.svelte')
src/rulesets/core/types.ts       + BuilderProps และช่อง Builder? ใน RulesetModule
src/sheets/SheetsSection.svelte  + เปิดวิซาร์ด; Room.svelte ติดตั้งวิซาร์ดข้าง SheetPanel
src/table/ui.svelte.ts           + builderOpen
tests/e2e/builder.spec.ts        (ใหม่)
```

ไม่มี migration และไม่มีการแก้ RLS/RPC สร้างตัวละครผ่าน `store.createCharacter` เดิม จึงไม่ต้องมีเทสต์ใน `tests/db`

## 4. ชั้นข้อมูล

### 4.1 สกัดจาก SRD ใน build script (ไม่พิมพ์เอง)

`desc` ดิบของแต่ละอาชีพมีตาราง Core Traits เป็นข้อความ (สกิลที่เลือกได้, weapon/armor training, tool, อุปกรณ์เริ่มต้น A/B/C) `build.ts` สกัดแล้วเขียนลง `srd.json`:

```ts
EquipmentItemZ   = { name, qty, kind: 'weapon'|'armor'|'shield'|'gear', key?: string }  // key = SRD weapon/armor key
EquipmentOptionZ = { id: 'A'|'B'|'C', items: EquipmentItem[], gp: number }               // ตัวเลือก "รับเป็นทอง" = items ว่าง
ToolGrantZ       = { fixed: string[], choose: { count: number, label: string } | null }  // เช่น Choose 3 Musical Instruments

ClassZ      += skillChoice: { count, from: skillKey[] }  // "Choose any 3 skills" → from = ทั้ง 18
               training: { weapons: string, armor: string }  // ข้อความดิบ ใช้แสดงใน features และหน้าตรวจสอบ
               tools: ToolGrant
               equipment: EquipmentOption[]
BackgroundZ += tools: ToolGrant                          // "Choose one kind of Gaming Set" → choose
               equipment: EquipmentOption[]              // แทนประโยคเดียวเดิม (เก็บ equipment string เดิมไว้ด้วย)
```

กฎการจับคู่ชื่อของ: ตัดจำนวนนำหน้า, ทำเป็นเอกพจน์, เทียบชื่อ weapon/armor ใน SRD แบบตรงตัว ที่ไม่ตรง (ชุดผจญภัย, ลูกธนู, Arcane Focus (Quarterstaff)) เป็น `gear` ชุดผจญภัยเก็บเป็นรายการเดียว ไม่แตกเนื้อใน ถ้าสกัดไม่ได้ให้เข้ารายงาน gap และแก้ในรายการ `CORRECTIONS` ตามแบบเดิมของสคริปต์

### 4.2 overlay ที่เขียนเอง: จุดตัดสินใจของอาชีพ (เลเวล 1–20)

```ts
// overlay/types.ts
ChoicePoint = { level: number, feature: string /* ชื่อฟีเจอร์ใน SRD ที่มาของจุดนี้ */ } & (
  | { kind: 'fightingStyle' }                          // เลือก feat ชนิด 'fighting style'
  | { kind: 'masteries', filter: MasteryFilter }       // จำนวนอ่านจากคอลัมน์ 'Weapon Mastery' ของตาราง
  | { kind: 'expertise', count: number }               // เลือกจากสกิลที่มี proficiency
  | { kind: 'order', options: { id, name, extraCantrips?: number }[] }   // Divine Order, Primal Order
  | { kind: 'invocations', catalog: string[] }         // จำนวนอ่านจากคอลัมน์ 'Eldritch Invocations'
  | { kind: 'metamagic', count: number }
  | { kind: 'subclass' } | { kind: 'asi', epicBoon?: boolean } | { kind: 'spells' } /* 5b ใช้ */ )
ClassRules = { key: string, choices: ChoicePoint[] }
```

หลักการ:
- ใส่เฉพาะจุดที่ผู้เล่นต้องเลือกหรือเปลี่ยนจำนวนที่ชีทติดตาม จำนวนที่ตารางของ SRD มีอยู่แล้ว (cantrip, prepared spells, ช่องเวท, weapon mastery, invocation) **อ่านจากตาราง ไม่ซ้ำใน overlay**
- คำอธิบายฟีเจอร์ดึงจาก `features[]` ตามเลเวล
- วิซาร์ดของ 5a ใช้เฉพาะจุดที่ `level === 1` จุดเลเวล 2–20 (subclass ที่ 3, ASI ที่ 4/8/12/16/19 และของเฉพาะอาชีพ) ถูกนิยามและตรวจด้วยเทสต์ snapshot ใน 5a แล้ว 5b นำไปใช้
- ตัวเลือกบางรายการอาจเปลี่ยนจำนวนที่ขั้นอื่นต้องเลือก เช่น Thaumaturge (Cleric) และ Magician (Druid) เพิ่ม 1 cantrip ให้ขั้นเวท

### 4.3 overlay เผ่าและภาษา

- `species.ts`: ตัวเลือกต่อเผ่า เช่น Elven Lineage, Dragonborn Ancestry, Gnomish Lineage, Giant Ancestry, Fiendish Legacy, สกิลของ Elf (Keen Senses), สกิลและ origin feat ของ Human ใช้ชนิด `lineage | skill | feat` ผลต่อชีทเฉพาะ **สกิลและ feat** ส่วนสายเลือด/มรดกบันทึกใน `choices.build` และใส่ข้อความของตัวเลือกนั้นลง `features`
- `languages.ts`: รายการภาษามาตรฐานของ SRD 5.2 (ค่าคงที่) ผู้เล่นได้ Common + เลือกเพิ่ม 2 ภาษา
- เทสต์ตรวจชื่อตัวเลือกทุกรายการต้องปรากฏในข้อความ SRD ของฟีเจอร์/ลักษณะนั้น กันพิมพ์ผิด

### 4.4 โมเดลตัวละคร (เพิ่มแบบ additive)

`D2024Z` เพิ่ม `feats: string[]` (key ของ feat), `languages: string[]`, `tools: string[]` ให้ `parse` เติมค่าเริ่มต้น ข้อมูลเก่าโหลดได้โดยไม่ต้องเพิ่มเลข `v`

`choices.build` เก็บประวัติการเลือกเป็น zod schema (`{ v: 1, class, background, species, scores: { method } }`) ใช้ในการรีวิวและให้ 5b อ่านต่อ ไม่ใช่แหล่งความจริงของค่าบนชีท ค่าที่ใช้งานจริงอยู่ในฟิลด์เดิม (`abilities`, `skills`, ...) เพื่อไม่ต้องแก้ `derive.ts`

`Sheet.svelte` แสดงสามรายการใหม่ในรูปแบบเดียวกับรายการเวท (แสดง, ลบได้เมื่อแก้ไขได้; เพิ่ม feat เลือกจากรายการ SRD ส่วนภาษาและ tool พิมพ์ข้อความ)

## 5. วิซาร์ด

เก้าขั้นตอน: **อาชีพ → ฉากหลัง → เผ่า → ภาษา → ค่าพลัง → อุปกรณ์ → เวท → รายละเอียด → ตรวจสอบ** ขั้นเวทข้ามเมื่ออาชีพไม่ร่ายเวทเลเวล 1

| ขั้น | ผู้เล่นเลือก | กติกาตรวจ (`validate`) |
|---|---|---|
| อาชีพ | อาชีพ; สกิลตาม `skillChoice`; tool ถ้ามี `choose`; จุดเลือกเลเวล 1 (fighting style, weapon mastery, expertise ของ Rogue, Divine/Primal Order, invocation ของ Warlock) | จำนวนครบ, ไม่ซ้ำ, สกิลไม่ทับกับของฉากหลัง |
| ฉากหลัง | ฉากหลัง; ค่าพลัง +2/+1 หรือ +1/+1/+1 ในสามค่าที่ฉากหลังกำหนด; tool ถ้ามี `choose` | รูปแบบถูก; สกิลสองอย่างและ origin feat ของฉากหลังถูกล็อก |
| เผ่า | เผ่า; ตัวเลือกประจำเผ่า (หัวข้อ 4.3) | ตัวเลือกครบ; สกิลที่เลือกไม่ทับสกิลที่มีแล้ว; origin feat ของ Human ไม่ซ้ำกับของฉากหลัง |
| ภาษา | 2 ภาษาจากรายการ | ไม่ซ้ำ, ไม่ใช่ Common |
| ค่าพลัง | วิธี: array (15,14,13,12,10,8) / point buy 27 (8–15) / ทอย | array และผลทอย: จัดค่าเข้าแต่ละพลังครบหกค่าแบบไม่ซ้ำ; point buy: ต้นทุนรวม ≤ 27; ค่าสุดท้ายหลังบวกฉากหลัง ≤ 20 |
| อุปกรณ์ | ชุดของอาชีพ (A/B/C) และชุดของฉากหลัง (A/B) แยกกัน หรือรับเป็นทอง | เลือกครบทั้งสองชุด |
| เวท | cantrip และเวทเลเวล 1 จากรายการของอาชีพ | จำนวนตามตาราง (Wizard: สมุดเวท 6 เล่ม) + cantrip เพิ่มจากตัวเลือกบางอย่าง |
| รายละเอียด | ชื่อ (≤ 60 ตัวอักษร), รูปภาพ (ไม่บังคับ), บันทึก | ต้องมีชื่อ |
| ตรวจสอบ | ดูตัวอย่าง AC / HP / save / สกิล / เวท จาก `derive()` ของตัวละครที่ build แล้ว | ทุกขั้นก่อนหน้าผ่าน |

**ทอยค่าพลัง:** ทอย `24d6` ครั้งเดียวด้วยเต๋า 3D (ขีดจำกัดของโมเดลเต๋าคือ 24 ลูกต่อการทอยหนึ่งครั้ง) อ่านแต้มรายลูกจาก `result.dice` จัดกลุ่มละ 4 ตามลำดับ ทิ้งลูกต่ำสุดของแต่ละกลุ่มได้หกผลรวม เก็บไว้ใน draft แล้วผู้เล่นจัดเข้าแต่ละพลัง `BuilderProps.rollDice(expr) → Promise<number[]>` คืนแต้มรายลูก (ซ่อนรายละเอียด `dice.roll` ไว้ที่ฝั่งโฮสต์) เมื่อเต๋าสำรองเป็น `crypto` (Rapier โหลดไม่ได้) หรือผู้ใช้ตั้ง reduced-motion ตัว director จัดการให้อยู่แล้ว

## 6. draft, `validate`, `build`

```ts
Draft    = { classKey, classSkills, classTools, classChoices, background, bgAsi, bgTools,
             species, speciesChoices, languages, scores: { method, base | rolled, assign },
             classEquip, bgEquip, cantrips, spells, details: { name, portrait, notes } }

validate(draft, srd, overlay): Issue[]                 // ต่อขั้น; "ถัดไป" กดได้เมื่อขั้นนั้นไม่มี Issue
build(draft, srd, overlay): D2024                      // บริสุทธิ์; throw ถ้า validate พบปัญหา
```

`build()` เขียนลงฟิลด์เดิม:
- `classKey`, `level: 1`, `species`, `background`, `name`, `portrait`
- `abilities` = ฐาน + ค่าที่ฉากหลังเพิ่ม
- `skills`: rank 1 สำหรับสกิลจากอาชีพ ฉากหลัง และเผ่า; expertise ของ Rogue เป็น rank 2
- `armor` (เกราะที่ใส่หนึ่งชิ้น), `shield`, `weapons` (key ของอาวุธ SRD), `inventory` (ของอื่น; อาวุธ/กระสุนที่ qty > 1 เพิ่มบรรทัดใน inventory พร้อมจำนวนด้วย), `money.gp` = ทองของอาชีพ + ของฉากหลัง
- `spells.known` = cantrip + เวทที่เลือก (ชีทใช้ `known` เป็นรายการเวท; `prepared` ชีทไม่ใช้ ไม่แตะ)
- `feats` = origin feat ของฉากหลัง + feat จากเผ่า/fighting style; `languages` = Common + ที่เลือก; `tools`
- `features` (ข้อความ) = ลักษณะเผ่า (รวมข้อความสายเลือด/มรดกที่เลือก) + ข้อความ origin feat + ฟีเจอร์อาชีพเลเวล 1 + บรรทัด training + weapon mastery ที่เลือก
- `hp.current` = `derive(c, srd).maxHp`
- `choices.build` = ประวัติ (หัวข้อ 4.4)

**draft persistence:** เก็บใน localStorage ต่อห้อง (`rongtiam:builder:<roomId>`) ตรวจด้วย zod ตอนโหลด ถ้าเสียหรืออ้างถึง key ที่ไม่มีใน SRD ให้ทิ้งแล้วเริ่มใหม่ ปุ่ม "ปิด" เก็บ draft ไว้ ปุ่ม "ทิ้งร่าง" ใช้ `TwoStepButton` ล้าง draft เมื่อสร้างเสร็จ

## 7. จุดเชื่อมต่อ UI และการเข้าถึง

- `RulesetModule.Builder?: () => Promise<Component<BuilderProps>>` โหลดแบบ lazy เหมือน `Sheet` ระบบกฎที่ไม่มี (`custom`) ทำงานเหมือนเดิม
- `BuilderProps = { ctx, roomId, rollDice, onDone(data), onClose() }` `SheetsSection` เรียก `mod.Builder` เมื่อกด "สร้างตัวละคร" ตั้ง `ui.builderOpen` แล้ว `Room.svelte` ติดตั้งวิซาร์ดข้าง `SheetPanel` (`Room.svelte` มีการแก้ที่ยังไม่ commit ของผู้ใช้อยู่ ต้องทำงานทับบนไฟล์นั้นโดยไม่ commit ส่วนของผู้ใช้)
- `onDone` เรียก `store.createCharacter({ ruleset, data })` แล้วเปิดชีทที่ได้
- ตามธรรมเนียมใน CLAUDE.md:
  - วิซาร์ดเป็น overlay เหนือโต๊ะ ใส่คลาส `overlay-ui` และให้ canvas เต๋ายังอยู่เหนือวิซาร์ด
  - handler ของการทอย (async) จับค่า id/draft ที่ต้องใช้ก่อน `await` ครั้งแรก เพราะวิซาร์ดอาจปิดก่อนทอยเสร็จ
  - ปุ่มจริง (`<button>`) พร้อม `aria-pressed` / `aria-label` และเคารพ `prefers-reduced-motion`
- การเข้าถึง: รายการขั้นเป็น `<ol>` ที่มี `aria-current="step"`; ย้ายโฟกัสไปที่หัวข้อของขั้นเมื่อเปลี่ยนขั้น; ตัวเลือกเป็น `fieldset` + `legend`; ปุ่ม +/- ของ point buy มี `aria-label`; ข้อความตรวจสอบประกาศผ่านพื้นที่ `role=status`; เป้าสัมผัสสูงอย่างน้อย 44 px
- สีใช้ token เดิมของ `src/app.css` ไม่เพิ่มสีใหม่

## 8. การทดสอบ

**Unit (Vitest):**
- `srd.test.ts` (ขยาย): ทุกอาชีพมี `skillChoice` ที่ `count > 0` และ `from` เป็น key สกิลจริง; ทุกอาชีพและฉากหลังมีตัวเลือกอุปกรณ์ (รวมตัวเลือกทองล้วน); รายงาน gap ว่าง; ชื่ออาวุธ/เกราะในชุดอุปกรณ์ผูก key ได้
- overlay: ทุก `ChoicePoint.feature` มีอยู่ในฟีเจอร์ของอาชีพที่เลเวลนั้น; จำนวนที่อ่านจากตารางสอดคล้อง; ชื่อตัวเลือกปรากฏในข้อความ SRD; snapshot ความก้าวหน้าของจุดตัดสินใจ 12 อาชีพ × เลเวล 1–20
- `abilities.test.ts`: ต้นทุน point buy (8→0 ... 15→9) และผลรวม, array เป็น permutation, การจัดกลุ่มผลทอย (ทิ้งต่ำสุด), การจัดค่าเข้าพลัง
- `validate.test.ts`: สกิลซ้ำ, ภาษาซ้ำ, รูปแบบ ASI ผิด, point buy เกินงบ, จำนวนเวทผิด
- `build.test.ts`: golden ของ Fighter (ชุด A, มี Chain Mail), Wizard, Cleric, Rogue (expertise), Barbarian (Unarmored Defense) โดยคำนวณ AC/HP/save/สกิลด้วยมือในเทสต์; ตารางทุกอาชีพ × ทุกฉากหลัง × ทุกเผ่า ต้อง build ได้ `parseCharacter` ไม่ throw `derive` ให้ AC ≥ 10 และ HP ≥ 1 และ `hp.current === maxHp`
- `persist.test.ts`: draft เสียหรือ key ไม่มีใน SRD ถูกทิ้ง

**E2E:** `tests/e2e/builder.spec.ts` ที่ 375×812 สร้าง Fighter, Cleric, Wizard จนจบและเช็กว่าชีทแสดงสกิล เวท และ AC ตามที่เลือก (ข้ามเมื่อไม่มี `.env.local` เหมือนสเปกอื่น) ตรวจมือผ่านเส้นทาง `/local` ด้วยว่าใช้คีย์บอร์ดล้วนได้

## 9. ข้อควรยืนยันตอนวางแผน (พร้อมค่าตั้งต้น)

| เรื่อง | ค่าตั้งต้นถ้าไม่พบเหตุผลเปลี่ยน |
|---|---|
| รูปร่างของ `result.dice` (field ที่เก็บแต้มรายลูก) | อ่านตามลำดับที่สร้างลูกเต๋า 4 ลูกต่อกลุ่ม |
| ตารางของ Druid มีทั้งคอลัมน์ `Cantrips` และ `Cantrips Known` | ใช้ `Cantrips` ให้ตรงกับ `derive()` |
| รายการภาษามาตรฐานเทียบกับข้อความ SRD 5.2 (ไม่มีในข้อมูลดิบของ Open5e) | ใช้ชุดที่ใส่ใน `languages.ts` หลังเทียบกับ SRD |
| ตัวกรอง weapon mastery ของแต่ละอาชีพ (melee เท่านั้น, finesse/light ฯลฯ) | อ่านจากข้อความฟีเจอร์ Weapon Mastery ของอาชีพนั้น |
| ความครอบคลุมของการสกัดอุปกรณ์ | ต้องไม่มี gap; ที่เหลือแก้ใน `CORRECTIONS` |
| รายการ invocation ของ Warlock สกัดจากข้อความได้หรือไม่ | ถ้าไม่ได้ พิมพ์ใน overlay แล้วเทสต์ตรวจชื่อกับข้อความ SRD |

## 10. การตรวจคำแปลไทย

ท้ายงาน 5a ผมรวมข้อความ UI ภาษาไทยของวิซาร์ดทั้งหมดเป็นรายการเดียวให้ผู้ใช้ตรวจ ก่อนถือว่าเสร็จ

## 11. ความเสี่ยง

- **การสกัดข้อความ SRD เปราะ:** ลดด้วยรายงาน gap, `CORRECTIONS`, และเทสต์ทุกอาชีพ/ฉากหลังที่ต้องผ่านเสมอ
- **overlay ที่เขียนเองพิมพ์ผิด:** ลดด้วยเทสต์ที่อ้างอิงข้อความ SRD (ชื่อฟีเจอร์ ชื่อตัวเลือก จำนวนจากตาราง)
- **ข้อมูลเลเวล 2–20 ไม่มีหน้าจอใช้ใน 5a:** ถูกตรวจแค่ด้วย snapshot และเทสต์อ้างอิง SRD ส่วนการตรวจกับการใช้งานจริงจะเกิดใน 5b
- **ผู้เล่นปิดแท็บกลางทอยเต๋า:** draft ยังอยู่และผลทอยถูกบันทึกก่อนแสดงผล จึงไม่เสียค่าที่ทอยไปแล้ว
- **ข้อจำกัดที่ผู้เล่นควรรู้:** ผลของ feat/ลักษณะเผ่าบางอย่างไม่ถูกคำนวณ (หัวข้อ 2) ข้อความเตือนสั้นๆ แสดงในขั้นตรวจสอบ

## 12. งานท้ายที่ต้องไม่ลืม

- อัปเดต `CLAUDE.md` (ส่วน Rulesets และ Conventions) ให้ตรงกับ 5a โดยต่อยอดจากการแก้ที่ผู้ใช้ทำไว้ ไม่เขียนทับ
- รัน `npm test`, `npm run check`, `npm run build` และ `npm run e2e` (เมื่อมี `.env.local`) ก่อนสรุปว่าเสร็จ
