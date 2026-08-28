import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, MathUtils, MeshPhysicalMaterial, Vector3 } from 'three'

import { HERO } from './heroConfig'
import { Spring, usePointerState } from './InteractionController'
import { WALL_TINT } from './wallTint'
import { scrollProgress } from '../scroll/scrollProgress'
import { SCROLL } from '../scroll/scrollConfig'
import { LIVE } from '../dev/live'
import { registerControls } from '../dev/controls'

const TAU = Math.PI * 2

type HeroControllerProps = {
  /** The shared glass material, mutated in place — never replaced. */
  material: MeshPhysicalMaterial
  children: ReactNode
}

/**
 * Drives everything that moves: the idle float, the turn toward the cursor, and
 * how hard the glass bends light as the cursor nears it.
 *
 * Two nested groups keep the concerns apart — the outer one carries position
 * and the idle drift, the inner one carries rotation — so neither animation can
 * interfere with the other.
 *
 * The turn is capped hard at the configured yaw and pitch, and driven purely by
 * cursor *position*: there is no drag, no pointer capture and no accumulated
 * rotation, so the scene can never be orbited and the block can never spin.
 */
export function HeroController({ material, children }: HeroControllerProps) {
  const camera = useThree((state) => state.camera)
  const pointer = usePointerState()

  const root = useRef<Group>(null)
  const pose = useRef<Group>(null)
  /** Carries the model's base orientation, INSIDE pose — so pose's scroll spin
   *  turntables the already-upright model around world-vertical instead of
   *  tumbling it around a tilted local axis. */
  const orient = useRef<Group>(null)
  const worldPosition = useMemo(() => new Vector3(), [])

  /** Where the user has dragged the block to. Held, then unwound. */
  const dragged = useRef({ yaw: 0, pitch: 0 })
  /** Seconds since the drag ended; drives the delayed return to neutral. */
  const sinceRelease = useRef(0)

  const springs = useMemo(() => {
    const { pose: poseConfig, refraction, hover } = HERO.cursor
    const { drag } = HERO
    return {
      yaw: new Spring(0, poseConfig.stiffness, poseConfig.dampingRatio),
      pitch: new Spring(0, poseConfig.stiffness, poseConfig.dampingRatio),
      refraction: new Spring(0, refraction.stiffness, refraction.dampingRatio),
      hover: new Spring(0, hover.stiffness, hover.dampingRatio),
      dragYaw: new Spring(0, drag.stiffness, drag.dampingRatio),
      dragPitch: new Spring(0, drag.stiffness, drag.dampingRatio),
    }
  }, [])

  // Live size + orientation sliders for the hero GLB (main control panel).
  useEffect(() => {
    const h = LIVE.hero
    const P = Math.PI
    return registerControls([
      { group: 'hero · model', label: 'size', min: 0.2, max: 3, step: 0.01, get: () => h.size, set: (v) => { h.size = v } },
      { group: 'hero · model', label: 'rot x', min: -P, max: P, step: 0.01, get: () => h.rotX, set: (v) => { h.rotX = v } },
      { group: 'hero · model', label: 'rot y', min: -P, max: P, step: 0.01, get: () => h.rotY, set: (v) => { h.rotY = v } },
      { group: 'hero · model', label: 'rot z', min: -P, max: P, step: 0.01, get: () => h.rotZ, set: (v) => { h.rotZ = v } },
      // Glass "texture" — dial the alche-style iridescent look by eye. These are
      // the material props HeroController does NOT overwrite per frame, so they
      // hold. (thickness/ior/waviness/envMap are cursor-driven, so not here.)
      { group: 'hero · glass', label: 'roughness', min: 0, max: 0.5, step: 0.005, get: () => material.roughness, set: (v) => { material.roughness = v } },
      { group: 'hero · glass', label: 'metalness', min: 0, max: 1, step: 0.01, get: () => material.metalness, set: (v) => { material.metalness = v } },
      { group: 'hero · glass', label: 'iridescence', min: 0, max: 1, step: 0.01, get: () => material.iridescence, set: (v) => { material.iridescence = v } },
      { group: 'hero · glass', label: 'irid IOR', min: 1, max: 2.4, step: 0.01, get: () => material.iridescenceIOR, set: (v) => { material.iridescenceIOR = v } },
      { group: 'hero · glass', label: 'irid thin', min: 0, max: 1000, step: 10, get: () => material.iridescenceThicknessRange[0], set: (v) => { material.iridescenceThicknessRange[0] = v } },
      { group: 'hero · glass', label: 'irid thick', min: 100, max: 1600, step: 10, get: () => material.iridescenceThicknessRange[1], set: (v) => { material.iridescenceThicknessRange[1] = v } },
      { group: 'hero · glass', label: 'clearcoat', min: 0, max: 1, step: 0.01, get: () => material.clearcoat, set: (v) => { material.clearcoat = v } },
    ])
  }, [])

  useFrame((state, delta) => {
    if (!root.current || !pose.current) return

    const time = state.clock.elapsedTime
    const { idle, cursor, glass } = HERO
    const { active, x: pointerX, y: pointerY } = pointer.current

    // --- Hand drag: consume the movement collected since the last frame ------
    const { drag } = HERO
    if (pointer.current.dragX !== 0 || pointer.current.dragY !== 0) {
      dragged.current.yaw += pointer.current.dragX * drag.yawPerUnit
      dragged.current.pitch += -pointer.current.dragY * drag.pitchPerUnit
      dragged.current.pitch = clamp(
        dragged.current.pitch,
        -drag.maxPitch,
        drag.maxPitch,
      )
      // Zeroed on read, so the same movement is never applied twice.
      pointer.current.dragX = 0
      pointer.current.dragY = 0
    }

    if (pointer.current.dragging) {
      sinceRelease.current = 0
    } else {
      sinceRelease.current += delta
      if (sinceRelease.current > drag.returnDelay) {
        // Unwind the held rotation itself rather than snapping the spring's
        // target, so the block drifts home under the same damping that carried
        // it out and never lurches.
        const decay = Math.exp(-drag.returnRate * delta)
        dragged.current.yaw *= decay
        dragged.current.pitch *= decay
      }
    }

    // --- Idle: breathing only, never a spin -------------------------------
    const floatY =
      Math.sin((time / idle.floatSeconds) * Math.PI * 2) * idle.floatAmplitude

    // Scroll-out: at the hero (scroll 0) the logo is 100% untouched. Past 0.08,
    // as the works section is entered, it eases a little further back along Z so
    // it clears the incoming project cards — but keeps its full size and its idle
    // float. Only Z is hooked; the hero's material, lighting, size and scroll-0
    // pose are unchanged.
    const outK = MathUtils.smoothstep(scrollProgress(), 0.08, 0.3)
    root.current.position.x = HERO.position[0]
    root.current.position.y = HERO.position[1] + floatY
    root.current.position.z = HERO.position[2] - outK * 2.2
    // Live size multiplier (control panel "hero · model"), on top of the GLB's
    // own fit scale — so a swapped model can be resized by eye.
    root.current.scale.setScalar(LIVE.hero.size)

    const idleYaw =
      Math.sin((time / idle.tiltSeconds) * Math.PI * 2) * idle.tiltAmplitude
    const idlePitch =
      Math.cos((time / (idle.tiltSeconds * 1.37)) * Math.PI * 2) *
      idle.tiltAmplitude *
      0.6

    // --- Where the cursor is, relative to the hero on screen ---------------
    root.current.getWorldPosition(worldPosition)
    const projected = worldPosition.project(camera)

    // Targets are zero whenever the cursor is gone, so the same spring that
    // carries the block out also carries it home.
    let yawTarget = 0
    let pitchTarget = 0
    let refractionTarget = 0
    let hoverTarget = 0

    if (active) {
      yawTarget = clamp(pointerX, -1, 1) * cursor.pose.maxYaw
      pitchTarget = -clamp(pointerY, -1, 1) * cursor.pose.maxPitch

      const distance = Math.hypot(pointerX - projected.x, pointerY - projected.y)

      const nearness = Math.max(0, 1 - distance / cursor.refraction.radius)
      // Squared, so the response builds toward the block rather than linearly.
      refractionTarget = nearness * nearness

      const over = Math.max(0, 1 - distance / cursor.hover.radius)
      hoverTarget = over * over
    }

    const yaw = springs.yaw.step(yawTarget, delta)
    const pitch = springs.pitch.step(pitchTarget, delta)
    const amount = springs.refraction.step(refractionTarget, delta)
    const hovered = springs.hover.step(hoverTarget, delta)
    const dragYaw = springs.dragYaw.step(dragged.current.yaw, delta)
    const dragPitch = springs.dragPitch.step(dragged.current.pitch, delta)

    // The backbone: a slow spin driven by scroll, so as the projects spiral up
    // around it the logo turns with them. Idle breathing and the cursor lean
    // still ride on top; the drag offset unwinds as before.
    const spin = scrollProgress() * SCROLL.gallery.spinTurns * TAU
    // pose = the turntable: idle breathe, cursor lean and the scroll spin, all
    // around world axes. The base orientation lives on the inner `orient` group
    // (below), so this spin turns the upright model rather than tumbling it.
    pose.current.rotation.y = idleYaw + yaw + dragYaw + spin
    pose.current.rotation.x = idlePitch + pitch + dragPitch
    // Base orientation of the swapped GLB (control panel "hero · model").
    if (orient.current) {
      orient.current.rotation.set(LIVE.hero.rotX, LIVE.hero.rotY, LIVE.hero.rotZ)
    }

    // --- The cursor's real work is optical, not physical -------------------
    // Mutating numbers on the one shared material: no allocation, no shader
    // recompile, nothing rebuilt per frame.
    const { refraction, hover } = cursor
    material.thickness =
      glass.thickness + refraction.thicknessGain * amount + hover.thicknessGain * hovered
    material.ior = glass.ior + refraction.iorGain * amount + hover.iorGain * hovered
    material.envMapIntensity =
      glass.envMapIntensity *
      (1 + refraction.reflectionGain * amount + hover.reflectionGain * hovered)
    const waviness =
      glass.waviness + refraction.wavinessGain * amount + hover.wavinessGain * hovered
    material.normalScale.set(waviness, waviness)

    // The room, staining the block. The illumination system writes this from the
    // same ramp the wall is displaying, so as the panels drift through the
    // palette the crystal's body colour goes with them — the logo is never given
    // a colour of its own to fight the room with.
    material.attenuationColor.copy(WALL_TINT)
    material.sheenColor.copy(WALL_TINT)
  })

  return (
    <group ref={root} position={HERO.position}>
      <group ref={pose}>
        <group ref={orient}>{children}</group>
      </group>
    </group>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
