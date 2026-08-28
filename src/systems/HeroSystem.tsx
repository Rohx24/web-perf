import { Suspense, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Group, Mesh, Vector3 } from 'three'

import { createGlassMaterial } from './GlassMaterial'
import { HeroController } from './HeroController'
import { HERO } from './heroConfig'
import { QUALITY } from '../perf/quality'

function CrystalLogo() {
  const { scene } = useGLTF(HERO.url)
  const gl = useThree((state) => state.gl)

  /**
   * One material instance for the whole logo, built once and then only ever
   * mutated. Nothing allocates per frame.
   */
  const material = useMemo(() => createGlassMaterial(), [])

  /**
   * The GLB, stood upright, recentred on its own bounds and scaled to the
   * configured height.
   *
   * `clone()` shares geometry by reference — no mesh data is copied or
   * regenerated — but gives us our own transform hierarchy and lets us swap
   * materials without writing back into drei's GLTF cache.
   *
   * Every imported material is replaced. The originals and their three
   * textures are never referenced, so they are never uploaded to the GPU.
   */
  const model = useMemo(() => {
    const wrapper = new Group()
    const instance = scene.clone(true)

    instance.rotation.set(...HERO.rotation)
    wrapper.add(instance)
    wrapper.updateMatrixWorld(true)

    const bounds = new Box3().setFromObject(wrapper)
    const size = bounds.getSize(new Vector3())
    const centre = bounds.getCenter(new Vector3())

    instance.position.sub(centre)
    const fit = size.y > 0 ? HERO.height / size.y : 1
    // Wider than it is tall relative to the source, which reads as a heavier,
    // more planted mark.
    wrapper.scale.set(fit * HERO.widthScale, fit, fit)

    instance.traverse((child) => {
      if ((child as Mesh).isMesh) {
        ;(child as Mesh).material = material
      }
    })

    return wrapper
  }, [scene, material])

  useEffect(() => {
    // Render the transmission pass at full resolution rather than the half-size
    // default, so the room stays sharp when seen through the block. This is the
    // first knob to turn back down if the frame budget gets tight — which is
    // exactly what the lower quality tiers do. Defaults to 1 (the original,
    // full-res) and only drops on a ?tier=/?transmission= test override.
    gl.transmissionResolutionScale = QUALITY.transmissionScale
  }, [gl])

  useEffect(() => {
    return () => {
      material.normalMap?.dispose()
      material.dispose()
    }
  }, [material])

  return (
    <HeroController material={material}>
      <primitive object={model} />
    </HeroController>
  )
}

/**
 * The hero logo system.
 *
 * Composition only: it loads the GLB, fits it, hands every mesh the one shared
 * glass material, and wraps the result in the controller that animates it.
 * Motion lives in HeroController, cursor tracking and spring maths in
 * InteractionController, the material in GlassMaterial.
 *
 * It reads no room, grid, panel or camera state, so the environment underneath
 * it is untouched.
 */
export function HeroSystem() {
  return (
    <Suspense fallback={null}>
      <CrystalLogo />
    </Suspense>
  )
}

useGLTF.preload(HERO.url)
