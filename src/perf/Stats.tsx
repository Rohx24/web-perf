import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { QUALITY } from './quality'

/**
 * A dependency-free performance HUD, mounted INSIDE the Canvas so it can read the
 * live renderer stats. Shown only when `?stats=1` is present.
 *
 * It measures a rolling FPS from the frame loop and reads draw calls / triangles
 * straight off `renderer.info`, then writes them into a fixed DOM panel it owns.
 * It never re-renders React (all updates are textContent writes on a ref'd node),
 * so the meter itself costs effectively nothing to run.
 */
export function StatsProbe() {
  const gl = useThree((state) => state.gl)
  const panel = useRef<HTMLDivElement | null>(null)
  const frames = useRef(0)
  const since = useRef(performance.now())
  const fps = useRef(0)

  useEffect(() => {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed',
      'top:10px',
      'left:10px',
      'z-index:9999',
      'padding:8px 10px',
      'font:12px/1.5 ui-monospace,Menlo,monospace',
      'color:#c9a24b',
      'background:rgba(0,0,0,0.72)',
      'border:1px solid rgba(201,162,75,0.4)',
      'border-radius:4px',
      'white-space:pre',
      'pointer-events:none',
      'letter-spacing:0.02em',
    ].join(';')
    document.body.appendChild(el)
    panel.current = el
    return () => {
      el.remove()
      panel.current = null
    }
  }, [])

  useFrame(() => {
    frames.current += 1
    const now = performance.now()
    const elapsed = now - since.current
    if (elapsed >= 500) {
      fps.current = Math.round((frames.current * 1000) / elapsed)
      frames.current = 0
      since.current = now

      const info = gl.info
      if (panel.current) {
        const dpr = gl.getPixelRatio().toFixed(2)
        panel.current.textContent =
          `tier    ${QUALITY.tier}  (${QUALITY.source})\n` +
          `fps     ${fps.current}\n` +
          `dpr     ${dpr}  (max ${QUALITY.dprMax})\n` +
          `trans   ${QUALITY.transmissionScale}\n` +
          `calls   ${info.render.calls}\n` +
          `tris    ${info.render.triangles.toLocaleString()}\n` +
          `geom    ${info.memory.geometries}  tex ${info.memory.textures}`
      }
    }
  })

  return null
}
