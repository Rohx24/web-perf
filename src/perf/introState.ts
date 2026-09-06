/**
 * Whether the title screen is still up.
 *
 * The portfolio now mounts immediately, underneath the intro, rather than on
 * ENTER — because the tube shows the LIVE hero, so the hero has to be running
 * for there to be anything to show. That is also what a loading screen is FOR:
 * it covers the load instead of deferring it.
 *
 * While it is covered, the hero renders at a fraction of the pixels. It is
 * being seen through a television, so resolution there is worth nothing, and
 * this is what keeps mounting-up-front from costing what it looks like it costs.
 */
let active = true
const listeners = new Set<(v: boolean) => void>()

export const introActive = () => active

export function setIntroActive (v: boolean): void {
  if (active === v) return
  active = v
  listeners.forEach((fn) => fn(v))
}

export function onIntroChange (fn: (v: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Pixel-density ceiling while the hero is only ever seen inside the tube. */
export const INTRO_DPR = 0.55
