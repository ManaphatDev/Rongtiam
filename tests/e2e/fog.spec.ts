// Phase 2: fog the player cannot see through, items hidden from players never reaching them, and Sync View.
import { expect, test, type Page } from '@playwright/test';
import { dropImage, openRoom, pixel } from './helpers';

test.skip(!process.env.VITE_SUPABASE_URL, 'Supabase is not configured (.env.local)');

const worldView = (p: Page) => p.locator('.world').evaluate((el) => {
  const m = (el as HTMLElement).style.transform.match(/translate\(([-\d.e]+)px, ?([-\d.e]+)px\) scale\(([-\d.e]+)\)/)!;
  return { x: +m[1], y: +m[2], k: +m[3] };
});
const stageCenter = async (p: Page) => {
  const b = (await p.locator('.stage').boundingBox())!;
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
};
const bright = ([r, g, b]: number[]) => (r + g + b) / 3;

test('fog hides the map from players, hidden items never reach them, and Sync View aligns views', async ({ browser }) => {
  const room = await openRoom(browser, 'ห้องหมอก e2e');
  const { gm, pl } = room;

  // Record everything the player's browser receives over the realtime socket.
  const frames: string[] = [];
  pl.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await room.join();

  // A bright map so fogged and clear areas are easy to tell apart.
  await gm.getByRole('tab', { name: 'แมพ' }).click();
  await dropImage(gm, 'MAP', 1000, 700, '#ffff00');
  await expect(pl.locator('.item.map img')).toHaveJSProperty('complete', true);

  // Sync View: the GM zooms in, and the player's view follows exactly (same window size).
  await gm.keyboard.press('+');
  await gm.keyboard.press('+');
  expect(await worldView(pl)).not.toEqual(await worldView(gm));
  await gm.getByTitle(/พาผู้เล่นทุกคนมาดู/).click();
  await expect(pl.getByText('GM พาไปดูจุดนี้')).toBeVisible();
  await expect.poll(async () => {
    const [a, b] = [await worldView(gm), await worldView(pl)];
    return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.k - b.k) < 1e-3;
  }).toBe(true);

  // GM covers the table and cuts a window in the middle.
  await gm.getByRole('tab', { name: 'หมอก' }).click();
  await gm.getByRole('button', { name: 'คลุมหมดทั้งโต๊ะ' }).click();
  await gm.getByRole('button', { name: 'กดอีกครั้งเพื่อยืนยัน' }).click();
  await gm.getByRole('button', { name: 'ตัดหมอก', exact: true }).click();
  const c = await stageCenter(gm);
  await gm.mouse.move(c.x - 120, c.y - 90);
  await gm.mouse.down();
  await gm.mouse.move(c.x + 120, c.y + 90, { steps: 6 });
  await gm.mouse.up();
  await expect(gm.getByText('(2 รูปทรง)')).toBeVisible();

  // The player sees the map inside the window and solid fog just outside it.
  const pc = await stageCenter(pl);
  await expect.poll(async () => bright(await pixel(pl, pc.x + 220, pc.y))).toBeLessThan(60);
  await expect.poll(async () => bright(await pixel(pl, pc.x, pc.y))).toBeGreaterThan(150);
  // Fog is opaque everywhere away from the soft edge, even where the cloud texture is lightest.
  for (const [dx, dy] of [[260, 160], [-300, -200], [-260, 150], [330, -60]]) {
    expect(bright(await pixel(pl, pc.x + dx, pc.y + dy))).toBeLessThan(60);
  }
  // The GM still sees through the fog (faintly).
  expect(bright(await pixel(gm, c.x + 220, c.y))).toBeGreaterThan(60);

  // A sticker hidden from the moment it is created never shows up for the player, not even on the wire.
  await gm.getByRole('tab', { name: 'สติกเกอร์' }).click();
  await gm.getByRole('button', { name: 'แปะสติกเกอร์ 💀' }).click();
  await gm.getByLabel(/ซ่อนจากผู้เล่น/).check();
  await gm.getByRole('button', { name: 'ทำสำเนา' }).click();
  const secretId = await gm.locator('.item.sel').getAttribute('data-id');
  expect(secretId).toBeTruthy();
  await expect(gm.locator(`.item[data-id="${secretId}"]`)).toHaveClass(/hidden-gm/);
  // Give realtime time to deliver anything it (wrongly) would, then check.
  await pl.waitForTimeout(2500);
  await expect(pl.locator(`.item[data-id="${secretId}"]`)).toHaveCount(0);
  expect(frames.some((f) => f.includes(secretId!))).toBe(false);
  expect(frames.length).toBeGreaterThan(0);

  await Promise.all([room.gmCtx.close(), room.plCtx.close()]);
});
