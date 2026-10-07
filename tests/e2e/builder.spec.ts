// Phase 5a: the D&D 2024 character builder, driven on the dev-only /local table (no Supabase needed) at phone size.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

/** A group of toggle buttons by its legend. A string legend must match exactly; counted legends use a regex. */
const group = (p: Page, legend: string | RegExp) => p.getByRole('group', { name: legend, exact: typeof legend === 'string' });
const chip = (p: Page, legend: string | RegExp, label: string | RegExp) => group(p, legend).getByRole('button', { name: label }).first();
const pickAll = async (p: Page, legend: string | RegExp, labels: string[]) => {
  for (const l of labels) await chip(p, legend, l).click();
};
const next = (p: Page) => p.getByRole('button', { name: 'ถัดไป', exact: true }).click();
const wizard = (p: Page) => p.getByRole('region', { name: 'ตัวช่วยสร้างตัวละคร' });

async function openBuilder(page: Page) {
  await page.goto('/local');
  await page.getByRole('tab', { name: 'ตัวละคร' }).click();
  await page.getByRole('combobox', { name: 'ระบบกฎของห้อง' }).selectOption('dnd2024');
  await page.getByRole('button', { name: 'สร้างตัวละคร', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'อาชีพ', exact: true })).toBeVisible();
}

/** Ability → the standard-array value to give it. */
async function assignArray(page: Page, values: Record<string, string>) {
  await chip(page, 'วิธีกำหนดค่าพลัง', 'ชุดมาตรฐาน').click();
  for (const [ability, value] of Object.entries(values)) await page.getByLabel(ability, { exact: true }).selectOption({ label: value });
}

/** A Soldier Fighter (Human), through to the ability score step. */
async function fighterToScores(page: Page) {
  await chip(page, 'อาชีพ', 'Fighter').click();
  await pickAll(page, /^สกิลของอาชีพ/, ['กายกรรม', 'ประวัติศาสตร์']);
  await chip(page, 'Fighting Style', 'Defense').click();
  await pickAll(page, /^Weapon Mastery/, ['Greatsword', 'Longsword', 'Handaxe']);
  await next(page);

  await chip(page, 'ฉากหลัง', 'Soldier').click();
  await chip(page, 'ค่าพลัง +2', 'พละกำลัง').click();
  await chip(page, 'ค่าพลัง +1', 'ความอดทน').click();
  await page.getByLabel(/เครื่องมือ \(Gaming Set\)/).fill('Dice Set');
  await next(page);

  await chip(page, 'เผ่า', 'Human').click();
  await chip(page, 'สกิลของเผ่า', 'การรับรู้').click();
  await chip(page, 'Origin feat', 'Alert').click();
  await next(page);

  await pickAll(page, /^ภาษา/, ['Dwarvish', 'Elvish']);
  await next(page);
}

const reviewAc = (page: Page) => page.locator('.stat', { hasText: 'AC' }).locator('b');
const sheetAc = (page: Page) => page.locator('.sheet .stat', { hasText: 'AC' }).locator('b');

test('builds a Fighter on a phone', async ({ page }) => {
  await openBuilder(page);
  await fighterToScores(page);

  await assignArray(page, { 'พละกำลัง': '15', 'ความอดทน': '14', 'ความว่องไว': '13', 'ความเฉลียวฉลาด': '12', 'สติปัญญา': '10', 'เสน่ห์': '8' });
  await next(page);

  await chip(page, 'อุปกรณ์เริ่มต้นของอาชีพ', 'ชุด A').click();
  await chip(page, 'อุปกรณ์เริ่มต้นของฉากหลัง', 'ชุด A').click();
  await next(page);

  await page.getByLabel('ชื่อตัวละคร').fill('Rook');
  await next(page);

  await expect(reviewAc(page)).toHaveText('16'); // chain mail
  await page.getByRole('button', { name: 'สร้างตัวละครนี้' }).click();

  await expect(page.locator('.sheet-panel .sheet')).toBeVisible();
  await expect(page.getByLabel('ชื่อ', { exact: true }).first()).toHaveValue('Rook');
  await expect(sheetAc(page)).toHaveText('16');
  await expect(page.locator('.sheet .plain-list').first()).toContainText('Savage Attacker');
  await expect(page.locator('.sheet .plain-list').first()).toContainText('Defense');
});

test('builds a Cleric on a phone', async ({ page }) => {
  await openBuilder(page);
  await chip(page, 'อาชีพ', 'Cleric').click();
  await pickAll(page, /^สกิลของอาชีพ/, ['การแพทย์', 'โน้มน้าว']);
  await chip(page, 'Divine Order', 'Protector').click();
  await next(page);

  await chip(page, 'ฉากหลัง', 'Acolyte').click();
  await chip(page, 'ค่าพลัง +2', 'ความเฉลียวฉลาด').click();
  await chip(page, 'ค่าพลัง +1', 'สติปัญญา').click();
  await pickAll(page, /^Magic Initiate: cantrip/, ['Guidance', 'Light']);
  await chip(page, 'Magic Initiate: เวทเลเวล 1', 'Bless').click();
  await next(page);

  await chip(page, 'เผ่า', 'Human').click();
  await chip(page, 'สกิลของเผ่า', 'การรับรู้').click();
  await chip(page, 'Origin feat', 'Savage Attacker').click();
  await next(page);

  await pickAll(page, /^ภาษา/, ['Elvish', 'Halfling']);
  await next(page);

  await assignArray(page, { 'ความเฉลียวฉลาด': '15', 'ความอดทน': '14', 'พละกำลัง': '13', 'ความว่องไว': '12', 'เสน่ห์': '10', 'สติปัญญา': '8' });
  await next(page);

  await chip(page, 'อุปกรณ์เริ่มต้นของอาชีพ', 'ชุด A').click();
  await chip(page, 'อุปกรณ์เริ่มต้นของฉากหลัง', 'ชุด A').click();
  await next(page);

  await pickAll(page, /^Cantrip/, ['Sacred Flame', 'Mending', 'Thaumaturgy']);
  await pickAll(page, /^เวทเลเวล 1/, ['Cure Wounds', 'Healing Word', 'Guiding Bolt', 'Shield of Faith']);
  await next(page);

  await page.getByLabel('ชื่อตัวละคร').fill('Sister Mae');
  await next(page);

  await expect(reviewAc(page)).toHaveText('16'); // chain shirt 13 + Dex 1 + shield 2
  await page.getByRole('button', { name: 'สร้างตัวละครนี้' }).click();

  await expect(page.locator('.sheet-panel .sheet')).toBeVisible();
  await expect(sheetAc(page)).toHaveText('16');
  await expect(page.locator('.sheet .spells')).toContainText('Sacred Flame');
  await expect(page.locator('.sheet .spells')).toContainText('Cure Wounds');
});

test('builds a Wizard on a phone', async ({ page }) => {
  await openBuilder(page);
  await chip(page, 'อาชีพ', 'Wizard').click();
  await pickAll(page, /^สกิลของอาชีพ/, ['สืบสวน', 'การแพทย์']);
  await next(page);

  await chip(page, 'ฉากหลัง', 'Sage').click();
  await chip(page, 'ค่าพลัง +2', 'สติปัญญา').click();
  await chip(page, 'ค่าพลัง +1', 'ความอดทน').click();
  await pickAll(page, /^Magic Initiate: cantrip/, ['Elementalism', 'Fire Bolt']);
  await chip(page, 'Magic Initiate: เวทเลเวล 1', 'Mage Armor').click();
  await next(page);

  await chip(page, 'เผ่า', 'Elf').click();
  await chip(page, 'สายเลือดเอลฟ์', 'High Elf').click();
  await chip(page, 'สกิลของเผ่า', 'การรับรู้').click();
  await next(page);

  await pickAll(page, /^ภาษา/, ['Elvish', 'Gnomish']);
  await next(page);

  await assignArray(page, { 'สติปัญญา': '15', 'ความอดทน': '14', 'ความว่องไว': '13', 'ความเฉลียวฉลาด': '12', 'เสน่ห์': '10', 'พละกำลัง': '8' });
  await next(page);

  await chip(page, 'อุปกรณ์เริ่มต้นของอาชีพ', 'ชุด A').click();
  await chip(page, 'อุปกรณ์เริ่มต้นของฉากหลัง', 'ชุด A').click();
  await next(page);

  await pickAll(page, /^Cantrip/, ['Acid Splash', 'Chill Touch', 'Dancing Lights']);
  await pickAll(page, /^เวทเลเวล 1 ในสมุดเวท/, ['Alarm', 'Burning Hands', 'Charm Person', 'Chromatic Orb', 'Color Spray', 'Comprehend Languages']);
  await next(page);

  await page.getByLabel('ชื่อตัวละคร').fill('Mira');
  await next(page);

  await expect(reviewAc(page)).toHaveText('11'); // no armor, Dex 13
  await page.getByRole('button', { name: 'สร้างตัวละครนี้' }).click();

  await expect(page.locator('.sheet-panel .sheet')).toBeVisible();
  await expect(sheetAc(page)).toHaveText('11');
  await expect(page.locator('.sheet .spells')).toContainText('Burning Hands');
});

test('keeps the draft when the panel is closed, and drops it when told to', async ({ page }) => {
  await openBuilder(page);
  await chip(page, 'อาชีพ', 'Fighter').click();
  await wizard(page).getByRole('button', { name: 'ปิด', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'อาชีพ', exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'สร้างตัวละคร', exact: true }).click();
  await expect(chip(page, 'อาชีพ', 'Fighter')).toHaveAttribute('aria-pressed', 'true');

  await wizard(page).getByRole('button', { name: 'ทิ้งร่าง' }).click();
  await wizard(page).getByRole('button', { name: 'กดอีกครั้งเพื่อยืนยัน' }).click();
  await expect(chip(page, 'อาชีพ', 'Fighter')).toHaveAttribute('aria-pressed', 'false');
});

test('keeps the ability-score roll when the panel is closed while the dice are still rolling', async ({ page }) => {
  await openBuilder(page);
  await fighterToScores(page);

  await chip(page, 'วิธีกำหนดค่าพลัง', 'ทอยเต๋า').click();
  await wizard(page).getByRole('button', { name: /ทอยค่าพลัง/ }).click();
  await expect(wizard(page).getByRole('button', { name: 'กำลังทอย…' })).toBeVisible();
  await wizard(page).getByRole('button', { name: 'ปิด', exact: true }).click();

  // The dice land after the panel is gone; the saved draft gets the six totals anyway.
  const rolled = () => page.evaluate(() => JSON.parse(localStorage.getItem('rongtiam:builder:local')!).draft.rolled);
  await expect.poll(rolled, { timeout: 45_000 }).not.toBeNull();
  expect(await rolled()).toHaveLength(6);

  await page.getByRole('button', { name: 'สร้างตัวละคร', exact: true }).click();
  await expect(page.getByText(/^ผลทอย:/)).toBeVisible();
  await expect(wizard(page).getByRole('button', { name: /ทอยค่าพลัง/ })).toBeHidden();
});

test('a class skill that the background later grants can still be taken back', async ({ page }) => {
  await openBuilder(page);
  await chip(page, 'อาชีพ', 'Rogue').click();
  await pickAll(page, /^สกิลของอาชีพ/, ['มือไว', 'ลอบเร้น', 'กายกรรม', 'หลอกลวง']);
  await pickAll(page, /^Expertise/, ['กายกรรม', 'หลอกลวง']);
  await pickAll(page, /^Weapon Mastery/, ['Club', 'Dagger']);
  await next(page);
  await chip(page, 'ฉากหลัง', 'Criminal').click(); // grants Sleight of Hand and Stealth too
  await wizard(page).getByRole('button', { name: /1\. อาชีพ/ }).click();

  const stealth = chip(page, /^สกิลของอาชีพ/, 'ลอบเร้น');
  await expect(stealth).toHaveAttribute('aria-pressed', 'true');
  await expect(stealth).toBeEnabled();
  await stealth.click();
  await expect(stealth).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, /^สกิลของอาชีพ/, 'การรับรู้')).toBeEnabled(); // the count is no longer full
});
