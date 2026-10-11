// Phase 5b: the D&D 2024 level-up on the dev-only /local table (no Supabase; the local user is the GM) at phone size.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

const group = (p: Page, legend: string) => p.getByRole('group', { name: legend, exact: true });
const next = (p: Page) => p.getByRole('button', { name: 'ถัดไป', exact: true }).click();
const wizard = (p: Page) => p.getByRole('region', { name: 'ตัวช่วยขึ้นเลเวล' });

/** The HP roll stored in any saved level-up draft, or null when none is decided yet. */
const storedRoll = (p: Page) => p.evaluate(() =>
  Object.keys(localStorage).filter((k) => k.startsWith('rongtiam:levelup:'))
    .map((k) => JSON.parse(localStorage.getItem(k)!).draft.hp.rolled).find((r) => r !== null) ?? null);

/** A blank D&D sheet (a level-1 Fighter) with the GM allowing it to reach `allowed`. */
async function blankFighter(page: Page, allowed: number) {
  await page.goto('/local');
  await page.getByRole('tab', { name: 'ตัวละคร' }).click();
  await page.getByRole('combobox', { name: 'ระบบกฎของห้อง' }).selectOption('dnd2024');
  await page.getByRole('button', { name: 'สร้างชีทเปล่า' }).click();
  await page.getByLabel('ชื่อ', { exact: true }).first().fill('Rook');
  const allow = page.getByLabel('เลเวลที่อนุญาต');
  await allow.fill(String(allowed));
  await allow.press('Tab'); // commits the number (change fires on blur)
  await expect(page.getByText(`ขึ้นเลเวลได้ (ถึงเลเวล ${allowed})`)).toBeVisible();
}

test('levels a Fighter from 1 to 3 on a phone', async ({ page }) => {
  await blankFighter(page, 3);
  await page.getByRole('button', { name: 'ขึ้นเลเวล', exact: true }).click();

  // Level 2: HP only.
  await expect(wizard(page).getByRole('heading', { name: /ขึ้นเลเวล 2/ })).toBeVisible();
  await group(page, 'วิธีเพิ่ม HP').getByRole('button', { name: /ค่าเฉลี่ย/ }).click();
  await next(page);
  await page.getByRole('button', { name: 'ยืนยันขึ้นเลเวล 2' }).click();

  // Level 3 follows at once: roll HP, then the subclass.
  await expect(wizard(page).getByRole('heading', { name: /ขึ้นเลเวล 3/ })).toBeVisible();
  await group(page, 'วิธีเพิ่ม HP').getByRole('button', { name: /ทอย 1d10/ }).click();
  await page.getByRole('button', { name: 'ทอย Hit Die (1d10)' }).click();
  await expect(page.getByText(/^ทอยได้ \d+$/)).toBeVisible({ timeout: 15_000 });
  await next(page);
  await expect(page.getByText('Champion', { exact: true })).toBeVisible();
  await next(page);
  await page.getByRole('button', { name: 'ยืนยันขึ้นเลเวล 3' }).click();

  // Back on the sheet at level 3 with the subclass set.
  await expect(page.locator('.sheet-panel .sheet')).toBeVisible();
  await expect(page.getByLabel('เลเวล', { exact: true })).toHaveValue('3');
  await expect(page.getByRole('combobox', { name: 'สาย' })).toHaveValue('champion');
  await expect(page.getByRole('button', { name: 'ขึ้นเลเวล', exact: true })).toBeVisible(); // a GM may always level up
});

test('keeps the HP roll when the page is reloaded while the dice roll', async ({ page }) => {
  await blankFighter(page, 2);
  await page.getByRole('button', { name: 'ขึ้นเลเวล', exact: true }).click();
  await group(page, 'วิธีเพิ่ม HP').getByRole('button', { name: /ทอย 1d10/ }).click();
  await page.getByRole('button', { name: 'ทอย Hit Die (1d10)' }).click();
  // The result is saved as soon as it is decided; wait for that, then reload before the dice land.
  await expect.poll(() => storedRoll(page)).not.toBeNull();
  const rolled = await storedRoll(page);
  await page.reload();
  // /local keeps no characters across a reload (its backend is in memory), so check the stored draft directly: it still holds the same roll.
  expect(await storedRoll(page)).toBe(rolled);
});
