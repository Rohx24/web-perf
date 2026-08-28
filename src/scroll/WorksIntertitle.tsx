import { useEffect, useRef } from 'react'

import { SCROLL } from './scrollConfig'
import { scrollProgress } from './scrollProgress'

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}
function invlerp(a: number, b: number, x: number): number {
  return clamp01((x - a) / (b - a))
}

/**
 * The hero → gallery transport.
 *
 * Just after the camera zooms into the wall, a big tilted "WORKS" slides down
 * through the black — top to bottom — the way Alche's section titles rake
 * across. A flash then hands off to the glitch and the gallery, so the dive
 * never reads as an empty black scroll. DOM, driven by scroll via rAF.
 */
export function WorksIntertitle() {
  const flashRef = useRef<HTMLDivElement>(null)
  const worksRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = scrollProgress()
      const it = SCROLL.intertitle

      // Sharp white flash at the hand-off.
      const flash = 1 - Math.min(1, Math.abs(s - it.flashCentreS) / it.flashWidth)
      if (flashRef.current) flashRef.current.style.opacity = String(flash * flash * 0.9)

      // WORKS flows across on a diagonal — mostly sideways, drifting down — the
      // way Alche's section titles rake past, rather than dropping straight.
      const win = invlerp(it.worksInS, it.worksOutS, s)
      const x = 54 - win * 108 // vw, sweeps right → left
      const y = -14 + win * 26 // vh, slight downward drift
      const fade = Math.min(invlerp(0, 0.22, win), 1 - invlerp(0.78, 1, win))
      if (worksRef.current) {
        worksRef.current.style.opacity = String(fade)
        worksRef.current.style.transform = `translate(-50%, -50%) translate(${x}vw, ${y}vh) rotate(-8deg)`
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const letters = 'WORKS'.split('')
  const mid = (letters.length - 1) / 2

  return (
    <div className="rd-intertitle">
      <div ref={flashRef} className="rd-flash" style={{ opacity: 0 }} />
      {/* Per-letter arc so the word bends with the curved LED wall behind it. */}
      <div ref={worksRef} className="rd-works-title" style={{ opacity: 0 }}>
        {letters.map((ch, i) => (
          <span
            key={i}
            className="rd-works-letter"
            style={{ transform: `rotateY(${(mid - i) * 16}deg)` }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  )
}
