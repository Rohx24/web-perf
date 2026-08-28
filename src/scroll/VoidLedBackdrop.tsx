import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  CanvasTexture,
  Color,
  CylinderGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

import { PROJECTS } from './projects'
import { SCROLL } from './scrollConfig'
import { scrollProgress } from './scrollProgress'

/**
 * The project void's backdrop — deliberately *not* the hero LED wall.
 *
 * A single open tube the camera rides down the bore of, wrapped in a faint panel
 * texture. There is no dot matrix (the expensive part of the real wall); instead
 * the whole tube is tinted one colour that flashes between the projects' accents
 * as they pass, with a slow brightness pulse. One mesh, one draw call, a plain
 * basic material — cheap enough to leave running the whole scroll.
 */
function makePanelTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')
  if (!g) return null
  g.clearRect(0, 0, S, S)
  // A grid of faint rounded panels, white so the material colour tints them.
  const cell = 64
  const gap = 8
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const a = 0.16 + 0.14 * Math.random()
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
      const r = 8
      const px = x + gap / 2
      const py = y + gap / 2
      const w = cell - gap
      const h = cell - gap
      g.beginPath()
      g.moveTo(px + r, py)
      g.arcTo(px + w, py, px + w, py + h, r)
      g.arcTo(px + w, py + h, px, py + h, r)
      g.arcTo(px, py + h, px, py, r)
      g.arcTo(px, py, px + w, py, r)
      g.closePath()
      g.fill()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(18, 10)
  return texture
}

const ACCENTS = PROJECTS.map((p) => new Color(p.accent))

export function VoidLedBackdrop() {
  const meshRef = useRef<Mesh>(null)

  const texture = useMemo(() => makePanelTexture(), [])

  // A tube along Z, spanning the corridor the camera flies down in the void.
  const geometry = useMemo(() => {
    const nearZ = -8
    const farZ = SCROLL.camera.voidEndZ - 10
    const length = Math.abs(farZ - nearZ)
    const geo = new CylinderGeometry(SCROLL.void.radius, SCROLL.void.radius, length, 96, 1, true)
    // Stand the cylinder's axis along Z, then centre it down the corridor.
    geo.rotateX(Math.PI / 2)
    geo.translate(0, SCROLL.camera.voidY, (nearZ + farZ) / 2)
    return geo
  }, [])

  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: texture ?? undefined,
        color: new Color('#000000'),
        transparent: true,
        opacity: 0,
        side: BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    [texture],
  )

  const tint = useMemo(() => new Color(), [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
      texture?.dispose()
    }
  }, [geometry, material, texture])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    const s = scrollProgress()

    // Present only through the void: in after the dive, out for the outro.
    const fadeIn = MathUtils.clamp((s - SCROLL.void.fadeInS) / 0.06, 0, 1)
    const fadeOut = 1 - MathUtils.clamp((s - SCROLL.void.fadeOutS) / 0.06, 0, 1)
    const present = fadeIn * fadeOut
    if (present <= 0.001) {
      // Already invisible (opacity 0). Drop it from the draw entirely — a
      // transparent, unculled tube otherwise costs a draw call every hero frame
      // for nothing. Identical pixels, one fewer draw call.
      material.opacity = 0
      mesh.visible = false
      return
    }
    mesh.visible = true

    // Which accent is current — flash between them as cards pass.
    const { galleryStart, galleryEnd } = SCROLL.phase
    const gp = MathUtils.clamp((s - galleryStart) / (galleryEnd - galleryStart), 0, 1)
    const f = gp * (ACCENTS.length - 1)
    const i = Math.min(ACCENTS.length - 2, Math.floor(f))
    tint.copy(ACCENTS[i]).lerp(ACCENTS[i + 1], f - i)

    // Slow brightness pulse, like a screen breathing.
    const t = state.clock.elapsedTime
    const pulse = 0.8 + 0.2 * Math.sin(t * 1.1)

    material.color.copy(tint).multiplyScalar(SCROLL.void.brightness * pulse)
    material.opacity = present
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} visible={false} />
}
