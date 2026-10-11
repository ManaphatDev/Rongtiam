// Phase 5c: the GM's room homebrew on the dev-only /local table (the local user is the GM) at phone size.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

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

test('a homebrew background can be picked in the builder', async ({ page }) => {
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
  await page.getByRole('group', { name: 'อาชีพ', exact: true }).getByRole('button', { name: 'Fighter' }).first().click();
  await page.getByRole('group', { name: /^สกิลของอาชีพ/ }).getByRole('button', { name: 'กายกรรม' }).click();
  await page.getByRole('group', { name: /^สกิลของอาชีพ/ }).getByRole('button', { name: 'ประวัติศาสตร์' }).click();
  await page.getByRole('group', { name: 'Fighting Style', exact: true }).getByRole('button', { name: 'Defense' }).click();
  for (const w of ['Greatsword', 'Longsword', 'Handaxe']) await page.getByRole('group', { name: /^Weapon Mastery/ }).getByRole('button', { name: w }).first().click();
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await page.getByRole('group', { name: 'ฉากหลัง', exact: true }).getByRole('button', { name: /Sailor/ }).click();
  await expect(page.getByText(/Feat: Alert/)).toBeVisible();
});
