// ─── Starfield ────────────────────────────────────────────────────────────────
//
// Deterministic star positions for the night-sky Tree home. A seeded PRNG keeps
// the field stable across re-renders (so stars don't twinkle-jump on every state
// change) while still looking scattered. Pure + testable.

export interface Star {
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  /** Base opacity 0..1. */
  opacity: number;
}

export interface StarfieldOptions {
  width: number;
  height: number;
  count: number;
  seed?: number;
  /** Stars are placed in the top `skyRatio` of the canvas. */
  skyRatio?: number;
}

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates `count` stars scattered across the upper sky. Identical options
 * always produce an identical field.
 */
export function makeStars(opts: StarfieldOptions): Star[] {
  const width = Math.max(1, opts.width);
  const height = Math.max(1, opts.height);
  const count = Math.max(0, Math.floor(opts.count));
  const skyRatio = opts.skyRatio ?? 0.72;
  const rand = mulberry32(opts.seed ?? 1);

  const skyHeight = height * skyRatio;
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.round(rand() * width),
      y: Math.round(rand() * skyHeight),
      r: +(0.6 + rand() * 1.4).toFixed(2),
      opacity: +(0.35 + rand() * 0.65).toFixed(2),
    });
  }
  return stars;
}
