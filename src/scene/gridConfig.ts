import { PANELS } from './panelConfig'

/**
 * The engineering grid drawn onto the cylindrical wall.
 *
 * Spacing is expressed in metres of *surface* distance — arc length around the
 * cylinder and height up it — so cells stay square and evenly spaced right
 * across the curve.
 */
export const GRID = {
  /** Secondary (subdivision) spacing, in metres, in both directions. */
  cell: 0.5,

  /**
   * Whether the subdivision lines are drawn at all.
   *
   * Off. These run right through the face of every panel at half-metre spacing,
   * and once the panels were lit they read as a wireframe laid over the picture
   * — a real LED wall has nothing between its emitters but substrate, and the
   * only lines on it are the joints between modules. The primary lines survive
   * because they fall exactly on those joints.
   *
   * The wall does not lose its structure: the shader stops the dot lattice short
   * of every panel and sub-panel seam, so the divisions still read, as gaps in
   * the emitters rather than as strokes over them.
   *
   * Turn back on to get the engineering-drawing look over a dark wall.
   */
  subdivisions: false,

  /**
   * Which subdivisions get promoted to primary lines. Taken straight from the
   * panel module so a primary line only ever falls on a panel seam — panels are
   * wider than they are tall, so the two axes differ, and a single shared value
   * would put primary lines through the middle of every panel face.
   */
  majorEveryAcross: PANELS.cellsAcross,
  majorEveryUp: PANELS.cellsUp,
  /**
   * Polyline segments used to draw one full 360deg ring. Each horizontal line
   * follows the cylinder as a chain of chords; at this count the chords sit
   * ~0.2mm off the true surface, far inside the layer inset.
   */
  ringSegments: 256,

  /** Thicker, slightly brighter lines on the major divisions. */
  primary: {
    color: '#3d3d3d',
    opacity: 0.8,
    /** Width in CSS pixels — screen-space, so it stays crisp at any DPR. */
    lineWidth: 1.5,
  },
  /** Thin subdivision lines. */
  secondary: {
    color: '#2e2e2e',
    opacity: 0.55,
    lineWidth: 1,
  },
} as const
