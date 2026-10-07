// Phase 4: character sheets bound to tokens, HP shared live, initiative order, export/import, secret NPCs.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dropImage, openRoom } from './helpers';

test.skip(!process.env.VITE_SUPABASE_URL, 'Supabase is not configured (.env.local)');

const barWidth = (p: Page) => p.locator('.item.char .tok-bar i').first().evaluate((e) => parseFloat((e as HTMLElement).style.width));
const closeSheet = (p: Page) => p.getByRole('button', { name: 'ปิดชีท', exact: true }).click();

test('sheets: bind a token, share HP live, run initiative, export/import, keep NPCs secret', async ({ browser }) => {
  const room = await openRoom(browser, 'ห้องชีท e2e');
  const { gm, pl } = room;
  const frames: string[] = [];
  pl.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await room.join();

  // The GM picks the system.
  await gm.getByRole('tab', { name: 'ตัวละคร' }).click();
  await gm.getByRole('combobox', { name: 'ระบบกฎของห้อง' }).selectOption('dnd2024');

  // The player makes a character and a token, and binds them.
  await pl.getByRole('tab', { name: 'ตัวละคร' }).click();
  await pl.getByRole('button', { name: 'สร้างชีทเปล่า' }).click();
  await pl.locator('.sheet-panel .sheet').waitFor();
  await pl.getByLabel('ชื่อ', { exact: true }).first().fill('Pip');
  await expect(gm.locator('.roster .pick', { hasText: 'Pip' })).toBeVisible();
  await closeSheet(pl);
  await dropImage(pl, 'Hero', 200, 200, '#5aa');
  await pl.locator('.item.char').waitFor();
  await pl.locator('.item.char').click();
  await pl.getByRole('combobox', { name: 'ชีทของโทเคนนี้' }).selectOption({ label: 'Pip' });
  await expect.poll(() => barWidth(pl)).toBe(100);
  await expect.poll(() => barWidth(gm)).toBe(100);

  // The GM deals damage from the sheet; the player's token bar drops.
  await gm.locator('.roster .pick', { hasText: 'Pip' }).click();
  await gm.getByLabel('จำนวน').fill('4');
  await gm.getByRole('button', { name: 'รับความเสียหาย' }).click();
  await expect.poll(() => barWidth(pl)).toBeLessThan(100);
  await closeSheet(gm);

  // Initiative: the player rolls in from the sheet, the GM adds a monster; both see the same sorted order.
  await pl.locator('.roster .pick', { hasText: 'Pip' }).click();
  await pl.getByRole('button', { name: 'ทอย Initiative เข้าลำดับ' }).click();
  await closeSheet(pl);
  // The GM's tracker shows up (collapsed) as soon as someone is in the order.
  await gm.locator('.init-panel').waitFor({ timeout: 20_000 });
  await gm.getByRole('button', { name: 'ขยาย' }).click();
  await expect(gm.locator('.init-list li', { hasText: 'Pip' })).toBeVisible();
  await gm.locator('.init-panel').getByLabel('มอนสเตอร์').fill('Goblin');
  await gm.getByRole('button', { name: 'ทอยเข้าลำดับ' }).click();
  // The player's tracker appeared (collapsed) when they joined; open it and wait for the goblin.
  await pl.getByRole('button', { name: 'ขยาย' }).click();
  await expect(pl.locator('.init-list li')).toHaveCount(2, { timeout: 20_000 });
  await expect(pl.locator('.init-list')).toContainText('Goblin');
  const scores = await pl.locator('.init-list .score').allInnerTexts();
  expect(scores.map(Number)).toEqual([...scores.map(Number)].sort((a, b) => b - a));
  await gm.getByRole('button', { name: 'เทิร์นถัดไป' }).click();
  await expect(pl.locator('.init-list li.current')).toHaveCount(1);

  // Export and re-import the sheet: same data, a new character.
  await pl.locator('.roster .pick', { hasText: 'Pip' }).first().click();
  const [download] = await Promise.all([pl.waitForEvent('download'), pl.getByRole('button', { name: 'ส่งออกเป็นไฟล์' }).click()]);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file).toMatchObject({ format: 'tabletop-character', ruleset: 'dnd2024', data: { name: 'Pip' } });
  await closeSheet(pl);
  await pl.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'pip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(pl.locator('.roster .pick', { hasText: 'Pip' })).toHaveCount(2);
  await expect(pl.locator('.sheet-panel')).toBeVisible();
  expect(await pl.getByRole('spinbutton', { name: 'HP ปัจจุบัน' }).inputValue()).toBe(String(file.data.hp.current));
  await closeSheet(pl);

  // A secret NPC never reaches the player, not even on the wire.
  const mark = frames.length;
  await gm.getByRole('button', { name: 'สร้าง NPC ลับ' }).click();
  await gm.locator('.sheet-panel .sheet').waitFor();
  await gm.getByLabel('ชื่อ', { exact: true }).first().fill('Lich King');
  await expect(gm.locator('.roster .pick', { hasText: 'Lich King' })).toBeVisible();
  await pl.waitForTimeout(2500);
  await expect(pl.locator('.roster .pick', { hasText: 'Lich King' })).toHaveCount(0);
  expect(frames.slice(mark).some((f) => f.includes('Lich King'))).toBe(false);

  await Promise.all([room.gmCtx.close(), room.plCtx.close()]);
});
