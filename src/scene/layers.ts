/**
 * The room's wall is a single surface, so everything drawn on it is a separate
 * layer floating a few millimetres inside it. `inset` is measured inward from
 * the wall radius (toward the viewer); `renderOrder` breaks ties between
 * layers that sit at the same depth.
 *
 * Later steps add their own entries here rather than reaching for magic
 * numbers, so the stacking order stays readable in one place.
 */
export const LAYERS = {
  /**
   * The seam is stacked in depth so it reads as a physical recess: the chamfer
   * surface sits deepest and spans the whole wall, the dark core sits a little
   * proud of it and only runs down the middle of each seam, and the panel faces
   * sit proud of both. Across a seam the eye gets face / chamfer / core /
   * chamfer / face, which is the profile of a bevelled gap.
   */
  panelRecess: { inset: 0.006, renderOrder: 0 },
  panelCoreHorizontal: { inset: 0.008, renderOrder: 0 },
  /** A hair proud of the horizontal cores so the two do not z-fight where they cross. */
  panelCoreVertical: { inset: 0.0085, renderOrder: 0 },
  /** Modular wall panels — architectural structure, sits under everything. */
  panels: { inset: 0.012, renderOrder: 0 },
  /**
   * The panels lighting up, as an LED matrix would.
   *
   * It sits just in front of the panel faces and is quantised to the panel
   * grid, so each panel emits one colour as a tile of a display rather than
   * having a gradient painted across it. It stays *behind* the typography, the
   * dot matrix and the grid, so those always read on top of a lit panel.
   *
   * Additive: it can only add light to a face, never replace or tint it away.
   */
  illumination: { inset: 0.0132, renderOrder: 1 },
  /**
   * Environmental typography, printed on the panels and running *under* the
   * grid and the dot matrix, so both read on top of it.
   */
  typography: { inset: 0.014, renderOrder: 0 },
  /**
   * LED dot matrix on the panel faces. Sits above the panels but below the
   * grid, so the grid stays the first thing read.
   */
  dots: { inset: 0.016, renderOrder: 0 },
  gridSecondary: { inset: 0.02, renderOrder: 1 },
  gridPrimary: { inset: 0.024, renderOrder: 2 },
  /** Registration crosses at the major grid intersections. */
  markers: { inset: 0.028, renderOrder: 3 },
  /**
   * The display's front glass — the sheet a television or monitor has over its
   * emitters. The last thing on the wall, so everything printed there is seen
   * *through* it: the dots, the sub-panel seams, the grid and the drifting words.
   *
   * Anything standing in the room rather than mounted on the wall — the crystal,
   * the name — has to draw after this or the glass would be laid over it. See
   * `renderOrder` in wordmarkConfig.
   */
  glass: { inset: 0.034, renderOrder: 4 },
} as const

export type LayerName = keyof typeof LAYERS
