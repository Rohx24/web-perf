/**
 * Whether the 3D scene is completely hidden behind the page.
 *
 * Once the About panel has docked it covers the viewport edge to edge with an
 * opaque background, and the contact page rises over that. The scene underneath
 * was still rendering every frame — 142 draw calls, ~4.5 ms, at the display's
 * full rate — for nothing anyone could see. The outro reports cover here and App
 * pauses the renderer while it holds.
 *
 * Scroll easing normally advances inside the scene's frame loop (ScrollController),
 * so while the loop is paused ScrollController steps it from a plain rAF instead
 * — otherwise scrolling back up could never un-dock the panel.
 */
let covered = false
const listeners = new Set<(v: boolean) => void>()

export const sceneCovered = () => covered

export function setSceneCovered(v: boolean): void {
  if (covered === v) return
  covered = v
  listeners.forEach((fn) => fn(v))
}

export function onSceneCovered(fn: (v: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
