import { Suspense, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, RenderTexture, useGLTF } from '@react-three/drei'
import { Box3, Group, Mesh, Quaternion, Vector3 } from 'three'

import { LedWall } from '../systems/LedWall'
import { VIEWER } from '../scene/roomConfig'

const MODEL = '/crt/crt-opt.glb'

// Tilt (on its side, leaning) — tune to taste.
const TILT = { x: 0.04, y: Math.PI, z: 0.5 }

/** The CRT, tilted, with the real LED hero rendered onto its screen. */
function Crt () {
  const { scene } = useGLTF(MODEL)

  const { holder, sPos, sQuat, sW, sH } = useMemo(() => {
    const root = scene.clone(true)
    const box0 = new Box3().setFromObject(root)
    const size = box0.getSize(new Vector3())
    const centre = box0.getCenter(new Vector3())
    root.position.sub(centre)
    const fit = 1.7 / Math.max(size.x, size.y, size.z)
    const holder = new Group()
    holder.add(root)
    holder.scale.setScalar(fit)
    holder.updateMatrixWorld(true)

    const sPos = new Vector3()
    const sQuat = new Quaternion()
    let sW = 1
    let sH = 0.75
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const n = `${m.name} ${(m.material as { name?: string })?.name ?? ''}`.toLowerCase()
      if (/screen|glass|display|monitor/.test(n)) {
        m.visible = false // hide the model's own screen; we overlay the LED one
        const bb = new Box3().setFromObject(m) // in holder's parent (group) space
        bb.getCenter(sPos)
        const s = bb.getSize(new Vector3())
        sW = s.x
        sH = s.y
        m.getWorldQuaternion(sQuat)
      }
    })
    return { holder, sPos, sQuat, sW, sH }
  }, [scene])

  return (
    <group rotation={[TILT.x, TILT.y, TILT.z]} position={[0, -0.05, 0]}>
      <primitive object={holder} />
      {/* The LED hero, rendered to a texture and mapped onto the screen. */}
      <mesh position={sPos} quaternion={sQuat}>
        <planeGeometry args={[sW * 0.98, sH * 0.98]} />
        <meshBasicMaterial toneMapped={false}>
          <RenderTexture attach="map" width={640} height={480} anisotropy={4}>
            <PerspectiveCamera
              makeDefault
              fov={VIEWER.fov}
              near={VIEWER.near}
              far={VIEWER.far}
              position={VIEWER.position}
              onUpdate={(c) => c.lookAt(VIEWER.target[0], VIEWER.target[1], VIEWER.target[2])}
            />
            <color attach="background" args={['#000000']} />
            <ambientLight intensity={0.45} />
            <directionalLight position={[4, 8, 10]} intensity={1.4} />
            <LedWall />
          </RenderTexture>
        </meshBasicMaterial>
      </mesh>
    </group>
  )
}

/** Very slight idle camera drift so the tilted CRT reads as 3D. No transition. */
function Rig () {
  const camera = useThree((s) => s.camera)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    camera.position.set(0.15 + Math.sin(t * 0.14) * 0.12, 0.28 + Math.sin(t * 0.2) * 0.05, 4.0)
    camera.lookAt(0.05, -0.05, 0)
  })
  return null
}

/**
 * The boot / start screen. A persistent, tilted CRT in a dark Pink-Noise-toned
 * room, with the real LED hero playing on its screen. No auto-transition — it
 * stays until dismissed (purpose TBD).
 */
export function BootScreen () {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#0a0612' }}>
      <Canvas
        flat
        dpr={[1, 1.75]}
        gl={{ antialias: true }}
        camera={{ fov: 42, near: 0.1, far: 100, position: [0.15, 0.28, 4.0] }}
        onCreated={({ gl }) => gl.setClearColor(0x0a0612, 1)}
      >
        {/* Pink-Noise palette: dark violet room, magenta neon accent. */}
        <ambientLight intensity={0.5} color={0x6a4b8a} />
        <hemisphereLight args={[0x5b3f7a, 0x140a1e, 0.6]} />
        <directionalLight position={[4, 5, 6]} intensity={0.7} color={0xb69bff} />
        <pointLight position={[-1.6, 0.4, 1.4]} intensity={6} distance={7} decay={2} color={0xff3d9a} />
        <pointLight position={[2.0, 1.0, 1.0]} intensity={3} distance={6} decay={2} color={0x7a4bff} />
        <Rig />
        <Suspense fallback={null}>
          <Crt />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL)
