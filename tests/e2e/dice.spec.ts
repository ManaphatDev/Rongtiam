// Phase 3: 3D dice replay for everyone with one official result, secret GM rolls, and reduced motion.
import { expect, test, type Page } from '@playwright/test';
import { openRoom } from './helpers';

test.skip(!process.env.VITE_SUPABASE_URL, 'Supabase is not configured (.env.local)');

async function rollExpr(page: Page, expr: string) {
  await page.getByLabel('สูตรการทอย').fill(expr);
  await page.getByRole('button', { name: 'ทอย', exact: true }).click();
}
const panelTotal = (page: Page) => page.locator('.result .big');

test('everyone sees the same roll; secret rolls stay secret; reduced motion shows results at once', async ({ browser }) => {
  const room = await openRoom(browser, 'ห้องลูกเต๋า e2e', { playerOptions: { reducedMotion: 'reduce' } });
  const { gm, pl } = room;
  const frames: string[] = [];
  pl.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await room.join();
  await gm.getByRole('tab', { name: 'ลูกเต๋า' }).click();
  await pl.getByRole('tab', { name: 'ลูกเต๋า' }).click();

  // The GM throws; the player's screen replays the dice and then shows the same total.
  await rollExpr(gm, '3d6+1');
  await expect(pl.locator('.dicecanvas.on')).toBeVisible();
  await expect(panelTotal(gm)).toHaveText(/^\d+$/, { timeout: 20_000 });
  const total = await panelTotal(gm).innerText();
  await expect(pl.locator('.toast .t2')).toHaveText(total);
  await expect(pl.locator('.log li').first()).toContainText('3d6 + 1');
  await expect(pl.locator('.log li').first().locator('b')).toHaveText(total);

  // A secret GM roll: the player hears that it happened and nothing else, not even over the wire.
  const mark = frames.length;
  await gm.getByLabel(/ทอยลับ/).check();
  await rollExpr(gm, '7d8+37');
  await expect(pl.locator('.toast').getByText('GM ทอยลับ')).toBeVisible();
  await expect(panelTotal(gm)).toHaveText(/^\d+$/, { timeout: 20_000 });
  await pl.waitForTimeout(2000);
  const after = frames.slice(mark).join('\n');
  expect(after).not.toContain('7d8');
  expect(after).not.toContain('"kinds"');
  expect(after).not.toContain(`"total":${await panelTotal(gm).innerText()}`);
  await expect(pl.locator('.log')).not.toContainText('7d8');

  // The player prefers reduced motion: once the dice code is loaded, their own roll resolves straight away.
  await rollExpr(pl, '1d20');
  await expect(panelTotal(pl)).toHaveText(/^\d+$/, { timeout: 20_000 });
  const t0 = Date.now();
  await rollExpr(pl, '1d20');
  await expect(panelTotal(pl)).toHaveText(/^\d+$/);
  expect(Date.now() - t0).toBeLessThan(1500);
  // The GM still sees the player's roll with its real total.
  await expect(gm.locator('.log li').first()).toContainText('Player e2e');

  await Promise.all([room.gmCtx.close(), room.plCtx.close()]);
});
