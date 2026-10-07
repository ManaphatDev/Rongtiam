// Shared steps for the multiplayer specs.
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

/** Drops a generated PNG onto the stage, as if dragged from the desktop. */
export async function dropImage(page: Page, name: string, w: number, h: number, color: string) {
  await page.evaluate(async ({ name, w, h, color }) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#000';
    x.font = '60px sans-serif';
    x.fillText(name, 20, 80);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], `${name}.png`, { type: 'image/png' }));
    const st = document.querySelector('.stage')!;
    const r = st.getBoundingClientRect();
    st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }, { name, w, h, color });
}

/** GM creates a room and a player joins with approval; both end on a live table. */
export async function openRoom(browser: Browser, name: string, opts: { playerOptions?: BrowserContextOptions } = {}) {
  const gmCtx = await browser.newContext();
  const plCtx = await browser.newContext(opts.playerOptions);
  const gm = await gmCtx.newPage();
  const pl = await plCtx.newPage();

  await gm.goto('/');
  await gm.getByLabel('ชื่อห้อง').fill(name);
  await gm.getByLabel('ชื่อที่เพื่อนจะเห็น').fill('GM e2e');
  await gm.getByRole('button', { name: 'สร้างห้อง' }).click();
  await expect(gm).toHaveURL(/\/r\/[1-9A-HJ-NP-Za-km-z]{10}$/);
  await expect(gm.locator('.conn.live')).toBeVisible();

  return {
    gm, pl, gmCtx, plCtx,
    /** Joins as the player (call after attaching any listeners to `pl`). */
    async join() {
      await pl.goto(gm.url());
      await pl.getByLabel('ชื่อที่เพื่อนจะเห็น').fill('Player e2e');
      await pl.getByRole('button', { name: 'ขอเข้าห้อง' }).click();
      await gm.getByRole('button', { name: 'รับเข้าห้อง' }).click();
      await expect(pl.locator('.stage')).toBeVisible();
      await expect(pl.locator('.conn.live')).toBeVisible();
    },
  };
}

/** RGB of one screen pixel, read from a real screenshot. */
export async function pixel(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, png);
}
