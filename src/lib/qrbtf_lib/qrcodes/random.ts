// Stable random values make preview, verification and export identical.
export function seededRandom(content: string) {
  let seed = 2166136261;
  for (const c of content) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return (min: number, max: number) => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return min + (((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max - min);
  };
}
