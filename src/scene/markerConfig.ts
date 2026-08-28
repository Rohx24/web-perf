/**
 * Registration crosses at the major grid intersections — the small "+" marks a
 * surveyed installation carries at its setting-out points.
 */
export const MARKERS = {
  /** Half-length of each arm, in metres of surface distance. */
  arm: 0.16,
  /** Dark gray, dimmer than the primary grid it sits on. */
  color: '#343434',
  opacity: 0.5,
  /** Width in CSS pixels — screen-space, so the marks stay crisp at any DPR. */
  lineWidth: 1,
} as const
