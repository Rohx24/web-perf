import { MathUtils } from 'three'

import { SCROLL, cameraZ } from './scrollConfig'
import { scrollProgress } from './scrollProgress'

/**
 * Small helpers over the shared scroll value. These are plain functions, called
 * from inside `useFrame`/rAF loops — not React hooks — so nothing here triggers
 * a re-render. `useScrollSequence` is a thin hook that just hands them back
 * together, so a component can pull "the sequence" in one line.
 */

export type ScrollSequence = {
  /** Live scroll position, 0…1. */
  s(): number
  /** Camera Z for the current scroll. */
  cameraZ(): number
  /** Combobulation glitch strength, 0…1, peaked mid-dive. */
  glitch(): number
  /** Warp-streak strength, tied to the camera crossing the wall. */
  warp(): number
  /** How far into the outro we are, 0…1. */
  outro(): number
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function glitchStrength(s: number): number {
  const { centreS, width, strength } = SCROLL.glitch
  const d = Math.abs(s - centreS)
  return strength * (1 - MathUtils.clamp(d / width, 0, 1)) ** 1.5
}

export function warpStrength(s: number): number {
  const camZ = cameraZ(s)
  const d = Math.abs(camZ - SCROLL.warp.centreZ)
  const w = 1 - MathUtils.clamp(d / SCROLL.warp.range, 0, 1)
  return w * w
}

export function outroProgress(s: number): number {
  return smoothstep(SCROLL.phase.outroStart, 1, s)
}

export const sequence: ScrollSequence = {
  s: scrollProgress,
  cameraZ: () => cameraZ(scrollProgress()),
  glitch: () => glitchStrength(scrollProgress()),
  warp: () => warpStrength(scrollProgress()),
  outro: () => outroProgress(scrollProgress()),
}

export function useScrollSequence(): ScrollSequence {
  return sequence
}
