import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three'

import { CURSOR_DISTORTION } from './cursorDistortionConfig'
import { cursorLensFragmentShader, cursorLensVertexShader } from './cursorLensShader'
import { Spring, usePointerState } from './InteractionController'

export type CursorDistortionSystemProps = {
  /** Lens radius in CSS pixels. */
  radius?: number
  /** Peak radial displacement in CSS pixels. */
  strength?: number
  /** Peak magnification at the lens centre, e.g. 1.03. */
  magnification?: number
  /** Radial mask shaping exponent. */
  falloff?: number
}

/**
 * An invisible optical lens that follows the cursor.
 *
 * The scene is rendered into an offscreen target and then drawn to the canvas
 * through a shader that displaces its sample position inside a small radius
 * around the cursor. Nothing on screen is added or coloured — only resampled —
 * so the content behind the cursor bends while everything outside the radius is
 * bit-for-bit the same image it would otherwise have been.
 *
 * Because this is the last thing drawn, it must own the render loop: a
 * `useFrame` priority above zero takes automatic rendering away from R3F. Every
 * other system's frame callback still runs first, at its own priority, exactly
 * as before.
 *
 * Nothing here touches the DOM, and no HTML is scaled or transformed.
 */
export function CursorDistortionSystem({
  radius = CURSOR_DISTORTION.radius,
  strength = CURSOR_DISTORTION.strength,
  magnification = CURSOR_DISTORTION.magnification,
  falloff = CURSOR_DISTORTION.falloff,
}: CursorDistortionSystemProps = {}) {
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)
  const pointer = usePointerState()

  /** Smoothed head of the lens, in UV space. */
  const centre = useRef(new Vector2(0.5, 0.5))
  /** Tail of the lens. Collapses onto the head when the cursor is at rest. */
  const trail = useRef(new Vector2(0.5, 0.5))
  /** Last known travel direction, so a decaying trail keeps pointing the right way. */
  const heading = useRef(new Vector2(0, 0))
  /** Smoothed cursor speed, in CSS pixels per second. */
  const speed = useRef(0)
  const gain = useMemo(
    () =>
      new Spring(
        0,
        CURSOR_DISTORTION.response.stiffness,
        CURSOR_DISTORTION.response.dampingRatio,
      ),
    [],
  )

  const target = useMemo(() => {
    const renderTarget = new WebGLRenderTarget(1, 1, {
      // No multisampling. A multisampled offscreen target, resolved every frame
      // while the glass logo also drives a transmission render into it, produced
      // a per-frame inconsistency that strobed the whole screen the moment the
      // scene moved (cursor parallax). The dots are a mipmapped texture now, so
      // they do not need MSAA; grid lines are a touch softer, which is a fine
      // trade for killing the flicker.
      samples: 0,
    })
    // The scene arrives here in linear space — three ignores a plain render
    // target's declared colour space and always writes linear — so the target
    // is labelled honestly and the lens pass does the sRGB transfer itself.
    renderTarget.texture.colorSpace = LinearSRGBColorSpace
    return renderTarget
  }, [])

  const pass = useMemo(() => {
    const material = new ShaderMaterial({
      vertexShader: cursorLensVertexShader,
      fragmentShader: cursorLensFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: target.texture },
        uCursor: { value: new Vector2(0.5, 0.5) },
        uTrail: { value: new Vector2(0.5, 0.5) },
        uResolution: { value: new Vector2(1, 1) },
        uRadius: { value: 0 },
        uStrength: { value: 0 },
        uMagnify: { value: 0 },
        uFalloff: { value: 1 },
        uTaper: { value: 0 },
        uAmount: { value: 0 },
      },
    })

    const scene = new Scene()
    const quad = new Mesh(new PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    scene.add(quad)

    return {
      scene,
      camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      material,
      quad,
    }
  }, [target])

  useEffect(() => {
    const width = Math.max(1, Math.round(size.width * dpr))
    const height = Math.max(1, Math.round(size.height * dpr))
    target.setSize(width, height)
    pass.material.uniforms.uResolution.value.set(width, height)
  }, [target, pass, size.width, size.height, dpr])

  useEffect(() => {
    return () => {
      target.dispose()
      pass.quad.geometry.dispose()
      pass.material.dispose()
    }
  }, [target, pass])

  // Priority 1: this callback runs after every default-priority system has
  // updated, and takes over rendering from R3F.
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const { active, x, y } = pointer.current

    const previousX = centre.current.x
    const previousY = centre.current.y

    if (active) {
      // NDC to UV. Exponential smoothing is frame-rate independent, and fast
      // enough that the head of the lens never visibly lags the pointer.
      const follow = 1 - Math.exp(-CURSOR_DISTORTION.response.followRate * dt)
      centre.current.x += ((x + 1) / 2 - centre.current.x) * follow
      centre.current.y += ((y + 1) / 2 - centre.current.y) * follow
    }

    const amount = gain.step(active ? 1 : 0, dt)

    // Speed in CSS pixels per second, measured from how far the smoothed head
    // moved this frame, then smoothed again so the trail breathes rather than
    // flickering with every jittery pointer sample.
    const movedX = (centre.current.x - previousX) * size.width
    const movedY = (centre.current.y - previousY) * size.height
    const instant = Math.hypot(movedX, movedY) / Math.max(dt, 1 / 240)
    const smoothing =
      1 - Math.exp(-CURSOR_DISTORTION.trail.speedSmoothing * dt)
    speed.current += (instant - speed.current) * smoothing

    // The tail sits back along the direction just travelled. With no movement
    // there is no direction and no length, so the capsule collapses to a disc.
    const length = active
      ? Math.min(
          speed.current * CURSOR_DISTORTION.trail.lengthPerSpeed,
          CURSOR_DISTORTION.trail.maxLength,
        )
      : 0
    const travelled = Math.hypot(movedX, movedY)
    if (travelled > 0.0001 && length > 0.5) {
      const unitX = movedX / travelled
      const unitY = movedY / travelled
      trail.current.set(
        centre.current.x - (unitX * length) / size.width,
        centre.current.y - (unitY * length) / size.height,
      )
      heading.current.set(unitX, unitY)
    } else if (length > 0.5) {
      trail.current.set(
        centre.current.x - (heading.current.x * length) / size.width,
        centre.current.y - (heading.current.y * length) / size.height,
      )
    } else {
      trail.current.copy(centre.current)
    }

    const uniforms = pass.material.uniforms
    uniforms.uCursor.value.copy(centre.current)
    uniforms.uTrail.value.copy(trail.current)
    uniforms.uRadius.value = radius * dpr
    uniforms.uStrength.value = strength * dpr
    // mix(uv, nearest, k) magnifies by 1 / (1 - k).
    uniforms.uMagnify.value = 1 - 1 / Math.max(magnification, 1)
    uniforms.uFalloff.value = falloff
    uniforms.uTaper.value = CURSOR_DISTORTION.trail.taper
    uniforms.uAmount.value = amount

    state.gl.setRenderTarget(target)
    state.gl.clear()
    state.gl.render(state.scene, state.camera)
    state.gl.setRenderTarget(null)
    state.gl.render(pass.scene, pass.camera)
  }, 1)

  // The pass renders itself; there is nothing to add to the scene graph.
  return null
}
