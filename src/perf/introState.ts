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

/* ---- the reveal ---------------------------------------------------------
   Separate from the intro because they end at different times, and the gap
   between them matters: the reveal renders the scene into a target and then
   composites it, so it costs about twice a normal frame for its whole run —
   on top of the transmission pass the hero already pays for.

   Raising resolution at the START of that was the wrong moment for it. The
   heaviest three seconds on the site were being handed the biggest jump in
   pixel count at the same instant. Resolution now waits for the reveal to
   finish. */
let revealed = false
const revealListeners = new Set<() => void>()

export const revealDone = () => revealed

export function setRevealDone(): void {
  if (revealed) return
  revealed = true
  revealListeners.forEach((fn) => fn())
}

export function onRevealDone(fn: () => void): () => void {
  if (revealed) { fn(); return () => {} }
  revealListeners.add(fn)
  return () => revealListeners.delete(fn)
}
