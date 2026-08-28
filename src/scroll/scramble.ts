/**
 * Text-scramble hover, alche-style: on hover the element's letters flicker
 * through random glyphs and resolve back to the original, left-to-right, for a
 * "decoding" read. Attaches to any element, reading its current textContent as
 * the target, and restores it exactly when done.
 */

const CHARS = '!<>-_\\/[]{}=+*^?#·:0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Attach the scramble to one element; returns a cleanup that detaches it. */
export function scrambleOnHover(el: HTMLElement, duration = 480): () => void {
  const target = el.textContent ?? ''
  const len = target.length
  let raf = 0
  let running = false

  const run = () => {
    if (running || len === 0) return
    running = true
    const start = performance.now()
    // Each character resolves at a staggered time — earlier ones settle first,
    // with a little jitter so it doesn't unzip in a perfectly straight line.
    const revealAt = target
      .split('')
      .map((_, i) => (i / len) * duration * 0.55 + Math.random() * duration * 0.45)

    const step = (now: number) => {
      const t = now - start
      let out = ''
      let done = 0
      for (let i = 0; i < len; i++) {
        const ch = target[i]
        if (ch === ' ') {
          out += ' '
          done++
        } else if (t >= revealAt[i]) {
          out += ch
          done++
        } else {
          out += CHARS[(Math.random() * CHARS.length) | 0]
        }
      }
      el.textContent = out
      if (done < len) {
        raf = requestAnimationFrame(step)
      } else {
        el.textContent = target
        running = false
      }
    }
    raf = requestAnimationFrame(step)
  }

  el.addEventListener('mouseenter', run)
  return () => {
    el.removeEventListener('mouseenter', run)
    cancelAnimationFrame(raf)
    el.textContent = target
  }
}

/**
 * Attach the scramble to every `[data-scramble]` element inside `root` (or the
 * document). Returns a single cleanup that detaches them all.
 */
export function scrambleAll(root: ParentNode = document): () => void {
  const els = Array.from(
    root.querySelectorAll<HTMLElement>('[data-scramble]'),
  )
  const cleanups = els.map((el) => scrambleOnHover(el))
  return () => cleanups.forEach((fn) => fn())
}
