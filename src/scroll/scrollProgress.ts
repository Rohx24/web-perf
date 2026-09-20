/**
 * Shared scroll state.
 *
 * One module-level value, updated by one passive listener, read by everything
 * that reacts to scroll — the camera rig, the warp, the cards, the DOM overlay.
 * This mirrors the pointer store: routing scroll through React state would
 * re-render the tree at scroll frequency, which is exactly what we do not want.
 *
 * `progress` is the document scroll position normalised to 0…1.
 */

/**
 * `target` is where the document is actually scrolled; `progress` is the eased
 * value everything reads. The gap between them is what makes a fast flick play
 * out as a smooth pass through every beat instead of jumping straight to the
 * end — the scene glides toward where you scrolled rather than snapping there.
 */
const state = { target: 0, progress: 0, velocity: 0 }
let lastProgress = 0

/**
 * How quickly the eased value catches up to the true scroll, per second. Lower
 * is more glide (more "you're carried through it"); higher is snappier. This is
 * the main knob for how forced-to-watch the sequence feels.
 */
const EASE_RATE = 3.4

/**
 * Hard ceiling on how fast the eased value may travel, in progress-units per
 * second — the "no scroll accelerator" cap. A gentle scroll stays under it and
 * feels direct; a hard flick is clamped to this rate instead of rushing the
 * whole sequence, so scrolling faster never plays it faster past this speed.
 */
const MAX_SPEED = 0.22

function measure(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, window.scrollY / max))
}

function update() {
  state.target = measure()
}

/**
 * Begin tracking scroll. Returns a teardown that removes the listeners.
 * Call once, from a component mount.
 */
export function attachScroll(): () => void {
  update()
  // Start settled on the true position — no ease-in from zero on first paint.
  state.progress = state.target
  lastProgress = state.progress
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  return () => {
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
  }
}

/** The eased scroll progress in [0, 1]. Read every frame. */
export function scrollProgress(): number {
  return state.progress
}

// Dev-only: jump the eased scroll straight to a value, for inspecting a beat
// without waiting for the speed-capped ease to catch up. window.__scroll(0.6)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __scroll: (v: number) => void }).__scroll = (v) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, v * max)
    state.progress = v
    state.target = v
    lastProgress = v
  }
  // Read the eased progress the scene actually uses, for calibrating beats.
  ;(window as unknown as { __p: () => number }).__p = () => state.progress
  // ...and the smoothed speed, for checking what is allowed to run mid-scroll.
  ;(window as unknown as { __vel: () => number }).__vel = () => state.velocity
}

/**
 * Advance the eased scroll and the smoothed speed. Call once per frame (from the
 * camera rig), before anything reads `scrollProgress()`.
 *
 * The easing is frame-rate independent; the velocity is measured from the eased
 * value, so "settled" reflects what is actually on screen (a live embed is only
 * shown when settled, so it never has to chase a moving 3D pane).
 */
export function tickScroll(dt: number) {
  const k = 1 - Math.exp(-EASE_RATE * Math.max(dt, 0))
  let step = (state.target - state.progress) * k
  // Clamp the per-frame move so a fast flick can't outrun the cap.
  const maxStep = MAX_SPEED * Math.max(dt, 0)
  if (step > maxStep) step = maxStep
  else if (step < -maxStep) step = -maxStep
  state.progress += step

  const instant = dt > 0 ? Math.abs(state.progress - lastProgress) / dt : 0
  state.velocity += (instant - state.velocity) * Math.min(1, dt * 10)
  lastProgress = state.progress
}

/** Smoothed scroll speed, in progress-units per second. ~0 when settled. */
export function scrollVelocity(): number {
  return state.velocity
}
