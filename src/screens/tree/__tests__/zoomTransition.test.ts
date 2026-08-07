import {
  zoomFrame,
  ZOOM_TREE_SCALE,
  ZOOM_BRANCH_SCALE_FROM,
  ZOOM_TREE_FADE_END,
  ZOOM_BRANCH_FADE_END,
} from '../zoomTransition';

describe('zoomFrame', () => {
  it('at t=0 shows the tree fully and the branch hidden', () => {
    const f = zoomFrame(0);
    expect(f.treeScale).toBe(1);
    expect(f.treeOpacity).toBe(1);
    expect(f.branchScale).toBe(ZOOM_BRANCH_SCALE_FROM);
    expect(f.branchOpacity).toBe(0);
  });

  it('at t=1 shows the branch fully and the tree hidden', () => {
    const f = zoomFrame(1);
    expect(f.treeScale).toBe(ZOOM_TREE_SCALE);
    expect(f.treeOpacity).toBe(0);
    expect(f.branchScale).toBe(1);
    expect(f.branchOpacity).toBe(1);
  });

  it('clamps t outside [0, 1]', () => {
    expect(zoomFrame(-3)).toEqual(zoomFrame(0));
    expect(zoomFrame(9)).toEqual(zoomFrame(1));
  });

  it('moves monotonically: tree recedes, branch arrives', () => {
    let prev = zoomFrame(0);
    for (let i = 1; i <= 10; i++) {
      const f = zoomFrame(i / 10);
      expect(f.treeScale).toBeGreaterThanOrEqual(prev.treeScale);
      expect(f.treeOpacity).toBeLessThanOrEqual(prev.treeOpacity);
      expect(f.branchScale).toBeGreaterThanOrEqual(prev.branchScale);
      expect(f.branchOpacity).toBeGreaterThanOrEqual(prev.branchOpacity);
      prev = f;
    }
  });

  it('finishes each fade at its configured point', () => {
    expect(zoomFrame(ZOOM_TREE_FADE_END).treeOpacity).toBeCloseTo(0, 5);
    expect(zoomFrame(ZOOM_BRANCH_FADE_END).branchOpacity).toBeCloseTo(1, 5);
    // Branch is fully opaque before the tree fully fades (a clean crossover).
    expect(ZOOM_BRANCH_FADE_END).toBeLessThan(ZOOM_TREE_FADE_END);
  });
});
