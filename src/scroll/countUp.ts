/**
 * Count a number up from zero, once, as its tile arrives.
 *
 * Reads the element's own text as the target, so the markup stays the source of
 * truth: "8.06" keeps two decimals, "01" keeps its leading zero, "Top 8" and "6+"
 * keep the words around the number. The last frame writes the original string
 * back verbatim, so float rounding can never leave "8.0599" on screen.
 *
 * Eased with an exponential out, which is what the skill bars' fill already uses
 * (cubic-bezier 0.16, 1, 0.3, 1), so a level and its bar land together.
 */
const PATTERN = /^(\D*?)(\d+(?:\.\d+)?)(\D*)$/

export function countUp(el: HTMLElement): void {
  const target = el.textContent ?? ''
  const m = PATTERN.exec(target)
  if (!m) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const [, prefix, digits, suffix] = m
  const value = Number(digits)
  const decimals = digits.includes('.') ? digits.split('.')[1].length : 0
  const pad = decimals === 0 && digits.length > 1 && digits.startsWith('0') ? digits.length : 0
  const duration = Number(el.dataset.countDur ?? 1100)
  const delay = Number(el.dataset.countDelay ?? 0)

  const format = (v: number) => {
    const s = v.toFixed(decimals)
    return prefix + (pad ? s.padStart(pad, '0') : s) + suffix
  }

  // synchronous, inside the observer callback, so the final value never flashes
  el.textContent = format(0)
  const start = performance.now() + delay
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / duration))
    if (t >= 1) {
      el.textContent = target
      return
    }
    el.textContent = format(value * (1 - Math.pow(2, -10 * t)))
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
