// ─── Tree Home layout engine ──────────────────────────────────────────────────
//
// Pure geometry for the "Branch" home screen: a central trunk with branches
// armed off it, alternating sides, growing upward (oldest at the base, newest
// near the crown). Kept free of React/React Native so it is trivially unit
// testable and deterministic across screen sizes and branch counts.
//
// Coordinate space: standard screen coordinates — x grows right, y grows DOWN.
// The trunk is vertical at `trunkX`, spanning [trunkTop, trunkBottom].

export type BranchSide = 'left' | 'right';

export interface BranchLayoutOptions {
  /** Canvas width in px. */
  width: number;
  /** Number of branches to place. */
  count: number;
  /** Empty space above the topmost (newest) branch. */
  topPadding?: number;
  /** Empty space below the base of the trunk. */
  bottomPadding?: number;
  /** Vertical distance between consecutive branch attach points. */
  spacing?: number;
  /** Length of each branch arm from the trunk to its tip. */
  branchLength?: number;
  /** Upward angle of each branch arm, in degrees (0 = horizontal). */
  angleDeg?: number;
  /** Length of bare trunk below the lowest branch (down to the roots). */
  baseRise?: number;
  /** Horizontal centre of the trunk. Defaults to width / 2. */
  trunkX?: number;
}

export interface BranchPlacement {
  index: number;
  side: BranchSide;
  /** Where the branch meets the trunk. */
  attachX: number;
  attachY: number;
  /** The outer end of the branch (where the label + leaf cluster sit). */
  tipX: number;
  tipY: number;
  /** Midpoint of the arm — convenient centre for a rotated bar view. */
  midX: number;
  midY: number;
  /** Straight-line length of the arm (== branchLength). */
  length: number;
  /** Rotation for a horizontal bar so it runs attach → tip, in degrees. */
  rotationDeg: number;
}

export interface TreeLayout {
  trunkX: number;
  trunkTop: number;
  trunkBottom: number;
  /** Total content height (for a ScrollView contentContainer). */
  height: number;
  branches: BranchPlacement[];
}

export const DEFAULT_BRANCH_LAYOUT = {
  topPadding: 140,
  bottomPadding: 96,
  spacing: 104,
  angleDeg: 24,
  baseRise: 84,
} as const;

const DEG2RAD = Math.PI / 180;

/**
 * Computes the full tree layout. Deterministic: identical inputs always yield
 * identical output. Handles `count === 0` (bare trunk) and `count === 1`.
 */
export function computeTreeLayout(opts: BranchLayoutOptions): TreeLayout {
  const width = Math.max(1, opts.width);
  const count = Math.max(0, Math.floor(opts.count));

  const topPadding = opts.topPadding ?? DEFAULT_BRANCH_LAYOUT.topPadding;
  const bottomPadding = opts.bottomPadding ?? DEFAULT_BRANCH_LAYOUT.bottomPadding;
  const spacing = opts.spacing ?? DEFAULT_BRANCH_LAYOUT.spacing;
  const angleDeg = opts.angleDeg ?? DEFAULT_BRANCH_LAYOUT.angleDeg;
  const baseRise = opts.baseRise ?? DEFAULT_BRANCH_LAYOUT.baseRise;
  const trunkX = opts.trunkX ?? Math.round(width / 2);
  // Branch arm scales with screen width but is capped so it never runs off-screen.
  const branchLength = opts.branchLength ?? Math.min(160, width * 0.34);

  // Layout, bottom → top: bottom padding, a bare trunk `baseRise`, then the
  // branches spaced `spacing` apart, then top padding above the crown.
  const branchesSpan = count > 1 ? (count - 1) * spacing : 0;
  const height = topPadding + branchesSpan + baseRise + bottomPadding;

  const trunkBottom = height - bottomPadding;         // the root line (ground)
  const firstBranchY = trunkBottom - baseRise;         // lowest branch, above the base
  const trunkTop = firstBranchY - branchesSpan - 44;   // crown a little above the top branch

  const rad = angleDeg * DEG2RAD;
  const dx = Math.cos(rad) * branchLength;
  const dy = Math.sin(rad) * branchLength; // upward → subtract from y

  const branches: BranchPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const side: BranchSide = i % 2 === 0 ? 'left' : 'right';
    const dir = side === 'left' ? -1 : 1;

    const attachX = trunkX;
    const attachY = firstBranchY - i * spacing; // grow upward as index increases

    const tipX = attachX + dir * dx;
    const tipY = attachY - dy;

    const midX = (attachX + tipX) / 2;
    const midY = (attachY + tipY) / 2;

    // Rotation of a horizontal bar so its +x axis points from attach → tip.
    const rotationDeg = (Math.atan2(tipY - attachY, tipX - attachX) * 180) / Math.PI;

    branches.push({
      index: i,
      side,
      attachX,
      attachY,
      tipX,
      tipY,
      midX,
      midY,
      length: branchLength,
      rotationDeg,
    });
  }

  return { trunkX, trunkTop, trunkBottom, height, branches };
}
