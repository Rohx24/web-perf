import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'

export type PointerState = {
  /** Normalised device coordinates: -1..1, y up. */
  x: number
  y: number
  /** False whenever the cursor is not over the canvas. */
  active: boolean
  /** True while the left button is held down over the canvas. */
  dragging: boolean
  /**
   * Movement since the last frame read it, in normalised units. Whoever
   * consumes a drag is expected to zero these, so the delta is never applied
   * twice.
   */
  dragX: number
  dragY: number
}

/**
 * A second-order spring, integrated per frame.
 *
 * `dampingRatio` of 1 is critical damping: the fastest approach to the target
 * that never crosses it. That is what keeps the motion heavy but free of
 * wobble, elastic settle or snap — and it behaves identically on the way back
 * to neutral as on the way out, so releasing the cursor cannot feel different
 * from chasing it.
 */
export class Spring {
  value: number
  velocity = 0
  private readonly stiffness: number
  private readonly dampingRatio: number

  constructor(initial: number, stiffness: number, dampingRatio: number) {
    this.value = initial
    this.stiffness = stiffness
    this.dampingRatio = dampingRatio
  }

  step(target: number, delta: number): number {
    // A long frame — a background tab, a stall — would otherwise integrate to
    // an explosion. Clamping degrades to a slower approach instead.
    const dt = Math.min(delta, 1 / 30)
    const damping = 2 * this.dampingRatio * Math.sqrt(this.stiffness)
    this.velocity +=
      (this.stiffness * (target - this.value) - damping * this.velocity) * dt
    this.value += this.velocity * dt
    return this.value
  }
}

/**
 * Tracks the cursor over the canvas, in normalised device coordinates.
 *
 * This deliberately does not use R3F's built-in `pointer`: that reports (0, 0)
 * until the first move, which is dead centre, so the hero would start out
 * behaving as though the cursor were parked on top of it. Presence is tracked
 * explicitly here, and losing the cursor — leaving the canvas, tabbing away —
 * is what returns the hero to its neutral pose.
 *
 * Nothing here captures drag or consumes events, so the scene can never be
 * orbited or dragged.
 */
export function usePointerState(): RefObject<PointerState> {
  const domElement = useThree((state) => state.gl.domElement)
  const pointer = useRef<PointerState>({
    x: 0,
    y: 0,
    active: false,
    dragging: false,
    dragX: 0,
    dragY: 0,
  })

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const bounds = domElement.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)

      if (pointer.current.dragging) {
        // Accumulated, not overwritten: several pointer events can arrive
        // between two frames, and dropping all but the last would lose motion.
        pointer.current.dragX += x - pointer.current.x
        pointer.current.dragY += y - pointer.current.y
      }

      pointer.current.x = x
      pointer.current.y = y
      pointer.current.active = true
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      pointer.current.dragging = true
      // Keeps the drag alive if the cursor slips outside the canvas mid-gesture.
      domElement.setPointerCapture?.(event.pointerId)
    }

    const onUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      pointer.current.dragging = false
      domElement.releasePointerCapture?.(event.pointerId)
    }

    const release = () => {
      pointer.current.active = false
      pointer.current.dragging = false
    }

    domElement.addEventListener('pointermove', onMove)
    domElement.addEventListener('pointerdown', onDown)
    domElement.addEventListener('pointerup', onUp)
    domElement.addEventListener('pointerleave', release)
    window.addEventListener('blur', release)
    return () => {
      domElement.removeEventListener('pointermove', onMove)
      domElement.removeEventListener('pointerdown', onDown)
      domElement.removeEventListener('pointerup', onUp)
      domElement.removeEventListener('pointerleave', release)
      window.removeEventListener('blur', release)
    }
  }, [domElement])

  return pointer
}
