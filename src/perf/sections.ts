import { SCROLL, galleryActive } from '../scroll/scrollConfig'
import { PROJECTS } from '../scroll/projects'

/**
 * Human-readable name of the section the given scroll position is in, used by the
 * perf HUD and the CSV log so a frame drop can be pinned to exactly where it
 * happens. Crucially it names the project→project *transitions* inside the works
 * gallery ("A → B"), because that is where the hitching is reported.
 */
export function currentSection(s: number): string {
  const { diveStart, galleryStart, outroStart } = SCROLL.phase

  if (s < diveStart) return 'Hero'
  if (s < galleryStart) return 'Dive · wall punch-through'
  if (s >= outroStart) return 'Outro · brand + about/contact'

  // Works gallery: galleryActive() is a continuous index — an integer while a
  // project is parked/featured, fractional while gliding to the next.
  const active = galleryActive(s)
  const clamp = (i: number) => Math.max(0, Math.min(PROJECTS.length - 1, i))
  const base = Math.round(active)
  const frac = active - base
  const title = (i: number) => PROJECTS[clamp(i)]?.title ?? `#${i}`

  if (Math.abs(frac) < 0.06) return `Works · ${title(base)}`

  // Mid-transition between two panes.
  const next = base + Math.sign(frac)
  return `Works · ${title(base)} → ${title(next)}`
}
