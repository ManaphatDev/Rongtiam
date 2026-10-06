// Seamlessly tiling cloud texture for the fog: fractal value noise on a wrapping lattice, coloured between the
// fog colour and a slightly lighter wisp colour. Every pixel is opaque, so textured fog hides exactly as much as
// flat fog did.

export type Rgb = [number, number, number];

/** Small deterministic PRNG, so every client draws the same clouds. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** size×size noise in 0..1 that wraps at the edges. Octave o has `cells·2^o` lattice cells per side. */
export function tileNoise(size: number, seed: number, octaves = 4, cells = 4): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y * n) / size, y0 = Math.floor(fy), y1 = (y0 + 1) % n;
      const ty = smooth(fy - y0);
      for (let x = 0; x < size; x++) {
        const fx = (x * n) / size, x0 = Math.floor(fx), x1 = (x0 + 1) % n;
        const tx = smooth(fx - x0);
        const a = lat[y0 * n + x0] + (lat[y0 * n + x1] - lat[y0 * n + x0]) * tx;
        const b = lat[y1 * n + x0] + (lat[y1 * n + x1] - lat[y1 * n + x0]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** RGBA pixels: dense fog where the noise is low, lighter wisps where it is high. Always opaque. */
export function cloudPixels(noise: Float32Array, base: Rgb, wisp: Rgb): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(noise.length * 4);
  for (let i = 0; i < noise.length; i++) {
    const t = Math.min(1, Math.max(0, (noise[i] - 0.35) / 0.4));
    const f = smooth(t);
    px[i * 4] = base[0] + (wisp[0] - base[0]) * f;
    px[i * 4 + 1] = base[1] + (wisp[1] - base[1]) * f;
    px[i * 4 + 2] = base[2] + (wisp[2] - base[2]) * f;
    px[i * 4 + 3] = 255;
  }
  return px;
}

export function parseHex(s: string): Rgb | null {
  const m = s.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
