import { MathUtils } from 'three'

/**
 * The floating crystal logo.
 *
 * Everything here is a knob on presentation only — the GLB's geometry is used
 * exactly as authored.
 */
export const HERO = {
  /**
   * The mark, decimated to 6% of the source's density.
   *
   * The original is 465,812 triangles across 12 meshes — 99.3% of every
   * triangle the site draws, against 3,336 for the entire room, wall, panels,
   * grid, typography, glass and frames combined. Measured, thinning it is the
   * only change that removes the frame-time tail: lowering transmission
   * resolution does nothing, and turning transmission off entirely helps less.
   *
   * This build is 27,947 triangles in ONE draw call (every imported material is
   * replaced below by a single shared glass material, so the source's 12 draw
   * calls and 36 textures were both paying for nothing), and 0.25 MB against
   * 2.37 MB. Geometric error is 0.06%.
   *
   * ?hero=/models/metal-letter-opt.glb puts the original back for comparison;
   * the 50/30/20/12% builds are alongside it, and /compare.html shows the
   * ladder side by side. scripts/decimate-hero.mjs regenerates them.
   */
  url:
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('hero')) ||
    '/models/metal-letter-06.glb',

  /**
   * On the camera's view axis, set back into the room so the wall sits close
   * behind it rather than a long way off. `height` compensates: moving the block
   * further from the camera shrinks it on screen, so it is scaled up to keep the
   * same presence. Parallax still reads it as suspended rather than mounted.
   */
  position: [0, 2.1, -2.2] as [number, number, number],
  /**
   * The GLB lies flat — its thin axis is Y — so it has to be stood up to face
   * the camera. +90deg about X presents the model's front face with its
   * artwork upright; -90deg presents the back face, mirrored and inverted.
   * Geometry is untouched; this is the object's local transform only.
   *
   * To spin the symbol within its own plane, use the third component rather
   * than changing the first.
   */
  rotation: [Math.PI / 2, 0, 0] as [number, number, number],
  /**
   * Target height in metres. The model is measured at load and scaled to fit,
   * so the GLB's own units do not matter.
   */
  height: 3.15,
  /**
   * Extra width on top of the fitted height, so the mark reads fatter and more
   * planted than the GLB's own proportions. 1 would be the model as authored.
   */
  widthScale: 1.22,

  /**
   * Thick cast crystal, not a clean lens.
   *
   * A polished optical block shows you the wall behind it, sharply. That is the
   * wrong read here: the logo should look like it is *made of* the room's light,
   * carrying the colour of the panels behind it in its body and scattering it,
   * rather than acting as a window onto them. So the block absorbs, scatters and
   * splits light instead of transmitting it cleanly.
   */
  glass: {
    transmission: 1,
    ior: 1.52,
    /**
     * Deep enough that absorption has real distance to work over — the
     * attenuation below is exponential in thickness, so a thin block would
     * barely tint at all.
     */
    thickness: 4.6,
    /**
     * Not a polished lens. Under transmission this blurs what is seen *through*
     * the block, which is the single biggest lever on whether the logo reads as
     * clear glass or as cast crystal. Past about 0.25 it stops looking like
     * material and starts looking like frosted bathroom glazing.
     */
    roughness: 0.1,
    metalness: 0,
    /** The outer surface stays a perfect mirror even as the inside scatters. */
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 1,
    envMapIntensity: 1.6,
    /**
     * How far light gets through the block before the body colour takes over.
     *
     * Absorption is exponential in thickness/distance, so this has to stay in
     * the same order as `thickness` — set it much below and the ratio runs away,
     * the block swallows nearly everything reaching it, and the logo goes black.
     * Around one thickness leaves roughly a third of the light through: a deep,
     * saturated body colour that still reads as glass. The colour itself is not
     * set here — it is written every frame from the wall's own ramp.
     */
    attenuationDistance: 4.4,
    /**
     * Thin-film split across the surface. This is what puts the bands of
     * unrelated colour across the block — the streaks that make it look like a
     * real cast piece catching a room full of coloured light rather than a
     * uniformly tinted solid.
     */
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 940] as [number, number],
    /**
     * A soft coloured layer over the whole surface, tinted by the room.
     *
     * Without this the block can only ever be as bright as what is behind it,
     * because full transmission leaves no diffuse response — and the wall is
     * mostly dark, so the logo came out a near-black silhouette. Sheen catches
     * the room's light directly and spreads it broadly across the surface
     * instead of into a few hard highlights, which is what makes the crystal
     * read as glowing with the room rather than as a hole cut in it.
     */
    sheen: 1,
    sheenRoughness: 0.5,
    /**
     * Strength of the internal waviness at rest. This is the amount the
     * refracted view bends as it passes through the block — not a surface
     * finish. Enough to break the transmitted image into moving structure.
     */
    waviness: 0.11,
    /** Repeats of the waviness field across the block (Alche's noiseScale). */
    wavinessScale: 9,
  },

  /** Breathing, not movement. */
  idle: {
    /** Vertical drift either side of centre, in metres. */
    floatAmplitude: 0.035,
    floatSeconds: 9,
    /** Peak tilt, in radians — roughly 2 degrees. It never completes a turn. */
    tiltAmplitude: 0.035,
    tiltSeconds: 14,
  },

  /**
   * Cursor response, split in two.
   *
   * `pose` is how far the block turns toward the cursor. `refraction` is how
   * much harder the glass bends light as the cursor nears it — that is the part
   * carrying the interaction, so the block itself never has to move much.
   */
  /**
   * Hold left click and move to turn the block by hand.
   *
   * This is not orbit control: the camera and the room never move, only the
   * logo. What the drag accumulates is a persistent offset that the cursor lean
   * and the idle drift then play on top of, so letting go leaves the block where
   * it was put rather than snapping it back.
   */
  drag: {
    /** Radians of turn per unit of normalised pointer travel. */
    yawPerUnit: Math.PI * 1.1,
    pitchPerUnit: Math.PI * 0.55,
    /** Limits, so the block can never be wound away to a meaningless angle. */
    maxPitch: MathUtils.degToRad(55),
    /** Follows the hand closely — a drag should feel direct, not elastic. */
    stiffness: 90,
    dampingRatio: 1,
    /**
     * Seconds the block holds where it was left before drifting home. Long
     * enough to look at what you turned it to, short enough that the hero
     * always settles back to its designed pose on its own.
     */
    returnDelay: 5,
    /** Rate the held rotation unwinds at once the delay is up, per second. */
    returnRate: 1.6,
  },

  cursor: {
    pose: {
      /** Hard limits on the turn — only a slight lean toward the cursor, a few
       *  degrees at most, never a real rotation. */
      maxYaw: MathUtils.degToRad(5),
      maxPitch: MathUtils.degToRad(3),
      /**
       * Low stiffness reads as mass: the block takes roughly half a second to
       * arrive. Damping ratio 1 is critical damping — the fastest approach that
       * never overshoots, which is what rules out wobble and elastic settle.
       */
      stiffness: 16,
      dampingRatio: 1,
    },
    refraction: {
      /** Falloff radius in normalised screen units. */
      radius: 0.8,
      /** Added to `thickness` at full proximity — deepens the refraction. */
      thicknessGain: 2.4,
      /** Added to the waviness — bends the internal refraction further. */
      wavinessGain: 0.05,
      /** Added to `ior` — shifts where the surrounding reflections land. */
      iorGain: 0.07,
      /** Fraction added to `envMapIntensity` at full proximity. */
      reflectionGain: 0.6,
      /** A touch quicker than the pose, so light reacts before mass does. */
      stiffness: 26,
      dampingRatio: 1,
    },
    /**
     * An extra, tighter response for when the cursor is actually over the
     * block rather than merely near it — the cursor lens and the crystal
     * agreeing with each other.
     *
     * This adds only to the optical terms. Yaw and pitch are deliberately left
     * out: the block must not turn further or wobble when hovered.
     */
    hover: {
      /** Falloff radius in normalised screen units — roughly the block itself. */
      radius: 0.22,
      thicknessGain: 1.6,
      wavinessGain: 0.035,
      iorGain: 0.05,
      reflectionGain: 0.5,
      stiffness: 22,
      dampingRatio: 1,
    },
  },
} as const
