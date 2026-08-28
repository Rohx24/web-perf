/**
 * The modular panels the wall is built from.
 *
 * Panel edges are expressed in whole grid cells, so every seam lands exactly on
 * an existing grid line and the two systems stay locked together.
 */
export const PANELS = {
  /** Panel width in grid cells (10 cells x 0.5m = 5m). */
  cellsAcross: 10,
  /** Panel height in grid cells (5 cells x 0.5m = 2.5m). */
  cellsUp: 5,

  /**
   * Gap between neighbouring panels, in metres. What shows through the gap is
   * the seam — no line is drawn.
   *
   * Panel edges sit on primary grid lines, and a primary line is ~1.5px wide,
   * so a seam narrower than that is simply hidden underneath it. 15cm resolves
   * to ~5px on the far wall: a hair of recess reads either side of the line.
   */
  seam: 0.15,

  /**
   * Panel face. Matches the room's own surface tone, so covering the wall in
   * panels does not change how dark the space reads.
   */
  color: '#0a0b0d',
  roughness: 0.97,

  /**
   * The seam is built as three tones rather than one flat dark line, which is
   * what makes it read as a physical recess instead of a drawn stripe:
   *
   *   panel face | chamfer | core | chamfer | panel face
   *
   * `recessColor` is the chamfer — the shallow bevel around each panel, sitting
   * between the face and the bottom of the gap. `coreColor` is the bottom of
   * the gap itself, a narrow band down the centre of every seam.
   */
  recessColor: '#0e1013',
  coreColor: '#050506',
  /** Width of the dark core down the middle of a seam, in metres. */
  coreWidth: 0.06,

  /** Per-panel brightness spread, +/- this fraction. */
  brightnessVariation: 0.03,
  /** Per-panel roughness spread, +/- this absolute amount. */
  roughnessVariation: 0.03,

  /**
   * Some panels are built from smaller display tiles rather than one sheet.
   *
   * Splits are given in whole grid cells measured from the panel's own edge, so
   * every internal seam still lands on a grid line. `across` splits must sum
   * inside `cellsAcross`, `up` inside `cellsUp`.
   */
  subdivide: {
    /** Fraction of panels that get internal tile divisions. */
    chance: 0.38,
    /** Gap between tiles inside a panel. Finer than the main seam, and it
     *  exposes only the chamfer tone, never the dark core — so an internal
     *  division always reads as shallower than a panel-to-panel seam. */
    seam: 0.11,
    /** Extra brightness spread between tiles within one panel, on top of the
     *  panel's own variation. Kept tiny so a subdivided panel still reads as
     *  one panel. */
    brightnessVariation: 0.012,
    variants: [
      // Two square 2.5m tiles.
      { across: [5], up: [] },
      // Five 1m strips.
      { across: [2, 4, 6, 8], up: [] },
      // Four tiles: halved across, split 2/3 cells up.
      { across: [5], up: [2] },
      // Ten small tiles — the densest module in the wall.
      { across: [2, 4, 6, 8], up: [2] },
    ],
  },

  /**
   * Maintenance access panels: a single plate, never tiled, a shade darker and
   * a little less rough than its neighbours — the way a removable hatch differs
   * from the fixed panels around it.
   */
  service: {
    chance: 0.07,
    /** Multiplier on the panel tone. */
    brightness: 0.88,
    /** Absolute offset on the panel roughness. */
    roughness: -0.06,
  },
} as const
