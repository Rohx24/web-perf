import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { introActive, onIntroChange } from './introState'

import { QUALITY } from './quality'

/**
 * Runtime adaptive quality.
 *
 * Static tiers guessed from a GPU string are brittle — a mid laptop can be
 * mislabelled and still stutter. This instead *measures* the real frame rate
 * (drei's PerformanceMonitor watches the rolling average vs. the display refresh)
 * and steps the two biggest fill-rate levers to match:
 *
 *   - render DPR (pixels shaded)          — stepped down on sustained low FPS.
 *   - the glass transmission-pass scale   — eased down as the GPU strains.
 *
 * Crucially it uses RELATIVE steps from the tier ceiling, not an absolute factor:
 * a healthy machine never declines, so it simply stays at full quality
 * (desktop untouched). A struggling laptop steps down until it's smooth, and
 * steps back up if it recovers.
 *
 * `?adaptive=0` disables it; an explicit `?dpr=` also disables it so a fixed test
 * value holds.
 */

const MIN_DPR = 0.6
const DPR_STEP = 0.25
const TRANS_STEP = 0.15

const params =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const ADAPTIVE_ENABLED = params.get('adaptive') !== '0' && !params.has('dpr')

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** How long after the page is handed over before quality may be changed. */
const SETTLE_MS = 3500

export function AdaptiveQuality ({ setDpr }: { setDpr: (fn: (d: number) => number) => void }) {
  const gl = useThree((s) => s.gl)
  const trans = useRef(QUALITY.transmissionScale)

  /* Nothing is allowed to change quality until the page has been in the
     visitor's hands for a moment.

     Changing DPR or the transmission scale reallocates the drawing buffer and
     the transmission target — that reallocation is itself a stall, so reacting
     to a short-lived frame-rate dip costs more than the dip did. Two moments
     produce exactly such a dip: the intro, where this was measuring a scene
     nobody is looking at, rendered deliberately small; and the first scroll off
     the hero, where a screen of new geometry becomes visible at once. Reacting
     to that was spending a reallocation to fix a spike that had already passed —
     which is the stall on the first scroll. */
  const armed = useRef(!introActive())
  useEffect(() => {
    let t = 0
    const arm = () => { t = window.setTimeout(() => { armed.current = true }, SETTLE_MS) }
    if (!introActive()) { arm(); return () => window.clearTimeout(t) }
    const off = onIntroChange((stillUp) => { if (!stillUp) arm() })
    return () => { off(); window.clearTimeout(t) }
  }, [])

  if (!ADAPTIVE_ENABLED) return null

  const applyTrans = (next: number) => {
    trans.current = next
    gl.transmissionResolutionScale = next
  }

  return (
    <PerformanceMonitor
      // A few frames of hysteresis so brief scroll spikes don't trip it.
      flipflops={3}
      /* A longer sample window than drei's 250ms default. The levers here are
         expensive to pull, so the evidence for pulling one has to be sustained
         rather than a single busy half-second. */
      ms={500}
      iterations={12}
      onDecline={() => {
        if (!armed.current) return
        setDpr((d) => Math.round(clamp(d - DPR_STEP, MIN_DPR, QUALITY.dprMax) * 100) / 100)
        applyTrans(clamp(trans.current - TRANS_STEP, 0.25, QUALITY.transmissionScale))
      }}
      onIncline={() => {
        if (!armed.current) return
        setDpr((d) => Math.round(clamp(d + DPR_STEP, MIN_DPR, QUALITY.dprMax) * 100) / 100)
        applyTrans(clamp(trans.current + TRANS_STEP, 0.25, QUALITY.transmissionScale))
      }}
      // Persistent low → drop straight to the floor.
      onFallback={() => {
        if (!armed.current) return
        setDpr(() => MIN_DPR)
        applyTrans(0.25)
      }}
    />
  )
}
