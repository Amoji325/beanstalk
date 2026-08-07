// ─── Tree ⇄ Branch zoom transition ────────────────────────────────────────────
//
// Pure interpolation for the zoom between the Tree home and a branch's timeline.
// `t` runs 0 (tree) → 1 (branch). The tree scales up and fades out (flying into
// the tapped branch), while the branch grows from a smaller scale and fades in
// (emerging from that point). Both views share a transform origin at the tap
// location so the motion pivots around the branch the user touched.
//
// Kept free of Reanimated/React so it is unit-testable; the shell mirrors these
// same constants in its worklets.

export const ZOOM_TREE_SCALE = 2.5;        // tree scales 1 → this
export const ZOOM_BRANCH_SCALE_FROM = 0.72; // branch scales this → 1
export const ZOOM_TREE_FADE_END = 0.85;     // tree fully transparent by this t
export const ZOOM_BRANCH_FADE_END = 0.55;   // branch fully opaque by this t

export interface ZoomFrame {
  treeScale: number;
  treeOpacity: number;
  branchScale: number;
  branchOpacity: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The visual state of both layers at progress `t` (clamped to [0, 1]). */
export function zoomFrame(t: number): ZoomFrame {
  const c = clamp01(t);
  return {
    treeScale: 1 + c * (ZOOM_TREE_SCALE - 1),
    treeOpacity: 1 - Math.min(1, c / ZOOM_TREE_FADE_END),
    branchScale: ZOOM_BRANCH_SCALE_FROM + c * (1 - ZOOM_BRANCH_SCALE_FROM),
    branchOpacity: Math.min(1, c / ZOOM_BRANCH_FADE_END),
  };
}
