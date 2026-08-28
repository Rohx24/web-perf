import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { AdditiveBlending, Color, MeshBasicMaterial, type Group, type Mesh } from 'three'

import { registerControls } from '../dev/controls'
import { WORDMARK } from './wordmarkConfig'
import { usePointerState } from './InteractionController'
import { scrollProgress } from '../scroll/scrollProgress'

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Metres the name slides left/right toward the cursor — a few pixels only, a
 *  touch more than the camera parallax so the name has a hair of extra depth. */
const WORDMARK_PARALLAX = 0.1

/**
 * The troika text object drei hands back.
 *
 * These are troika's own properties, not three's. It reads them when `sync()`
 * is called and rebuilds the glyph geometry from whatever it finds — which is
 * what lets the font and the size be changed on a live object rather than by
 * rebuilding the React tree.
 */
type TroikaText = Mesh & {
  font: string
  fontSize: number
  letterSpacing: number
  outlineOpacity: number
  sync: () => void
}

/**
 * The name, set large in the space between the crystal and the wall.
 *
 * Deliberately not on the wall and not attached to the logo: it occupies the
 * gap between them, so the crystal passes in front of it and the LED screen
 * reads behind it. That layering is what gives the room depth rather than
 * leaving it a flat backdrop with objects pasted on.
 *
 * The letters glow. That is assembled here rather than post-processed — see
 * `glow` in the config for why a bloom pass would be the wrong trade — from
 * copies of the type carrying no fill at all, each drawn as nothing but a
 * blurred outline and blended additively so they sum into light.
 *
 * The fill itself is still a flat colour. The intent is for it to read the wall
 * behind it and flip between light and dark per pixel — see `onLight`, `flipAt`
 * and `flipSoftness` in the config, which exist for that and are not yet used.
 * Doing it properly means the wall's programme code moving into a shared chunk
 * that both shaders include, rather than being reimplemented here: the wall's
 * appearance changes constantly, and a second copy of that logic would drift out
 * of step and mis-flip the type in ways that look like a rendering fault.
 */
export function Wordmark() {
  const drift = useRef<Group>(null)
  const pointer = usePointerState()
  const shift = useRef(0)

  /**
   * Every layer, glow and fill alike, in one list.
   *
   * Font and size have to reach all of them together. If the glow kept the old
   * face for even one frame it would show as a doubled, mismatched shadow, so
   * they are never written one at a time.
   */
  const layers = useRef<(TroikaText | null)[]>([])

  /**
   * One material per layer.
   *
   * They cannot share: troika derives its own shader from whatever material it
   * is handed and writes that layer's outline settings into it, so a shared
   * instance would leave every layer wearing the last one's blur.
   */
  const glowMaterials = useMemo(
    () =>
      WORDMARK.glow.map(
        () =>
          new MeshBasicMaterial({
            color: new Color(WORDMARK.glowColor),
            transparent: true,
            // Light adds. Alpha blending would stack the layers into grey haze.
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [],
  )

  const fillMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(WORDMARK.onDark),
        transparent: true,
        opacity: WORDMARK.opacity,
        toneMapped: false,
        // Sits between the crystal and the wall, and must not punch a hole in
        // either — the crystal refracts what is behind it, including this.
        depthWrite: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      fillMaterial.dispose()
      glowMaterials.forEach((material) => material.dispose())
    },
    [fillMaterial, glowMaterials],
  )

  /**
   * Live controls.
   *
   * These write to the troika objects themselves and re-sync, rather than going
   * through React state. Same principle as the wall's uniforms: the panel is not
   * holding a copy of the value, it is reading and writing the real one, so it
   * cannot show something the scene is not using. Changing the font this way
   * also avoids remounting the text, which would drop troika's glyph cache and
   * hitch every time the dropdown moved.
   */
  useEffect(() => {
    const live = () => layers.current.filter((layer): layer is TroikaText => !!layer)

    /** Applied to every layer at once, then synced in one pass. */
    const applyAll = (write: (layer: TroikaText) => void) => {
      for (const layer of live()) {
        write(layer)
        layer.sync()
      }
    }

    /** Scales the configured per-layer opacities rather than replacing them. */
    let glowAmount = 1

    return registerControls([
      {
        group: 'wordmark',
        kind: 'choice',
        label: 'font',
        options: WORDMARK.fonts,
        get: () => live()[0]?.font ?? WORDMARK.font,
        set: (value) => applyAll((layer) => (layer.font = value)),
      },
      {
        group: 'wordmark',
        label: 'size (m)',
        min: 0.3,
        max: 4,
        step: 0.01,
        get: () => live()[0]?.fontSize ?? WORDMARK.size,
        set: (value) => applyAll((layer) => (layer.fontSize = value)),
      },
      {
        group: 'wordmark',
        label: 'letter spacing',
        min: -0.08,
        max: 0.4,
        step: 0.005,
        get: () => live()[0]?.letterSpacing ?? WORDMARK.letterSpacing,
        set: (value) => applyAll((layer) => (layer.letterSpacing = value)),
      },
      {
        group: 'wordmark',
        label: 'glow',
        min: 0,
        max: 3,
        step: 0.01,
        get: () => glowAmount,
        set: (value) => {
          glowAmount = value
          // Only the glow copies — the fill sits past them in the list and has
          // no outline to scale.
          WORDMARK.glow.forEach((layer, index) => {
            const text = layers.current[index]
            if (!text) return
            text.outlineOpacity = layer.opacity * value
            text.sync()
          })
        },
      },
    ])
  }, [])

  useFrame((state, delta) => {
    if (!drift.current) return
    const time = state.clock.elapsedTime
    drift.current.position.y =
      WORDMARK.position[1] +
      Math.sin((time / WORDMARK.floatSeconds) * Math.PI * 2) *
        WORDMARK.floatAmplitude

    // The name slides slightly toward the cursor — horizontal only, eased, and
    // nothing else in the room moves with it. Returns to centre with no pointer.
    const p = pointer.current
    const target = p.active ? p.x : 0
    shift.current += (target - shift.current) * (1 - Math.exp(-5 * Math.max(delta, 0)))
    drift.current.position.x = WORDMARK.position[0] + shift.current * WORDMARK_PARALLAX

    // The name is part of the hero, so it clears as the works section begins —
    // the wall stays, the name goes, and the projects have the room to themselves.
    const heroVis = 1 - smoothstep(0.02, 0.1, scrollProgress())
    fillMaterial.opacity = WORDMARK.opacity * heroVis
    for (const material of glowMaterials) material.opacity = heroVis
  })

  /** Shared by every layer, so the glow lands exactly on the letterforms. */
  const shape = {
    font: WORDMARK.font,
    fontSize: WORDMARK.size,
    letterSpacing: WORDMARK.letterSpacing,
    anchorX: 'center' as const,
    anchorY: 'middle' as const,
    curveRadius: WORDMARK.curveRadius,
  }

  return (
    <group ref={drift} position={WORDMARK.position}>
      {WORDMARK.glow.map((layer, index) => (
        <Text
          key={index}
          ref={(node: Mesh | null) => {
            layers.current[index] = node as TroikaText | null
          }}
          {...shape}
          material={glowMaterials[index]}
          // No fill: this copy exists only for its outline. Left visible it
          // would sit behind the real letters as a second solid slab and dull
          // them rather than lighting them.
          fillOpacity={0}
          outlineWidth={`${layer.width * 100}%`}
          outlineBlur={`${layer.blur * 100}%`}
          outlineColor={WORDMARK.glowColor}
          outlineOpacity={layer.opacity}
          // Widest first, so the tight rim lands on top of the broad wash.
          renderOrder={WORDMARK.renderOrder + index}
        >
          {WORDMARK.text}
        </Text>
      ))}

      <Text
        ref={(node: Mesh | null) => {
          layers.current[WORDMARK.glow.length] = node as TroikaText | null
        }}
        {...shape}
        material={fillMaterial}
        renderOrder={WORDMARK.renderOrder + WORDMARK.glow.length}
      >
        {WORDMARK.text}
      </Text>
    </group>
  )
}
