import { Suspense, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  Box3,
  FramebufferTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import type { MeshPhysicalMaterial } from 'three'

import { createGlassMaterial } from './GlassMaterial'
import { ScreenGlassMaterial } from './ScreenGlassMaterial'
import { HeroController } from './HeroController'
import { HERO } from './heroConfig'
import { QUALITY } from '../perf/quality'

/**
 * `?glass=screen` swaps the mark's transmission for screen-space refraction.
 *
 * Not a quality tier and not adaptive — a straight A/B, so the two can be
 * compared on the same machine in the same minute. Default is unchanged.
 */
const SCREEN_GLASS =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('glass') === 'screen'

function CrystalLogo() {
  const { scene } = useGLTF(HERO.url)
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const viewportDpr = useThree((state) => state.viewport.dpr)

  /**
   * One material instance for the whole logo, built once and then only ever
   * mutated. Nothing allocates per frame.
   */
  const material = useMemo(
    () => (SCREEN_GLASS ? new ScreenGlassMaterial() : createGlassMaterial()),
    [],
  )

  /* The capture.
   *
   * A zero-size mesh drawn just before the mark, whose only job is to copy the
   * frame so far into a texture the mark can sample. This is Alche's sentinel:
   * one blit, where transmission would have re-rendered the entire scene.
   *
   * It has to be in the transparent queue with a renderOrder below the mark's,
   * so the opaque room, wall and panels are already on the buffer when it runs
   * and the mark itself is not. */
  const capture = useMemo(() => {
    if (!SCREEN_GLASS) return null
    const texture = new FramebufferTexture(2, 2)
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    const sentinel = new Mesh(
      new PlaneGeometry(0, 0),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    )
    sentinel.frustumCulled = false
    /* First in the transparent queue, which begins only after every opaque
       object has drawn — so the capture holds the room, wall, panels and grid,
       and the mark keeps its own renderOrder rather than being forced above the
       project panes (renderOrder 12) and floating in front of them. Alche use
       100 because their scene has nothing transparent below the logo; ours
       does. */
    sentinel.renderOrder = -1000
    sentinel.onBeforeRender = (renderer) => {
      renderer.copyFramebufferToTexture(texture)
    }
    return { texture, sentinel }
  }, [])

  useEffect(() => {
    if (!capture) return
    const w = Math.max(2, Math.round(size.width * viewportDpr))
    const h = Math.max(2, Math.round(size.height * viewportDpr))
    // FramebufferTexture copies 1:1, so it has to match the drawing buffer
    capture.texture.image = { width: w, height: h } as unknown as HTMLImageElement
    capture.texture.needsUpdate = true
    ;(material as ScreenGlassMaterial).setSceneTexture(capture.texture, w, h)
  }, [capture, material, size, viewportDpr])

  useEffect(() => () => {
    capture?.texture.dispose()
    capture?.sentinel.geometry.dispose()
    ;(capture?.sentinel.material as MeshBasicMaterial | undefined)?.dispose()
  }, [capture])

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
    // Nothing to configure when the transmission pass is not running at all.
    if (SCREEN_GLASS) return
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
    <HeroController material={material as unknown as MeshPhysicalMaterial}>
      {capture ? <primitive object={capture.sentinel} /> : null}
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
