import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import type { PerspectiveCamera } from 'three'

import { SCROLL } from './scrollConfig'
import { VIEWER } from '../scene/roomConfig'
import { attachScroll, scrollProgress, tickScroll } from './scrollProgress'
import { usePointerState } from '../systems/InteractionController'
import { registerControls } from '../dev/controls'

// A very slight cursor parallax on the camera — a rich, smooth lean toward the
// pointer. Small metres of pan (translation) plus a touch of tilt (look-toward),
// so the whole room — logo included — drifts gently with the hand.
const PAN_X = 0.12
const PAN_Y = 0.06
const TILT_X = 0.2
const TILT_Y = 0.1

// The hero is framed at VIEWER.fov (35, locked). As the page scrolls past the
// hero the lens eases back a touch, to 38, so more of the wall — and the whole
// WORKS title on it — comes into view. Eased over the same window WORKS enters.
const SCROLL_FOV = 38
const FOV_EASE_END = 0.16

/**
 * Owns the camera whenever the page is scrolled.
 *
 * Runs at the default frame priority, so it updates the camera *before*
 * CursorDistortionSystem (priority 1) renders. At S=0 it reproduces the static
 * Viewer pose exactly; it then flies the camera straight down −Z through the
 * hero and the wall, settling into the void where it holds for the outro.
 *
 * The hero and its wall are never modified — the camera merely passes through.
 */
export function ScrollController() {
  const camera = useThree((state) => state.camera)
  const pointer = usePointerState()
  const drift = useRef({ x: 0, y: 0 })
  // The hero base FOV. The dev slider writes here rather than straight onto the
  // camera, because the frame loop below drives the camera's own fov (easing
  // from this base out to SCROLL_FOV on scroll) and would otherwise overwrite it.
  const heroFov = useRef<number>(VIEWER.fov)

  useEffect(() => attachScroll(), [])

  // Live FOV control: a lower field of view zooms the whole room in (the LED wall
  // and logo read closer/larger), a higher one pulls everything back. This sets
  // the hero base; the scrolled-back framing tracks it.
  useEffect(() => {
    return registerControls([
      {
        group: 'camera',
        label: 'fov',
        min: 18,
        max: 75,
        step: 0.5,
        get: () => heroFov.current,
        set: (value: number) => {
          heroFov.current = value
        },
      },
    ])
  }, [])

  useFrame((_, dt) => {
    tickScroll(dt)
    const c = SCROLL.camera

    // Ease the lens from the hero framing out to SCROLL_FOV as the page scrolls
    // past the hero. At scroll 0 this is exactly the (dev-tunable) hero base, so
    // the hero is untouched.
    const cam = camera as PerspectiveCamera
    const zoom = MathUtils.smoothstep(scrollProgress(), 0, FOV_EASE_END)
    const fov = MathUtils.lerp(heroFov.current, SCROLL_FOV, zoom)
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    // Ease the parallax toward the pointer, gently, so it is always smooth and
    // settles back to centre when the pointer leaves.
    const p = pointer.current
    const tx = p.active ? p.x : 0
    const ty = p.active ? p.y : 0
    const k = 1 - Math.exp(-3.5 * Math.max(dt, 0))
    drift.current.x += (tx - drift.current.x) * k
    drift.current.y += (ty - drift.current.y) * k
    const dx = drift.current.x
    const dy = drift.current.y

    // Pan: the camera slides a little toward the cursor. Tilt: it also looks a
    // touch that way, so the room leans rather than merely sliding — and the
    // logo, being in the scene, drifts with it.
    const ox = dx * PAN_X
    const oy = dy * PAN_Y
    camera.position.set(ox, c.startY + oy, c.startZ)
    camera.lookAt(ox + dx * TILT_X, c.startLookY + oy + dy * TILT_Y, c.startLookZ)
  })

  return null
}
