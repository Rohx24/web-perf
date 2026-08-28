import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
} from 'three'

import { SCROLL, cameraZ } from './scrollConfig'
import { scrollProgress } from './scrollProgress'

/**
 * A field of light streaks that stream past the camera as it crosses the wall.
 *
 * It exists for one job: to fill the frame with speed-light at the exact moment
 * the camera is *inside* the wall surface, so the cut from room to void is never
 * seen. The strength is tied to how close the camera is to the wall plane, so it
 * blooms on the way in and is gone by the time the corridor is clear.
 *
 * The streaks are parented to the camera each frame (position + orientation
 * copied), so they always sit dead ahead. They stream toward the camera in the
 * camera's own space, which is what reads as motion even though the field as a
 * whole rides along.
 *
 * Instanced: one draw call, no per-frame allocation, no shader to audit.
 */
export function WarpStreaks() {
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  const geometry = useMemo(() => new BoxGeometry(0.035, 0.035, 1), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(SCROLL.warp.colour),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )

  // Per-streak layout: a fixed angle and radius around the view axis, a length,
  // and a live position along the axis that streams toward the camera.
  const streaks = useMemo(() => {
    const { count, tubeRadius, reach, length } = SCROLL.warp
    return Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2
      const radius = tubeRadius * Math.sqrt(Math.random())
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: -1 - Math.random() * reach, // local −Z is straight ahead
        len: length * (0.5 + Math.random() * 0.5),
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const p = scrollProgress()
    const camZ = cameraZ(p)

    // Strength: 1 at the wall plane, 0 by `range` metres either side.
    const dist = Math.abs(camZ - SCROLL.warp.centreZ)
    const warp = 1 - MathUtils.clamp(dist / SCROLL.warp.range, 0, 1)
    const eased = warp * warp

    if (eased < 0.002) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    material.opacity = SCROLL.warp.brightness * eased

    // Ride the camera.
    mesh.position.copy(camera.position)
    mesh.quaternion.copy(camera.quaternion)

    const dt = Math.min(delta, 1 / 30)
    const speed = 70 * dt
    const { reach } = SCROLL.warp

    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i]
      s.z += speed // stream toward the camera (−Z → 0)
      if (s.z > -0.5) s.z -= reach - 0.5

      dummy.position.set(s.x, s.y, s.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, s.len * eased)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, SCROLL.warp.count]}
      frustumCulled={false}
      visible={false}
    />
  )
}
