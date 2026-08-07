import { computeBranchTimeline } from '../branchTimelineLayout';

const H = 720;

describe('computeBranchTimeline', () => {
  it('places exactly `count` leaves', () => {
    expect(computeBranchTimeline({ count: 0, height: H }).leaves).toHaveLength(0);
    expect(computeBranchTimeline({ count: 1, height: H }).leaves).toHaveLength(1);
    expect(computeBranchTimeline({ count: 9, height: H }).leaves).toHaveLength(9);
  });

  it('alternates leaves up/down starting up (oldest first)', () => {
    const { leaves } = computeBranchTimeline({ count: 5, height: H });
    expect(leaves.map((l) => l.side)).toEqual(['up', 'down', 'up', 'down', 'up']);
  });

  it('advances chronologically left → right at a fixed spacing', () => {
    const { leaves } = computeBranchTimeline({ count: 4, height: H, startPad: 96, spacing: 128 });
    expect(leaves.map((l) => l.stemX)).toEqual([96, 224, 352, 480]);
  });

  it('offsets nodes above/below the stem baseline', () => {
    const { baseY, leaves } = computeBranchTimeline({ count: 2, height: H, nodeOffset: 108 });
    expect(leaves[0].y).toBe(baseY - 108); // up
    expect(leaves[1].y).toBe(baseY + 108); // down
    // Every leaf hangs from the stem baseline.
    for (const l of leaves) expect(l.stemY).toBe(baseY);
  });

  it('centres the stem vertically', () => {
    expect(computeBranchTimeline({ count: 3, height: 700 }).baseY).toBe(350);
  });

  it('sizes content width to hold every leaf plus padding', () => {
    const layout = computeBranchTimeline({ count: 6, height: H, startPad: 96, spacing: 128 });
    const lastX = 96 + 5 * 128;
    expect(layout.contentWidth).toBeGreaterThan(lastX);
    expect(layout.stemEndX).toBeGreaterThan(lastX);
  });

  it('keeps a bare branch (count 0) sane', () => {
    const layout = computeBranchTimeline({ count: 0, height: H });
    expect(layout.leaves).toEqual([]);
    expect(layout.contentWidth).toBeGreaterThan(0);
    expect(layout.baseY).toBe(360);
  });

  it('is deterministic', () => {
    expect(computeBranchTimeline({ count: 7, height: H })).toEqual(
      computeBranchTimeline({ count: 7, height: H }),
    );
  });
});
