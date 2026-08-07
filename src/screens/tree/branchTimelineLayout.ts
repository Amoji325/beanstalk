// ─── Horizontal branch timeline layout ────────────────────────────────────────
//
// A branch, opened, becomes a horizontal timeline: a wood stem running left
// (oldest) → right (newest), with memories hanging as leaves that alternate
// above and below the stem, each joined by a short twig. Pure + deterministic
// so it is unit-testable and independent of React Native.
//
// Coordinates: x grows right, y grows DOWN. The stem sits on a horizontal
// baseline; nodes are offset vertically by `nodeOffset` to their side.

export type LeafSide = 'up' | 'down';

export interface MemoryLeaf {
  index: number;
  side: LeafSide;
  /** Point on the stem this leaf hangs from. */
  stemX: number;
  stemY: number;
  /** Centre of the memory node (card). */
  x: number;
  y: number;
}

export interface BranchTimelineLayout {
  /** Baseline y of the stem. */
  baseY: number;
  /** Stem x extent (a little padding beyond the first/last leaves). */
  stemStartX: number;
  stemEndX: number;
  /** Total scrollable width / height. */
  contentWidth: number;
  height: number;
  leaves: MemoryLeaf[];
}

export interface BranchTimelineOptions {
  /** Number of memories. */
  count: number;
  /** Canvas height (the stem sits near the vertical centre). */
  height: number;
  /** Horizontal padding before the first / after the last leaf. */
  startPad?: number;
  /** Horizontal distance between consecutive leaves. */
  spacing?: number;
  /** Vertical distance from the stem to a node centre. */
  nodeOffset?: number;
}

export const DEFAULT_BRANCH_TIMELINE = {
  startPad: 96,
  spacing: 128,
  nodeOffset: 108,
} as const;

/**
 * Lays out a branch timeline. `count === 0` yields a bare stem sized to one
 * screen. Leaves alternate up/down starting up; index 0 is the oldest (left).
 */
export function computeBranchTimeline(opts: BranchTimelineOptions): BranchTimelineLayout {
  const count = Math.max(0, Math.floor(opts.count));
  const height = Math.max(1, opts.height);
  const startPad = opts.startPad ?? DEFAULT_BRANCH_TIMELINE.startPad;
  const spacing = opts.spacing ?? DEFAULT_BRANCH_TIMELINE.spacing;
  const nodeOffset = opts.nodeOffset ?? DEFAULT_BRANCH_TIMELINE.nodeOffset;

  const baseY = Math.round(height / 2);

  const leaves: MemoryLeaf[] = [];
  for (let i = 0; i < count; i++) {
    const side: LeafSide = i % 2 === 0 ? 'up' : 'down';
    const stemX = startPad + i * spacing;
    const y = side === 'up' ? baseY - nodeOffset : baseY + nodeOffset;
    leaves.push({ index: i, side, stemX, stemY: baseY, x: stemX, y });
  }

  const lastX = count > 0 ? startPad + (count - 1) * spacing : startPad;
  const stemStartX = Math.round(startPad - spacing * 0.5);
  const stemEndX = Math.round(lastX + spacing * 0.6);
  const contentWidth = Math.max(stemEndX + startPad, startPad * 2);

  return { baseY, stemStartX, stemEndX, contentWidth, height, leaves };
}
