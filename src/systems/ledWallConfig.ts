/**
 * The wall as one large LED screen.
 *
 * A dense lattice of round emitters on a black substrate, showing a single
 * smooth gradient. The lattice is drawn procedurally in a fragment shader on one
 * cylinder — it is not geometry — so its cost does not depend on how many dots
 * are on the wall, and a dot stays perfectly round and crisp at any resolution.
 */
/**
 * The programmes the wall can show, by the id `programAt()` switches on.
 *
 * Named rather than numbered because the roster below refers to them, and a
 * list of bare integers is unreadable and silently wrong the moment one is
 * inserted in the middle.
 */
export const PROGRAM = {
  gradient: 0,
  panels: 1,
  bands: 2,
  glyphs: 3,
  code: 4,
  agents: 5,
  // The Alche colour states — each its own colour, brightness and panel dropout.
  fieldBlue: 6,
  fieldViolet: 7,
  fieldDark: 8,
  fieldTeal: 9,
  fieldCoral: 10,
  fieldOrange: 11,
} as const

export const LED = {
  /**
   * The palette is generated, not listed — hues only. Saturation and luminance
   * are locked, so every stop is equally vivid and equally bright and only the
   * hue moves.
   *
   * Both constraints were learned the hard way, and neither is a preference:
   *
   * An earlier palette listed pure white as its neutral. At luminance 1.0
   * against purples near 0.60, wherever the sweep crossed it the wall lit in a
   * broad pale band — a brightness effect no gradient tuning could remove,
   * because the band *was* the palette.
   *
   * Fixing that left a subtler version of the same fault: the replacement
   * neutral was a pale desaturated blue. Equal brightness, but far less vivid,
   * so light groups landing near it rendered dull grey dots beside neighbours
   * rendering clean saturated ones. Identical luminance, visibly different
   * quality — dull against clean — and rectangular, because colour is sampled
   * per light group.
   *
   * Listing hex stops invites both mistakes back every time a colour is
   * changed. Generating them makes an off-palette stop unwritable.
   *
   * The range is deliberately narrow — cyan through blue and violet to
   * magenta, no green or warm side. It also turns back on itself rather than
   * going the long way round the wheel, because the ramp blends neighbouring
   * stops in RGB and two stops far apart in hue blend through grey. A wide
   * "complete" wheel would reintroduce dull patches at exactly the joins.
   */
  hues: [186, 212, 238, 264, 290, 316, 286, 232],
  /** Locked across every stop. Vividness is not a per-colour decision. */
  paletteSaturation: 0.86,
  /**
   * Target Rec.709 luminance every stop is normalised to. HSL lightness alone
   * is not enough — cyan reads far brighter than violet at the same lightness,
   * because luminance is mostly green.
   *
   * Low, with saturation high: that combination is what reads as neon. A bright
   * saturated colour fills the room and tires the eye; a dark saturated one
   * glows against the black substrate and lets the architecture stay visible
   * through it. Brightness is carried by `intensity`, not by the palette.
   */
  paletteLuma: 0.28,

  /**
   * Distance between neighbouring dots, in metres of wall surface.
   *
   * Real spacing, not pixels: the dots therefore fall off with distance the way
   * anything physical does, and the same number works on every display.
   */
  pitch: 0.045,
  /**
   * How soft each dot's edge is. 1 is the original razor-crisp 1px rim (which
   * aliases into moire); too high blurs the dots into a low-res mush. A little
   * over 1 takes the harsh edge off without losing the crisp LED read.
   */
  dotSoftness: 1.8,
  /**
   * Dot diameter as a fraction of the pitch. Below 1 there is always dark
   * substrate between neighbours, which is what makes the wall read as discrete
   * emitters rather than a tint. Around 0.6 matches a real LED panel.
   */
  fill: 0.5,

  /**
   * How much of the palette is laid across the wall, around the arc and up the
   * height. Above 1 means more than a full pass of the ramp is in view, so
   * several distinct hues sit on the wall at once rather than one broad wash.
   */
  gradientTurns: 1.69,
  gradientRise: 1.56,
  /** Where the sweep starts, and how slowly it rotates through the palette. */
  gradientOffset: 0.475,
  gradientDrift: 0.035,




  /** How hard a dot at full drives, in linear light. */
  intensity: 2.35,

  /**
   * Dots stop short of a panel seam, the way a real LED module's pixels stop
   * short of its frame. Spacing of the surviving dots is untouched — the lattice
   * simply has a gap at each seam, which is what makes the architecture read
   * through the light.
   */
  seamClearance: 0.045,
  /**
   * The same, for the finer sub-panel divisions inside each panel. Narrower, so
   * a sub-panel joint reads as a hairline against the panel's heavier one and
   * the two levels of structure stay distinguishable.
   */
  subClearance: 0.033,

  /**
   * The wall is a screen showing content, and it changes what it is showing.
   *
   * A surface that drifts through one gradient forever reads as lighting. A
   * surface that cuts to something else reads as a display with something on
   * it — which is what this wall is meant to be.
   */
  programs: {
    /**
     * Which programmes the scheduler is allowed to pick from.
     *
     * The roster is data, not a count, so taking one out of rotation is a line
     * here rather than surgery on the shader — and the programme keeps working,
     * so putting it back costs nothing either.
     *
     * `gradient` and `panels` are the two that fill the wall with colour. They
     * are out for now, not deleted: the request was to stop showing them, and
     * losing the work to honour that would be the wrong trade. `agents` (the
     * node-network) is out for the same reason — bands takes its slot, and is
     * weighted twice here so the diagonal-stripe programme comes round more
     * often. Each time it does the scheduler flips `uBandSlant`, so it alternates
     * between the original diagonal and its left-to-right-upward mirror.
     */
    enabled: [
      PROGRAM.fieldBlue,
      PROGRAM.fieldViolet,
      // fieldDark (near-black) removed — the wall should never go fully black,
      // it must always be showing colour.
      PROGRAM.fieldTeal,
      PROGRAM.fieldCoral,
      PROGRAM.fieldOrange,
      PROGRAM.bands,
      PROGRAM.glyphs,
      PROGRAM.code,
    ],
    /** Which programme the wall comes up on — the glyph field, always, so the
     *  page always arrives on the same look before the first cut. */
    startOn: PROGRAM.glyphs,
    /** What that first cut goes TO, once the page has arrived. Fixed rather
     *  than random: the opening beat should be the same every time. */
    arriveOn: PROGRAM.fieldViolet,
    /** Beat between the page arriving and that first cut firing. Long enough to
     *  register the glyph field as a state of its own before it is replaced. */
    arriveDelay: 2,
    /**
     * How much likelier the diagonal bands are than any other programme when
     * the next one is picked (everything else weighs 1). 2 roughly doubles how
     * often they come round in the hero: about 1 cut in 4 instead of 1 in 7.
     */
    bandsWeight: 2,
    /** Seconds a programme holds before the next one is chosen. */
    holdSeconds: 6,
    /**
     * Seconds to move from one programme to the next.
     *
     * Short on purpose. A real wall cuts; a long crossfade turns two pieces of
     * content into a third, muddier one that was never designed. Long enough
     * only to take the flinch out of an instant swap.
     */
    cutSeconds: 0.45,
    /**
     * How long the easter egg holds the wall before it goes back to work.
     *
     * Long enough to read the whole hidden block at the typing rate, since
     * being cut off mid-message would be worse than never finding it.
     */
    secretSeconds: 40,
  },

  /**
   * The band programme: stripe spacing in metres, how fast the bands travel,
   * and how much of each period is lit.
   */
  bandPeriod: 10.4,
  bandSpeed: 0.119,
  bandWidth: 0.68,
  /**
   * The diagonal's steepness — the coefficient on the wall's height in the band
   * angle. Its magnitude sets the slope; its sign sets the direction. The
   * scheduler flips the sign each time the band programme comes round, so the
   * stripes lean one way on one showing and mirror to the other (running
   * left-to-right and upward) on the next.
   */
  bandSlant: 0.87,

  /**
   * The panel programme: how often a group comes round to its dark slice, how
   * long it stays dark, and how long it takes to fade either way.
   *
   * Rate is per second, so 0.05 is a twenty-second cycle. Each group is offset
   * by its own address, so they never switch together — hold plus fade is
   * roughly the fraction of the wall that is dark at any moment.
   */
  panelRate: 0.05,
  panelHold: 0.06,
  panelFade: 0.045,

  /**
   * The glyph programme: a grid of symbols scrolling up the wall.
   *
   * Cell size is in metres like everything else, so symbols keep their real size
   * as the wall curves away. `dim` is what an ordinary cell shows and `hot` is
   * the fraction that burn bright at any moment — the gap between them is what
   * makes the field read as data rather than as decoration.
   */
  /**
   * Large soft marks the wall carries as artwork: size and outline width in
   * metres, how far they push the level either way, and their drift rate.
   *
   * Enormous and faint, not small and bright — that is what separates them from
   * the symbol grid below, which is fine texture rather than content.
   */
  /**
   * The code programme: line height and character-cell width in metres, scroll
   * rate, and what an inactive character sits at.
   *
   * Colour is taken from the wall's palette rather than being set here, so it
   * stays in the room's cyan and violet instead of importing a terminal green.
   */
  /**
   * Line height and character-cell width, both in metres of wall.
   *
   * These are sized against the 40mm dot pitch, not chosen for their own sake:
   * a cell of 0.22m is five and a half emitters across and a character fills
   * about four of them, a line of 0.5m is twelve and a half emitters tall and a
   * character fills about six. That is the smallest a character can be and still
   * read as one. The previous 0.13/0.34 put a character on roughly two dots by
   * three, which on a lattice this coarse is indistinguishable from speckle.
   */
  codeLine: 0.52,
  codeCell: 0.26,
  codeScroll: 0.75,
  codeDim: 0.9,
  /**
   * The code programme's backdrop glow: peak brightness of the faint hue that
   * lights the wall at the sides and eases to nothing through the centre, so the
   * screen reads as switched on behind the code rather than sitting black. The
   * middle stays dark on purpose, to keep the logo and the marquee clean.
   */
  codeBg: 0.72,
  /**
   * Characters written per second.
   *
   * Lines are typed out as they rise into view rather than appearing whole,
   * which is most of what makes the wall look like something is *running* on it.
   * Fast enough that a line finishes well before it leaves the screen.
   */
  codeType: 26,

  /**
   * The agent graph: spacing between agents and the size of a node, an edge and
   * a message, all in metres.
   *
   * `agentDensity` is the share of neighbouring pairs actually wired together.
   * Near 1 every possible edge exists and the wall reads as a mesh rather than
   * as a network; the gaps are what make it look like a topology someone chose.
   */
  agentCell: 2.2,
  agentNode: 0.1,
  agentLink: 0.035,
  agentSpark: 0.05,
  agentSpeed: 0.22,
  agentDensity: 0.6,
  agentDim: 0.3,

  glyphSize: 0.42,
  glyphScroll: 0.55,
  glyphDim: 0.62,
  glyphHot: 0.07,

  /**
   * The WORKS section title, the way Alche shows its: a big tilted word laid
   * *over* the still-glowing colour wall (not replacing it), flowing along its
   * own baseline from the top-left down toward the bottom and repeating with a
   * gap so one sweeps through at a time.
   *
   * It is scroll-driven, not scheduled: through the whole hero (scroll = 0) the
   * overlay is off and the wall cycles its full programme roster untouched. Once
   * the page is scrolled past `enterS` the overlay eases in, the wall's rotation
   * narrows to the colour fields only (no code/glyph text), and the marquee
   * words and the wordmark fade out — so all that is on the wall is WORKS over
   * the colour. The word is a canvas texture (built in LedWall.tsx); these place,
   * tilt, flow and shade it. Sizes are in metres of wall / wall-UV.
   */
  works: {
    /** Scroll past which the overlay eases in and the wall narrows to colours. */
    enterS: 0.05,
    /** Scroll by which the WORKS title has finished its single pass and faded —
     *  it plays once as the intro, then the cards begin (galleryStart 0.34). The
     *  wide enterS..exitS window makes the pass slow. Colour-only wall persists. */
    exitS: 0.2,
    /** Cap height of the word in metres. Smaller than the full wall — one WORKS
     *  reads at a time as it passes, not a wall-spanning slab. */
    height: 4.4,
    /** Vertical centre in wall-UV — on the camera's look direction (~2.9m up the
     *  24m band) so the word passes through where the eye rests. */
    centreY: 0.54,
    /** Brightness of the lit letters (into the wall's level, before intensity). */
    dim: 2.5,
    /** Baseline tilt in radians — a moderate down-to-the-right rake. */
    angle: -0.32,
    /** How far the word travels across the wall over its one pass, as a fraction
     *  of the arc. Large, so it clearly MOVES across (not a small drift) — but it
     *  is a single clamped pass, so it never loops back round. */
    travel: 0.9,
  },

  /**
   * The blurry project projection on the wall through the gallery — alche's
   * BGQuadWorks. The featured project's pre-blurred image is thrown across the
   * whole wall in screen space and read through the dots as a dark colour bleed
   * (not a picture); it cross-fades and sweeps as the featured project changes.
   */
  worksProj: {
    /** Unused now — the projection is an additive glow, not a dim. Kept so the
     *  uniform and its dev slider still resolve; has no visual effect. */
    dim: 0.6,
    /** Strength of the additive image-glow behind the pane. Lowered now that the
     *  whole wall is the project's colour (sweep) — this just adds a little
     *  image-tinted lift behind the pane. Live as "works · glow → accent glow". */
    mix: 0.5,
  },

  /**
   * The room's falloff. Width and height in wall UV; the floor is how much
   * light survives out at the edges.
   *
   * This is the room, not the content — it applies to whatever programme is
   * showing. A wall lit evenly corner to corner reads as a flat backdrop; a
   * centre that falls away gives it depth and puts the light where the logo is.
   */
  // Scaled up from 0.36 to hold the same world width now the wall arc is
  // narrower (wrapAngle 212 -> 160); it is UV-relative, so it tracks the arc.
  poolWidth: 0.48,
  poolHeight: 0.72,
  poolCentreY: 0.46,
  poolFloor: 0.42,

  /** How far the crystal's absorption colour is pulled back toward white. */
  tintWash: 0.42,

  /**
   * The pointer fluid trail (see FluidCursor): how brightly the cursor's wake
   * lights the LED dots as it stirs the wall. 0 = off. Live-tunable in the dev
   * panel under "wall · cursor".
   */
  fluid: { glow: 0 },
} as const
