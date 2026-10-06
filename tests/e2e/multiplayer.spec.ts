// GM and player in separate browser contexts against the real Supabase dev project.
import { expect, test, type Page } from '@playwright/test';
import { dropImage } from './helpers';

test.skip(!process.env.VITE_SUPABASE_URL, 'Supabase is not configured (.env.local)');

const transformOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => (el as HTMLElement).style.transform);

test('create, join with approval, and sync the table both ways', async ({ browser }) => {
  const gmCtx = await browser.newContext();
  const plCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  const pl = await plCtx.newPage();

  // GM creates a room.
  await gm.goto('/');
  await gm.getByLabel('ชื่อห้อง').fill('ห้อง e2e');
  await gm.getByLabel('ชื่อที่เพื่อนจะเห็น').fill('GM e2e');
  await gm.getByRole('button', { name: 'สร้างห้อง' }).click();
  await expect(gm).toHaveURL(/\/r\/[1-9A-HJ-NP-Za-km-z]{10}$/);
  await expect(gm.locator('.conn.live')).toBeVisible();
  const roomUrl = gm.url();

  // Player asks to join and waits.
  await pl.goto(roomUrl);
  await pl.getByLabel('ชื่อที่เพื่อนจะเห็น').fill('Player e2e');
  await pl.getByRole('button', { name: 'ขอเข้าห้อง' }).click();
  await expect(pl.getByText('รอ GM รับเข้าห้อง…')).toBeVisible();

  // GM approves from the popup.
  await gm.getByRole('button', { name: 'รับเข้าห้อง' }).click();
  await expect(pl.locator('.stage')).toBeVisible();
  await expect(pl.locator('.conn.live')).toBeVisible();

  // GM adds a map; the player sees it with its image loaded.
  await gm.getByRole('tab', { name: 'แมพ' }).click();
  await dropImage(gm, 'MAP', 1000, 700, '#c9b38a');
  await expect(pl.locator('.item.map img')).toHaveJSProperty('complete', true);
  await expect.poll(() => pl.locator('.item.map img').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Player adds a character; the GM sees it.
  await pl.getByRole('tab', { name: 'ตัวละคร' }).click();
  await dropImage(pl, 'Hero', 200, 200, '#5aa');
  await expect(gm.locator('.item.char')).toHaveCount(1);

  // Player drags the character; the GM sees the new position.
  const before = await transformOf(gm, '.item.char');
  const box = (await pl.locator('.item.char').boundingBox())!;
  await pl.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await pl.mouse.down();
  await pl.mouse.move(box.x + 160, box.y + 90, { steps: 8 });
  await pl.mouse.up();
  await expect.poll(() => transformOf(gm, '.item.char'), { timeout: 5000 }).not.toBe(before);

  // The player cannot move the map.
  const mapBefore = await transformOf(pl, '.item.map');
  const mb = (await pl.locator('.item.map').boundingBox())!;
  await pl.mouse.move(mb.x + 30, mb.y + 30);
  await pl.mouse.down();
  await pl.mouse.move(mb.x + 200, mb.y + 200, { steps: 5 });
  await pl.mouse.up();
  expect(await transformOf(pl, '.item.map')).toBe(mapBefore);

  // GM hides the character; it disappears for the player and comes back when unhidden.
  await gm.locator('.item.char').first().click();
  await gm.getByLabel(/ซ่อนจากผู้เล่น/).check();
  await expect(pl.locator('.item.char')).toHaveCount(0);
  await gm.getByLabel(/ซ่อนจากผู้เล่น/).uncheck();
  await expect(pl.locator('.item.char')).toHaveCount(1);

  // State survives a reload.
  await pl.reload();
  await expect(pl.locator('.item.map')).toHaveCount(1);
  await expect(pl.locator('.item.char')).toHaveCount(1);

  // A roll by the player shows up in the GM's log.
  await pl.getByRole('tab', { name: 'ลูกเต๋า' }).click();
  await pl.getByRole('button', { name: 'd20', exact: true }).click();
  await gm.getByRole('tab', { name: 'ลูกเต๋า' }).click();
  await expect(gm.locator('.log li').first()).toContainText('Player e2e');

  // A third browser becomes GM through the secret link.
  await gm.getByRole('tab', { name: 'ผู้เล่น' }).click();
  const gmLink = await gm.getByLabel('ลิงก์ GM').inputValue();
  const thirdCtx = await browser.newContext();
  const third = await thirdCtx.newPage();
  await third.goto(gmLink);
  await expect(third.locator('.stage')).toBeVisible();
  await third.getByRole('tab', { name: 'ผู้เล่น' }).click();
  await expect(third.getByText('ลิงก์ GM (ลับ)')).toBeVisible();
  expect(third.url()).not.toContain('#gm=');

  // GM kicks the player.
  const row = gm.locator('.people li', { hasText: 'Player e2e' });
  await row.getByRole('button', { name: 'เชิญออก' }).click();
  await row.getByRole('button', { name: 'กดอีกครั้งเพื่อยืนยัน' }).click();
  await expect(pl.getByText(/คุณถูกเชิญออกจากห้อง|ขอเข้าห้อง/)).toBeVisible();

  await Promise.all([gmCtx.close(), plCtx.close(), thirdCtx.close()]);
});
