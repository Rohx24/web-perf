/**
 * A tiny registry of live-tunable values.
 *
 * Every number in this project's config files was, until now, tuned by editing
 * a file and reloading the page. That round trip is slow enough that it shaped
 * the work: values got left at "close enough" because checking one more was
 * expensive, and a whole session was spent chasing a dot size that a slider
 * would have settled in ten seconds.
 *
 * A control writes *straight to the live value* — a shader uniform, a material
 * property — rather than into React state. Nothing re-renders, nothing is
 * rebuilt, and the change is visible on the next frame. That also means the
 * panel cannot drift out of step with what is actually being drawn: it is not
 * holding a copy, it is reading and writing the real thing.
 *
 * Dev only. `registerControls` is a no-op in a production build, so none of
 * this reaches the shipped bundle.
 */

/** A number on a slider. The default, and what most of this project tunes. */
export type RangeControl = {
  kind?: 'range'
  /** Which panel this control belongs to — 'main' (default) or e.g. 'works'. */
  panel?: string
  /** Which section of the panel this belongs under. */
  group: string
  label: string
  min: number
  max: number
  step: number
  /** Read the live value. Called on every panel render, never cached. */
  get: () => number
  /** Write the live value. Takes effect on the next frame. */
  set: (value: number) => void
}

/**
 * A pick from a fixed set — a dropdown rather than a slider.
 *
 * Some things genuinely are not numbers. A typeface is the case that forced
 * this: putting fonts on a slider would mean indexing a list by a float, which
 * shows a meaningless number in the panel and silently picks the wrong face at
 * either end of the range.
 */
export type ChoiceControl = {
  kind: 'choice'
  panel?: string
  group: string
  label: string
  options: readonly { readonly label: string; readonly value: string }[]
  get: () => string
  set: (value: string) => void
}

export type Control = RangeControl | ChoiceControl

export function isChoice(control: Control): control is ChoiceControl {
  return control.kind === 'choice'
}

const registry: Control[] = []
const listeners = new Set<() => void>()

/** Whether the panel exists at all. */
export const CONTROLS_ENABLED = import.meta.env.DEV

/**
 * Add controls, and remove them again when the owning system unmounts.
 * Returns the cleanup, so it can be handed straight back from a useEffect.
 */
export function registerControls(controls: Control[]): () => void {
  if (!CONTROLS_ENABLED) return () => {}

  registry.push(...controls)
  listeners.forEach((notify) => notify())

  return () => {
    for (const control of controls) {
      const at = registry.indexOf(control)
      if (at >= 0) registry.splice(at, 1)
    }
    listeners.forEach((notify) => notify())
  }
}

export function getControls(): readonly Control[] {
  return registry
}

/** Called when controls are added or removed, so the panel can re-list them. */
export function subscribeToControls(notify: () => void): () => void {
  listeners.add(notify)
  return () => listeners.delete(notify)
}
