import { makeStars } from '../starfield';

describe('makeStars', () => {
  it('produces exactly `count` stars', () => {
    expect(makeStars({ width: 390, height: 800, count: 0 })).toHaveLength(0);
    expect(makeStars({ width: 390, height: 800, count: 60 })).toHaveLength(60);
  });

  it('is deterministic for a given seed', () => {
    const a = makeStars({ width: 390, height: 800, count: 40, seed: 7 });
    const b = makeStars({ width: 390, height: 800, count: 40, seed: 7 });
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = makeStars({ width: 390, height: 800, count: 40, seed: 1 });
    const b = makeStars({ width: 390, height: 800, count: 40, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('keeps stars within the canvas and upper sky', () => {
    const W = 390;
    const H = 800;
    const skyRatio = 0.72;
    for (const s of makeStars({ width: W, height: H, count: 200, seed: 3, skyRatio })) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(H * skyRatio);
      expect(s.r).toBeGreaterThan(0);
      expect(s.opacity).toBeGreaterThan(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });
});
