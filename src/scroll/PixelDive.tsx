import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

import { scrollProgress } from './scrollProgress'
import { warpStrength } from './useScrollSequence'
import { WALL_TINT } from '../systems/wallTint'

/**
 * The wall crossing, as a dive *through the pixels* — the replacement for the
 * old scanline glitch.
 *
 * As the camera reaches the LED wall, a lattice of dots in front of it swells
 * and defocuses into big soft orbs (bokeh, the way a lens racks focus as it gets
 * impossibly close to a panel), the frame floods with light, and the camera
 * slips between the dots into the dark void behind the screen. Two camera-
 * parented additive quads — a growing dot field and a broad glow — so it is
 * cheap, needs no post pipeline, and touches nothing in the hero. It rides the
 * same wall-crossing envelope as the warp streaks, so the two read as one beat.
 */

const WHITE = new Color(1, 1, 1)

/** Dot count across the quad at the edges of the dive (small, lattice-like) and
 *  at its peak (a few huge orbs). Interpolated by the crossing strength. */
const DOTS_FAR = 26
const DOTS_NEAR = 3.2

/** One soft round emitter, tiled to make the lattice. The transparent margin
 *  leaves gaps between dots so they read as discrete pixels, not a fill. */
function makeDotTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.22, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.28)')
  grad.addColorStop(0.82, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  return t
}

/** A broad soft glow — the flood of light at the moment of crossing. */
function makeBloomTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

export function PixelDive() {
  const camera = useThree((state) => state.camera)
  const dotsRef = useRef<Mesh>(null)
  const bloomRef = useRef<Mesh>(null)

  const dotTexture = useMemo(() => makeDotTexture(), [])
  const bloomTexture = useMemo(() => makeBloomTexture(), [])

  const dotMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        map: dotTexture ?? undefined,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [dotTexture],
  )
  const bloomMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        map: bloomTexture ?? undefined,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [bloomTexture],
  )

  const tint = useMemo(() => new Color(), [])

  useEffect(() => {
    return () => {
      dotMaterial.dispose()
      bloomMaterial.dispose()
      dotTexture?.dispose()
      bloomTexture?.dispose()
    }
  }, [dotMaterial, bloomMaterial, dotTexture, bloomTexture])

  useFrame(() => {
    const dots = dotsRef.current
    const bloom = bloomRef.current
    if (!dots || !bloom) return

    // 0 → 1 → 0 as the camera crosses the wall plane — the same envelope the
    // warp streaks use, so the pixels and the speed-light peak together.
    const near = warpStrength(scrollProgress())
    if (near <= 0.002) {
      dots.visible = false
      bloom.visible = false
      return
    }
    dots.visible = true
    bloom.visible = true

    // Both quads ride just ahead of the camera, filling the view.
    dots.position.copy(camera.position)
    dots.quaternion.copy(camera.quaternion)
    dots.translateZ(-0.6)
    bloom.position.copy(camera.position)
    bloom.quaternion.copy(camera.quaternion)
    bloom.translateZ(-0.5)

    // The dots grow — fewer, bigger orbs — as the crossing peaks, and drift with
    // the scroll so they stream past rather than sitting still.
    if (dotTexture) {
      const count = DOTS_FAR + (DOTS_NEAR - DOTS_FAR) * near
      dotTexture.repeat.set(count, count * 0.62)
      const drift = scrollProgress() * 60
      dotTexture.offset.set(drift * 0.1, drift)
    }

    // Colour: the wall's own live tint, flaring to white as the light floods in.
    tint.copy(WALL_TINT).lerp(WHITE, near * near)
    dotMaterial.color.copy(tint)
    dotMaterial.opacity = near

    bloomMaterial.color.copy(tint)
    bloomMaterial.opacity = near * near * 0.9
  })

  return (
    <>
      <mesh ref={dotsRef} renderOrder={996} frustumCulled={false} visible={false}>
        <planeGeometry args={[4.4, 2.8]} />
        <primitive object={dotMaterial} attach="material" />
      </mesh>
      <mesh ref={bloomRef} renderOrder={997} frustumCulled={false} visible={false}>
        <planeGeometry args={[5, 3.2]} />
        <primitive object={bloomMaterial} attach="material" />
      </mesh>
    </>
  )
}
