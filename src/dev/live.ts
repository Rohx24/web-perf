/**
 * Live-tuned values, mutable at runtime by the dev control panels.
 *
 * Unlike the config files (which are `as const` and read once), these are read
 * every frame by the systems that draw the works section, so a control can write
 * straight to them and the change lands on the next frame with nothing rebuilt.
 *
 * Initialised to the same numbers the config files ship, and deliberately NOT
 * importing scrollConfig (scrollConfig imports this, for `galleryActive`), so
 * there is no import cycle.
 */
export const LIVE = {
  /** The project-frame carousel (see ProjectFrames + SCROLL.gallery). */
  works: {
    xRadius: 5.3,
    zRadius: 3.2,
    frontDist: 6.5,
    rise: 1.2,
    /** Inward yaw per slot — the angle of the panes as they leave centre. */
    yaw: 0.98,
    /** Extra tilt (pitch) per slot as a pane leaves centre. 0 = none. */
    tilt: 0,
    growth: 0.37,
    fillFracW: 0.56,
    fillFracH: 0.49,
    bend: 0.19,
    corner: 0.075,
    border: 0.024,
    /** How long each pane holds parked at centre before gliding to the next —
     *  the "scroll transition" feel. Higher = snappier hold + quicker swap. */
    dwell: 0.22,
    /** Strength of the accent glow the wall throws behind the featured pane. */
    glow: 1.3,
  },
  /** The hero logo GLB — live size + orientation (control panel "hero · model"),
   *  so a swapped model can be re-oriented and resized by eye. */
  hero: {
    size: 0.51,
    rotX: 1.48,
    rotY: 3.14,
    rotZ: -2.82,
  },
  /** The drifting hero marquee words (TypographySystem). */
  marquee: {
    /** Brightness multiplier on the words' opacity. */
    bright: 3,
  },
  /** The outro pixel-grid dissolve (OutroWireframe). */
  outro: {
    /** Scroll at which the grid begins filling — held back so the last pane has
     *  scrolled away first, then the grid appears behind it. */
    gridStart: 0.775,
    /** Scroll by which the grid has fully filled. */
    gridEnd: 0.925,
  },
}
