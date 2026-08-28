/**
 * The name, set large between the crystal and the wall.
 *
 * Deliberately not on the wall and not attached to the logo: it occupies the
 * space between them, so the crystal passes in front of it and the LED screen
 * reads behind it. That layering is what makes the room feel deep rather than
 * like a flat backdrop with objects pasted on.
 */
export const WORDMARK = {
  text: 'ROHIT DIGGI',

  /**
   * The wordmark's own typeface, chosen independently of the marquee's.
   *
   * They are different jobs. The marquee is texture — faint words drifting on
   * the wall that are never meant to be read closely — while this is the one
   * piece of type in the room that carries a name. Tying them to one font meant
   * changing the name's face silently restyled the whole room.
   */
  font: '/fonts/russo-one.ttf',

  /**
   * What the font dropdown offers.
   *
   * To add one: drop the file into `public/fonts` and add a line here. troika
   * takes .ttf, .otf, .woff and .woff2, and loads whatever URL it is handed —
   * there is nothing to register anywhere else.
   */
  fonts: [
    { label: 'russo one', value: '/fonts/russo-one.ttf' },
    { label: 'space grotesk', value: '/fonts/space-grotesk.ttf' },
  ],

  /**
   * Between the hero (z = 2) and the wall (z = -9), nearer the wall so the
   * crystal clearly crosses in front of it.
   */
  position: [0, 2.5, -5.2] as [number, number, number],

  /** Cap height in metres. Large enough to run past the crystal on both sides,
   *  and sized to sit proportional to the logo rather than reading small.
   *  Locked to the values the hero was signed off on. */
  size: 1.84,
  letterSpacing: 0.015,

  /**
   * Drawn after every layer on the wall, the front glass included.
   *
   * The name stands in the room, several metres clear of the wall, but it writes
   * no depth — it must not punch a hole in the crystal that refracts it. So
   * depth cannot settle this and draw order has to: left below the glass, the
   * name would be seen *through* the screen's own reflection, and the glass
   * would lay its sheen across the letters as though they were printed on the
   * panel. Layers are counted up from here, one per glow copy.
   */
  renderOrder: 20,

  /**
   * Flat.
   *
   * troika bends text around a cylinder whose axis sits `curveRadius` behind the
   * anchor, so on a wide line the ends swing a long way out of the frame — this
   * wordmark is roughly fifteen metres across, and any curve tight enough to
   * read pushed its ends off screen entirely. The wall behind it already
   * supplies the room's curvature; the type does not need to repeat it.
   */
  curveRadius: 0,

  /**
   * Contrast adaptation: the two colours the wordmark moves between.
   *
   * The wall is a screen whose brightness changes underneath the type — a fixed
   * colour would be crisp against one programme and invisible against the next.
   * So the letters read the wall behind them and take whichever of these two
   * separates better.
   */
  onDark: '#DCE3F2',
  /** Held under full white so the name sits in the room rather than glaring off
   *  it — the fill was too bright and hitting the eye. */
  opacity: 0.82,

  /**
   * The glow around the letters.
   *
   * There is no bloom pass in this scene, and adding one for a single object
   * would be the wrong trade — it costs a full-screen blur every frame and it
   * would catch the wall's dot lattice too, softening the one thing the whole
   * lighting system exists to keep crisp.
   *
   * So the glow is built rather than post-processed: a few copies of the type
   * with no fill at all, each drawn as nothing but a blurred outline, stacked
   * widest and faintest first. They are blended *additively*, so where they
   * overlap they sum into light instead of piling up as translucent fog — which
   * is the difference between type that is emitting and type that has grey
   * smudge around it.
   *
   * Width and blur are fractions of the cap height, so the glow keeps its
   * proportion if the wordmark is ever resized.
   */
  glowColor: '#A8C6FF',
  /**
   * No glow. Removed at sign-off — the name reads cleaner as a plain fill against
   * the wall than with a halo. Left as an empty list (rather than deleting the
   * machinery) so a glow can be reinstated by adding layers back here.
   */
  glow: [] as ReadonlyArray<{ width: number; blur: number; opacity: number }>,
  onLight: '#07080B',
  /**
   * Wall luminance at which the type flips, and how sharply.
   *
   * The flip is per pixel, not per word: a single letter can be dark on its lit
   * half and light on its shadowed half, which is the whole point — a word-wide
   * average would be wrong exactly where the contrast is tightest.
   */
  flipAt: 0.42,
  flipSoftness: 0.16,

  /** Idle drift, so it breathes with the rest of the room rather than sitting still. */
  floatAmplitude: 0.055,
  floatSeconds: 13,
} as const
