import { useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'

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

export function AdaptiveQuality ({ setDpr }: { setDpr: (fn: (d: number) => number) => void }) {
  const gl = useThree((s) => s.gl)
  const trans = useRef(QUALITY.transmissionScale)
  if (!ADAPTIVE_ENABLED) return null

  const applyTrans = (next: number) => {
    trans.current = next
    gl.transmissionResolutionScale = next
  }

  return (
    <PerformanceMonitor
      // A few frames of hysteresis so brief scroll spikes don't trip it.
      flipflops={3}
      onDecline={() => {
        setDpr((d) => Math.round(clamp(d - DPR_STEP, MIN_DPR, QUALITY.dprMax) * 100) / 100)
        applyTrans(clamp(trans.current - TRANS_STEP, 0.25, QUALITY.transmissionScale))
      }}
      onIncline={() => {
        setDpr((d) => Math.round(clamp(d + DPR_STEP, MIN_DPR, QUALITY.dprMax) * 100) / 100)
        applyTrans(clamp(trans.current + TRANS_STEP, 0.25, QUALITY.transmissionScale))
      }}
      // Persistent low → drop straight to the floor.
      onFallback={() => {
        setDpr(() => MIN_DPR)
        applyTrans(0.25)
      }}
    />
  )
}
