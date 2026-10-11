// Phase 5c: the GM's room homebrew on the dev-only /local table (the local user is the GM) at phone size.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

/** A group of toggle buttons by its legend (copied from builder.spec.ts). */
const group = (p: Page, legend: string | RegExp) => p.getByRole('group', { name: legend, exact: typeof legend === 'string' });
const chip = (p: Page, legend: string | RegExp, label: string | RegExp) => group(p, legend).getByRole('button', { name: label }).first();
const pickAll = async (p: Page, legend: string | RegExp, labels: string[]) => {
  for (const l of labels) await chip(p, legend, l).click();
};
const next = (p: Page) => p.getByRole('button', { name: 'ถัดไป', exact: true }).click();

const editor = (p: Page) => p.getByRole('region', { name: 'จัดการ homebrew' });

async function openEditor(page: Page) {
  await page.goto('/local');
  await page.getByRole('tab', { name: 'ตัวละคร' }).click();
  await page.getByRole('combobox', { name: 'ระบบกฎของห้อง' }).selectOption('dnd2024');
  await page.getByRole('button', { name: 'จัดการ homebrew' }).click();
  await expect(editor(page)).toBeVisible();
}

test('a +1 homebrew weapon adds 1 to the attack on the sheet', async ({ page }) => {
  await openEditor(page);
  await editor(page).getByRole('button', { name: 'เพิ่ม', exact: true }).click();
  await editor(page).getByLabel('ชื่อ', { exact: true }).fill('Flame Tongue');
  await editor(page).getByLabel('เต๋าดาเมจ (เช่น 1d8)').fill('1d8');
  const bonus = editor(page).getByLabel('โบนัสเวทมนตร์ (+0 ถึง +3)');
  await bonus.fill('1');
  await bonus.press('Tab');
  await editor(page).getByRole('button', { name: 'บันทึก' }).click();
  await expect(editor(page).getByText('Flame Tongue')).toBeVisible();
  await editor(page).getByRole('button', { name: 'ปิด' }).click();

  await page.getByRole('button', { name: 'สร้างชีทเปล่า' }).click();
  await page.getByRole('combobox', { name: 'เพิ่มอาวุธ' }).selectOption({ label: 'Flame Tongue · homebrew (1d8 +1)' });
  await page.getByRole('button', { name: 'เพิ่ม', exact: true }).first().click();
  const row = page.locator('.attacks li', { hasText: 'Flame Tongue' });
  await expect(row).toBeVisible();
  // A blank Fighter has Str 10 (+0), proficiency +2: plain +2, with the +1 → +3; damage 1d8+1.
  await expect(row.getByRole('button', { name: /โจมตี \+3/ })).toBeVisible();
  await expect(row.getByRole('button', { name: '1d8+1' })).toBeVisible();
});

test('a homebrew background builds a character through the whole builder', async ({ page }) => {
  await openEditor(page);
  await editor(page).getByRole('button', { name: 'ฉากหลัง' }).click();
  await editor(page).getByRole('button', { name: 'เพิ่ม', exact: true }).click();
  await editor(page).getByLabel('ชื่อ', { exact: true }).fill('Sailor');
  const abilities = editor(page).getByRole('group', { name: 'ค่าพลัง 3 ค่าของฉากหลัง' });
  for (const a of ['พละกำลัง', 'ความว่องไว', 'ความเฉลียวฉลาด']) await abilities.getByRole('button', { name: a }).click();
  const skills = editor(page).getByRole('group', { name: 'สกิล 2 อย่าง' });
  for (const s of ['กรีฑา', 'การรับรู้']) await skills.getByRole('button', { name: s }).click();
  await editor(page).getByRole('button', { name: 'บันทึก' }).click();
  await expect(editor(page).getByText('Sailor')).toBeVisible();
  await editor(page).getByRole('button', { name: 'ปิด' }).click();

  await page.getByRole('button', { name: 'สร้างตัวละคร', exact: true }).click();
  await chip(page, 'อาชีพ', 'Fighter').click();
  await pickAll(page, /^สกิลของอาชีพ/, ['กายกรรม', 'ประวัติศาสตร์']);
  await chip(page, 'Fighting Style', 'Defense').click();
  await pickAll(page, /^Weapon Mastery/, ['Greatsword', 'Longsword', 'Handaxe']);
  await next(page);

  await chip(page, 'ฉากหลัง', /Sailor/).click();
  await expect(page.getByText('Feat: Alert · สกิล: กรีฑา, การรับรู้')).toBeVisible();
  await chip(page, 'ค่าพลัง +2', 'พละกำลัง').click();
  await chip(page, 'ค่าพลัง +1', 'ความว่องไว').click();
  await next(page);

  // The background gives Alert, so the species takes another Origin feat; Perception is the background's already.
  await chip(page, 'เผ่า', 'Human').click();
  await chip(page, 'สกิลของเผ่า', 'หยั่งรู้').click();
  await chip(page, 'Origin feat', 'Savage Attacker').click();
  await next(page);

  await pickAll(page, /^ภาษา/, ['Dwarvish', 'Elvish']);
  await next(page);

  await chip(page, 'วิธีกำหนดค่าพลัง', 'ชุดมาตรฐาน').click();
  const array = { 'พละกำลัง': '15', 'ความอดทน': '14', 'ความว่องไว': '13', 'ความเฉลียวฉลาด': '12', 'สติปัญญา': '10', 'เสน่ห์': '8' };
  for (const [ability, value] of Object.entries(array)) await page.getByLabel(ability, { exact: true }).selectOption({ label: value });
  await next(page);

  await chip(page, 'อุปกรณ์เริ่มต้นของอาชีพ', 'ชุด A').click();
  // The form's Sailor has no gear, so both of its kits are gold.
  await chip(page, 'อุปกรณ์เริ่มต้นของฉากหลัง', 'รับเป็นทอง 50 GP').click();
  await next(page);

  await page.getByLabel('ชื่อตัวละคร').fill('Salty');
  await next(page);

  await page.getByRole('button', { name: 'สร้างตัวละครนี้' }).click();
  await expect(page.locator('.sheet-panel .sheet')).toBeVisible();
  await expect(page.locator('.sheet select[aria-label="ฉากหลัง"] option:checked')).toHaveText('Sailor · homebrew');
});
