import { computeTreeLayout } from '../branchLayout';

const W = 390; // iPhone-ish width

describe('computeTreeLayout', () => {
  it('places exactly `count` branches', () => {
    expect(computeTreeLayout({ width: W, count: 0 }).branches).toHaveLength(0);
    expect(computeTreeLayout({ width: W, count: 1 }).branches).toHaveLength(1);
    expect(computeTreeLayout({ width: W, count: 7 }).branches).toHaveLength(7);
  });

  it('centres the trunk by default', () => {
    expect(computeTreeLayout({ width: W, count: 3 }).trunkX).toBe(Math.round(W / 2));
    expect(computeTreeLayout({ width: 300, count: 3, trunkX: 120 }).trunkX).toBe(120);
  });

  it('alternates sides starting on the left', () => {
    const { branches } = computeTreeLayout({ width: W, count: 6 });
    expect(branches.map((b) => b.side)).toEqual([
      'left', 'right', 'left', 'right', 'left', 'right',
    ]);
  });

  it('grows upward — attach points strictly decrease in y as index increases', () => {
    const { branches } = computeTreeLayout({ width: W, count: 5, spacing: 100 });
    for (let i = 1; i < branches.length; i++) {
      expect(branches[i].attachY).toBeLessThan(branches[i - 1].attachY);
      expect(branches[i - 1].attachY - branches[i].attachY).toBeCloseTo(100, 5);
    }
  });

  it('mirrors left/right tips symmetrically about the trunk', () => {
    const { trunkX, branches } = computeTreeLayout({ width: W, count: 2, branchLength: 120, angleDeg: 24 });
    const [left, right] = branches;
    expect(left.tipX).toBeLessThan(trunkX);
    expect(right.tipX).toBeGreaterThan(trunkX);
    // Equal horizontal reach on both sides.
    expect(trunkX - left.tipX).toBeCloseTo(right.tipX - trunkX, 5);
  });

  it('angles branches upward (tip is above its attach point)', () => {
    const { branches } = computeTreeLayout({ width: W, count: 2, angleDeg: 24, branchLength: 120 });
    for (const b of branches) expect(b.tipY).toBeLessThan(b.attachY);
  });

  it('reserves height for padding + inter-branch gaps + trunk base', () => {
    const layout = computeTreeLayout({
      width: W, count: 4, topPadding: 140, bottomPadding: 96, spacing: 104, baseRise: 84,
    });
    // top padding + (count - 1) gaps + base rise + bottom padding.
    expect(layout.height).toBe(140 + 3 * 104 + 84 + 96);
    expect(layout.trunkBottom).toBe(layout.height - 96);
  });

  it('keeps constant top headroom: the topmost branch attaches at y = topPadding for any count', () => {
    // This is what guarantees tall trees never tuck their top branch under the
    // header when scrolled fully up.
    for (const count of [3, 8, 12]) {
      const layout = computeTreeLayout({ width: W, count, topPadding: 236 });
      const topmost = Math.min(...layout.branches.map((b) => b.attachY));
      expect(topmost).toBe(236);
    }
  });

  it('grounds the trunk: lowest branch sits `baseRise` above the base', () => {
    const layout = computeTreeLayout({ width: W, count: 3, bottomPadding: 96, baseRise: 84 });
    expect(layout.branches[0].attachY).toBe(layout.trunkBottom - 84);
    // Trunk clearly extends below the lowest branch.
    expect(layout.trunkBottom - layout.branches[0].attachY).toBe(84);
  });

  it('keeps a single branch and a bare trunk sane', () => {
    const one = computeTreeLayout({ width: W, count: 1, topPadding: 140, bottomPadding: 96, baseRise: 84 });
    expect(one.branches[0].side).toBe('left');
    expect(one.height).toBe(140 + 84 + 96); // top padding + base rise + bottom padding, no gaps
    expect(one.branches[0].attachY).toBe(one.trunkBottom - 84);

    const none = computeTreeLayout({ width: W, count: 0 });
    expect(none.branches).toEqual([]);
    expect(none.height).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = computeTreeLayout({ width: W, count: 5 });
    const b = computeTreeLayout({ width: W, count: 5 });
    expect(a).toEqual(b);
  });

  it('gives a rotation that points from attach toward tip', () => {
    const { branches } = computeTreeLayout({ width: W, count: 2, angleDeg: 24 });
    const [left, right] = branches;
    // Right branch points up-right → negative rotation (y grows down).
    expect(right.rotationDeg).toBeLessThan(0);
    // Left branch points up-left → rotation magnitude > 90°.
    expect(Math.abs(left.rotationDeg)).toBeGreaterThan(90);
  });
});
