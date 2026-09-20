/**
 * ?spikes=1 — a list of the slow frames, on screen.
 *
 * A stutter is easy to feel and hard to describe: how long, and where in the
 * scroll. This records every frame that took longer than a threshold, with the
 * scroll position it happened at, and prints the worst of them in a corner so
 * they can be read (or screenshotted) without DevTools, a console, or a
 * paste-in snippet that a strict page would refuse to run.
 *
 * It costs one rAF and a few numbers a frame, and it only exists when the flag
 * is on.
 */
const SLOW_MS = 30
const KEEP = 10
/** Ignore the first moments: loading hitches are not what this is looking for. */
const IGNORE_MS = 2500

export function attachSpikeLog(): void {
  const panel = document.createElement('div')
  panel.style.cssText = [
    'position:fixed',
    'left:12px',
    'bottom:12px',
    'z-index:2147483000',
    'padding:10px 12px',
    'min-width:220px',
    'border-radius:8px',
    'background:rgba(6,7,10,0.86)',
    'border:1px solid rgba(255,255,255,0.14)',
    'color:#eaf0f8',
    'font:500 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'pointer-events:none',
    'white-space:pre',
  ].join(';')
  document.body.appendChild(panel)

  const spikes: { ms: number; at: number }[] = []
  let worst = 0
  let frames = 0
  let last = performance.now()
  const started = last
  /** Where the page is scrolled, 0 at the hero and 1 at the very bottom. */
  const where = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return max > 0 ? window.scrollY / max : 0
  }

  const tick = () => {
    const now = performance.now()
    const ms = now - last
    last = now
    frames += 1
    if (ms > SLOW_MS && now - started > IGNORE_MS) {
      spikes.push({ ms: Math.round(ms), at: where() })
      if (ms > worst) worst = Math.round(ms)
      if (spikes.length > KEEP) spikes.shift()
    }
    // Repainting the panel every frame would be its own cost; four times a
    // second is plenty to read.
    if (frames % 15 === 0) {
      panel.textContent =
        `slow frames (>${SLOW_MS}ms)\n` +
        `worst ${worst}ms\n` +
        (spikes.length === 0
          ? 'none yet'
          : spikes.map((s) => `${String(s.ms).padStart(4)}ms  at ${(s.at * 100).toFixed(1)}% down the page`).join('\n'))
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
