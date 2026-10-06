/** Unbiased integer in 1..n from the platform CSPRNG (rejection sampling). */
export function rand(n: number): number {
  const a = new Uint32Array(1);
  const lim = Math.floor(4294967296 / n) * n;
  let v: number;
  do {
    crypto.getRandomValues(a);
    v = a[0];
  } while (v >= lim);
  return (v % n) + 1;
}

export const uuid = () => crypto.randomUUID();

/** Uniform float in [0, 1) from the platform CSPRNG. */
export function randFloat(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
