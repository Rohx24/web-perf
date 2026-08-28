import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

import { SCROLL } from './scrollConfig'
import { scrollProgress } from './scrollProgress'
import { glitchStrength } from './useScrollSequence'

/**
 * The screen-tear "combobulation" over the dive.
 *
 * A full-frame additive quad parented to the camera, textured with RGB scanline
 * bars, whose opacity peaks mid-dive and whose rows jitter each frame. It rides
 * the camera and draws into the same pass as the scene (no separate post
 * pipeline, so it never fights the cursor-lens composite), and it is invisible
 * outside the dive because its opacity is the glitch strength.
 */
function makeTearTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const W = 8
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) return null
  g.clearRect(0, 0, W, H)
  // RGB scanline bars: mostly dark, occasional bright coloured tears.
  const cols = ['#ff2d55', '#2dff8a', '#2d9bff', '#ffffff']
  for (let y = 0; y < H; y++) {
    const roll = Math.random()
    if (roll > 0.86) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0]
      g.globalAlpha = 0.5 + Math.random() * 0.5
    } else {
      g.fillStyle = '#0a0a12'
      g.globalAlpha = 0.12
    }
    g.fillRect(0, y, W, 1)
  }
  g.globalAlpha = 1
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

export function CombobulationFlash() {
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<Mesh>(null)

  const texture = useMemo(() => makeTearTexture(), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: texture ?? undefined,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [texture],
  )

  useEffect(() => {
    return () => {
      material.dispose()
      texture?.dispose()
    }
  }, [material, texture])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const g = glitchStrength(scrollProgress())
    if (g <= 0.002) {
      mesh.visible = false
      return
    }
    mesh.visible = true

    // Ride the camera, sitting just ahead and covering the frustum.
    mesh.position.copy(camera.position)
    mesh.quaternion.copy(camera.quaternion)
    mesh.translateZ(-0.5)

    if (texture) {
      // Jitter the rows hard while active.
      texture.offset.y = Math.random()
      texture.repeat.set(1, 2 + Math.floor(Math.random() * 3))
      texture.needsUpdate = false
    }
    material.opacity = g * SCROLL.glitch.strength * 0.9
  })

  return (
    <mesh ref={meshRef} renderOrder={999} frustumCulled={false} visible={false}>
      <planeGeometry args={[3, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
