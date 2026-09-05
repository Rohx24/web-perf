import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'

import { BootScreen } from './BootScreen'

/**
 * Shows the CRT boot over the site on load. While it plays, the real scene mounts
 * behind it and pre-warms (assets download, shaders compile) — hidden. When the
 * site is ready (all assets loaded) and a minimum hold has passed, it triggers
 * the "pulled through the screen" reveal, then unmounts.
 *
 * Readiness = drei's global loading progress (both the CRT model and the hero
 * assets report to the same loading manager). A max-wait fallback guarantees it
 * never hangs if a load stalls. `?noboot=1` skips it for development.
 */

type Phase = 'boot' | 'reveal' | 'gone'

const SKIP =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noboot') === '1'

const MIN_HOLD = 2600 // let the moment land even on a fast machine
const MAX_WAIT = 12000 // reveal anyway if loading stalls

export function BootGate ({ children }: { children: React.ReactNode }) {
  const { active, progress } = useProgress()
  const [phase, setPhase] = useState<Phase>(SKIP ? 'gone' : 'boot')
  const startedLoading = useRef(false)
  const t0 = useRef(performance.now())
  const [, tick] = useState(0)

  // Note once loading has actually begun, so an initial "100% / idle" reading
  // (before any loader kicks off) isn't mistaken for "ready".
  if (active) startedLoading.current = true

  useEffect(() => {
    if (phase !== 'boot') return
    const id = setInterval(() => tick((n) => n + 1), 120)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'boot') return
    const elapsed = performance.now() - t0.current
    const loaded = startedLoading.current && !active && progress >= 100
    if (elapsed >= MIN_HOLD && (loaded || elapsed >= MAX_WAIT)) setPhase('reveal')
  })

  return (
    <>
      {children}
      {phase !== 'gone' && (
        <BootScreen reveal={phase === 'reveal'} onFaded={() => setPhase('gone')} />
      )}
    </>
  )
}
