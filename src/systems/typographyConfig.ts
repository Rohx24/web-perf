import { GRID } from '../scene/gridConfig'
import { PANELS } from '../scene/panelConfig'

/** Height of one panel row. Bands are laid out on this module. */
export const LANE_HEIGHT = PANELS.cellsUp * GRID.cell

/**
 * Environmental typography: background processes surfacing on the wall.
 *
 * Words live in horizontal lanes that line up with the panel rows. A lane is
 * held exclusively for as long as a word occupies it, which is what makes
 * overlap structurally impossible rather than something to be checked for — and
 * a lane's parity sets its travel direction, so one row moves left while the row
 * under it moves right.
 *
 * Each word still runs its own clock: fade in, hold, fade out, release the
 * lanes, respawn elsewhere as something else.
 */
export const TYPOGRAPHY = {
  /**
   * Russo One: a heavy geometric display sans, the closest cut in the repo to
   * the wide engineered letterforms of the reference. Already bold, so the
   * synthetic stroke thickening is dialled right down.
   */
  font: '/fonts/russo-one.ttf',

  /**
   * Neutral mid-gray, no hue.
   *
   * It is not white on purpose. Blending happens in linear space, where the
   * charcoal wall sits at about 0.010 and white at 1.0 — so a few percent of
   * *white* would land far louder than the number suggests.
   */
  color: '#ccd3e0',
  letterSpacing: 0.1,
  /** Thickens every stroke without needing a second font file, in ems. */
  strokeWidth: 0.008,

  /**
   * Words alive at once — also the most rows that can be moving together.
   */
  slots: 4,

  words: [
    'ROHIT DIGGI',
    'AI ENGINEER',
    'AGENTIC AI',
    'SYSTEMS THINKING',
    'MULTI-AGENT',
    'AUTOMATION',
    'REASONING',
    'WORKFLOWS',
    'EMBEDDED AI',
    'FULL STACK',
    'DEPLOYED',
  ],
  heroWords: ['ROHIT DIGGI', 'AI ENGINEER'],

  /**
   * Lanes, as panel-row indices. Lane n is centred at (n + 0.5) * LANE_HEIGHT,
   * spanning roughly -3.75m to 8.75m — the band the camera actually sees.
   */
  lanes: [-2, -1, 0, 1, 2, 3],

  /** Cap heights. A word reserves as many lanes as its size needs. */
  sizes: [
    { name: 'small', weight: 0.4, min: 1.1, max: 1.8 },
    { name: 'medium', weight: 0.45, min: 2.1, max: 3.2 },
    { name: 'large', weight: 0.15, min: 4.0, max: 5.2 },
  ],
  heroChance: 0.3,
  heroSize: { min: 6.0, max: 7.6 },

  timing: {
    holdMin: 2.2,
    holdMax: 5,
    /** One fade, in or out. */
    fadeMin: 0.5,
    fadeMax: 0.95,
    /** Dead time before a slot takes new lanes. */
    gapMin: 0.15,
    gapMax: 1,
  },

  opacityMin: 0.1,
  opacityMax: 0.18,

  /**
   * Every word travels; what differs is how.
   *
   * `glide` is the steady lane drift. `sweep` crosses noticeably faster, for a
   * word that reads as passing through. `breathe` drifts slowly while swelling
   * its opacity. `settle` eases from quick to almost still, as though arriving
   * and parking.
   *
   * Direction always comes from the lane, never from the behaviour, so a row can
   * never contradict itself.
   */
  behaviours: [
    { name: 'glide', weight: 0.42, speedMin: 0.5, speedMax: 1.1 },
    { name: 'sweep', weight: 0.24, speedMin: 1.8, speedMax: 3.0 },
    { name: 'breathe', weight: 0.2, speedMin: 0.25, speedMax: 0.6 },
    { name: 'settle', weight: 0.14, speedMin: 1.4, speedMax: 2.4 },
  ],
  /** Fraction of peak opacity a breathing word swings by. */
  breatheDepth: 0.28,
  breatheSecondsMin: 2.6,
  breatheSecondsMax: 4.6,
  /** How sharply a settling word sheds its speed, per second. */
  settleRate: 0.9,

  placement: {
    /** Words start within +/- this many degrees of the wall's centre line. */
    angleRange: 58,
    /**
     * A long word at a large size would wrap most of the way around the room,
     * so size is capped by the arc it would cover.
     */
    maxArcDegrees: 130,
    /** Rough advance per character, in ems, including tracking. */
    advancePerCharacter: 0.74,
  },
} as const

export type Behaviour = (typeof TYPOGRAPHY.behaviours)[number]['name']

/** Centre height of a run of lanes, in metres. */
export function laneCentreY(firstLane: number, laneCount: number): number {
  return (firstLane + laneCount / 2) * LANE_HEIGHT
}
