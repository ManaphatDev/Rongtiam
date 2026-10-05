// Image pipeline (ported from legacy processImage): downscale + re-encode, then name the file by its SHA-256.
import { sha256Hex } from '../lib/hash';

export interface Processed {
  blob: Blob;
  w: number;
  h: number;
  /** `<sha256>.<ext>` */
  file: string;
}

export const MAX = { map: 2600, token: 512, sticker: 480 } as const;

export const isImg = (f: File | null | undefined): f is File => !!f && !!f.type && f.type.startsWith('image/');

function loadImg(file: Blob): Promise<{ im: HTMLImageElement; url: string }> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => res({ im, url });
    im.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('อ่านรูปนี้ไม่ได้'));
    };
    im.src = url;
  });
}

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function processImage(
  file: Blob,
  { max, type, quality, bg }: { max: number; type: 'image/webp' | 'image/jpeg'; quality: number; bg?: string },
): Promise<Processed> {
  const { im, url } = await loadImg(file);
  try {
    const sw = im.naturalWidth, sh = im.naturalHeight;
    const r = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * r));
    c.height = Math.max(1, Math.round(sh * r));
    const ctx = c.getContext('2d')!;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(im, 0, 0, c.width, c.height);
    // Safari cannot encode WebP and silently returns PNG; keep whatever the browser produced.
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('แปลงรูปไม่สำเร็จ'))), type, quality));
    const ext = EXT[blob.type] ?? 'png';
    return { blob, w: c.width, h: c.height, file: `${await sha256Hex(blob)}.${ext}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}
