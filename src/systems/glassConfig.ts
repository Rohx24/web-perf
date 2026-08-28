/**
 * The display's front glass.
 *
 * The look being chased here is a switched-off OLED: gloss black, and a mirror.
 * What makes one read that way is not brightness — the panel gives back almost
 * nothing of its own — it is that the room appears in it, sharply, and gets
 * stronger the further round the curve you look.
 *
 * An earlier version drew soft bars across the surface as fake highlights. That
 * was wrong in principle and looked it: a polished screen has no marks on it,
 * and painting some on reads as streaks over the picture rather than as glass.
 * See glassShader for what replaced it.
 */
export const GLASS = {
  /**
   * The room the mirror returns: a dimly lit ceiling over a near-black floor.
   *
   * Cool and desaturated, and deliberately not tinted toward the wall's own
   * cyan and violet — a reflection is the *room* arriving on the surface, and
   * colouring it like the picture underneath would read as a glow coming out of
   * the panel rather than as something lying on top of it.
   */
  ceiling: '#3C4A5E',
  floorTone: '#05070B',
  /** Master brightness of that room, before any reflectance is applied. */
  roomLevel: 1,

  /**
   * Where the floor gives way to the ceiling, and how abruptly.
   *
   * 0 is straight down, 1 straight up, 0.5 the horizon. Softness wants to stay
   * generous: a hard division would draw a visible line across the wall, which
   * is the streak problem coming back in another form.
   */
  horizon: 0.52,
  horizonSoft: 0.38,

  /**
   * Head-on reflectance. Real glass sits near 0.04, which is why a screen viewed
   * square-on shows almost nothing while the same screen viewed along its
   * surface shows the whole room. Raise it for a wetter, more lacquered look;
   * much past 0.15 the panel starts reading as polished metal.
   */
  baseReflect: 0.05,
  /**
   * How fast reflectance climbs toward the grazing angle. 5 is the physical
   * value. Lower drags the mirror further into the middle of the wall; higher
   * confines it to the extreme edges of the curve.
   */
  fresnelPower: 5,

  /** Master scale. 0 removes the glass without unmounting anything. */
  amount: 1,
} as const
