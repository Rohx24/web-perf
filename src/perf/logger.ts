/**
 * Rolling perf log, enabled with `?log=1`. Records one row per frame — time,
 * FPS, frame-time, scroll position, section name, draw calls and triangles — and
 * downloads it as a CSV so a full top-to-bottom scroll can be handed back for
 * analysis. A single number can't show a transient stall; a per-frame log can.
 */

export interface Sample {
  t: number
  fps: number
  ms: number
  scroll: number
  section: string
  calls: number
  tris: number
  dpr: number
}

const params =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams()

const MAX_ROWS = 40_000 // ~11 min at 60fps; guards memory on a very slow scroll

const buffer: Sample[] = []
let t0 = performance.now()

export const Logger = {
  /** Whether `?log=1` was present. */
  enabled: params.get('log') === '1',

  get count(): number {
    return buffer.length
  },

  record(s: Omit<Sample, 't'>): void {
    if (!Logger.enabled || buffer.length >= MAX_ROWS) return
    buffer.push({ t: Math.round(performance.now() - t0), ...s })
  },

  reset(): void {
    buffer.length = 0
    t0 = performance.now()
  },

  toCSV(): string {
    const header = 'time_ms,fps,frame_ms,scroll,section,drawcalls,triangles,dpr'
    const rows = buffer.map(
      (r) =>
        `${r.t},${r.fps.toFixed(1)},${r.ms.toFixed(2)},${r.scroll.toFixed(4)},` +
        `"${r.section}",${r.calls},${r.tris},${r.dpr.toFixed(2)}`,
    )
    return [header, ...rows].join('\n')
  },

  download(): void {
    const blob = new Blob([Logger.toCSV()], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `perf-log-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
