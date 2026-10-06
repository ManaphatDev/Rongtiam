import { describe, expect, it } from 'vitest';
import { cloudPixels, parseHex, tileNoise } from './clouds';

const at = (n: Float32Array, size: number, x: number, y: number) => n[((y + size) % size) * size + ((x + size) % size)];

describe('tileNoise', () => {
  const size = 64;
  const n = tileNoise(size, 7);

  it('stays in 0..1 and is not flat', () => {
    let lo = 1, hi = 0, sum = 0;
    for (const v of n) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      sum += v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.3);
    expect(sum / n.length).toBeGreaterThan(0.3);
    expect(sum / n.length).toBeLessThan(0.7);
  });

  it('tiles seamlessly: the wrap-around step is no bigger than any ordinary step', () => {
    let inner = 0, seam = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size - 1; x++) inner = Math.max(inner, Math.abs(at(n, size, x + 1, y) - at(n, size, x, y)));
      seam = Math.max(seam, Math.abs(at(n, size, 0, y) - at(n, size, size - 1, y)));
      seam = Math.max(seam, Math.abs(at(n, size, y, 0) - at(n, size, y, size - 1)));
    }
    expect(seam).toBeLessThanOrEqual(inner + 1e-6);
  });

  it('is the same for the same seed, different for another', () => {
    expect(tileNoise(size, 7)).toEqual(n);
    expect(tileNoise(size, 8)).not.toEqual(n);
  });
});

describe('cloudPixels', () => {
  it('is fully opaque and stays between the two colours', () => {
    const px = cloudPixels(tileNoise(16, 1), [10, 20, 30], [50, 60, 70]);
    expect(px).toHaveLength(16 * 16 * 4);
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i + 3]).toBe(255);
      expect(px[i]).toBeGreaterThanOrEqual(10);
      expect(px[i]).toBeLessThanOrEqual(50);
    }
  });

  it('parses colour tokens', () => {
    expect(parseHex(' #1b1626 ')).toEqual([27, 22, 38]);
    expect(parseHex('#abc')).toEqual([170, 187, 204]);
    expect(parseHex('nope')).toBeNull();
  });
});
