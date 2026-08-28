/**
 * The invisible cursor lens.
 *
 * Distances are in CSS pixels; the system scales them by the device pixel ratio
 * so the lens is the same physical size on every display.
 */
export const CURSOR_DISTORTION = {
  /** Lens radius in CSS pixels — the thickness of the trail, not its length. */
  radius: 105,
  /** Peak displacement in CSS pixels. */
  strength: 5,
  /** Peak magnification at the core of the lens. */
  magnification: 1.03,
  /**
   * Shapes the radial mask. 1 is the plain smoothstep; higher pulls the
   * distortion in toward the core and makes the outer half even fainter.
   */
  falloff: 1.25,

  /**
   * The lens can drag a tail behind the cursor, stretching from a disc into a
   * capsule as the pointer speeds up.
   *
   * Currently off. Stretching the lens along the path just travelled reads as a
   * rigid streak of glass rather than as something fluid: the shape is derived
   * from measured speed, so it lags the hand and snaps back the moment the
   * cursor stops. A plain disc tracking at `followRate` feels far smoother,
   * because the only thing moving is the lens itself.
   *
   * To bring a hint of it back, raise `lengthPerSpeed` toward 0.05 and cap
   * `maxLength` around 90 — past that the capsule becomes a visible object.
   */
  trail: {
    /**
     * Trail length in CSS pixels per (CSS pixel / second) of cursor speed. A
     * pointer crossing 1000px in a second pulls a tail of roughly
     * 1000 times this many pixels.
     */
    lengthPerSpeed: 0,
    /** Hard cap on trail length, in CSS pixels. */
    maxLength: 0,
    /**
     * How much the tail weakens relative to the head. 0 would make the streak
     * uniform, which reads as a smear rather than as something being followed.
     */
    taper: 0.55,
    /**
     * Smoothing on the measured speed, per second. Low enough that the trail
     * grows and shrinks smoothly instead of flickering with every jittery
     * pointer sample.
     */
    speedSmoothing: 9,
  },

  /**
   * How the lens fades in and out. Position tracks quickly so the head of the
   * lens never lags the cursor; the gain eases so it does not pop into being.
   */
  response: {
    /** Exponential smoothing rate for the lens head, per second. */
    followRate: 30,
    /** Spring for the 0-to-1 gain when the cursor enters or leaves. */
    stiffness: 30,
    dampingRatio: 1,
  },
} as const
