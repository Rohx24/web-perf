import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
// Straight from troika rather than drei: this drei build does not re-export it.
import { preloadFont } from 'troika-three-text'
import { Group, Mesh, MeshBasicMaterial } from 'three'

import { LAYERS } from '../scene/layers'
import { ROOM } from '../scene/roomConfig'
import { LED } from './ledWallConfig'
import { LIVE } from '../dev/live'
import { TYPOGRAPHY } from './typographyConfig'
import { spawnWord, type WordInstance } from './typographyWord'
import { scrollProgress } from '../scroll/scrollProgress'

/**
 * The troika text object drei hands back.
 *
 * `fillOpacity` and `strokeOpacity` are troika's own properties, read every
 * render and pushed into its shader. Both they and the material's `opacity` are
 * driven together, because which of them reaches the shader depends on how
 * troika's derived material resolves.
 */
type TroikaText = Mesh & { fillOpacity: number; strokeOpacity: number }

/** Envelope for a word at `t` seconds into its life. Negative once finished. */
function envelope(word: WordInstance, t: number): number {
  if (t < 0) return 0
  if (t < word.fadeIn) return t / word.fadeIn
  const held = word.fadeIn + word.hold
  if (t < held) return 1
  const done = held + word.fadeOut
  if (t < done) return 1 - (t - held) / word.fadeOut
  return -1
}

/**
 * Smootherstep — zero first *and second* derivative at both ends.
 *
 * Plain smoothstep still has a curvature discontinuity where it meets 0 and 1,
 * which at these very low opacities is enough to read as a tick at the start and
 * end of a fade. This is what makes the transitions feel buttery rather than
 * merely gradual.
 */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

type WordSlotProps = {
  radius: number
  /** Lanes held by every slot, so a word can never land on a busy row. */
  lanes: React.RefObject<Map<number, number>>
  /** This slot's private share of the word pool. */
  words: string[]
  index: number
  initialDelay: number
}

/**
 * One word, living its own life in its own lanes.
 *
 * The slot owns its state, its clock and its material; nothing outside decides
 * when it changes. It claims lanes on spawn and releases them on death, which is
 * what keeps words from ever overlapping.
 */
function WordSlot({ radius, lanes, words, index, initialDelay }: WordSlotProps) {
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: TYPOGRAPHY.color,
        transparent: true,
        opacity: 0,
        // The grid and dots are drawn in front of this; it must not occlude them.
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )

  const [word, setWord] = useState<WordInstance | null>(null)

  const text = useRef<TroikaText>(null)
  const drift = useRef<Group>(null)
  const elapsed = useRef(-initialDelay)
  /** Live drift rate, so `settle` can shed speed over the word's life. */
  const rate = useRef(0)
  /**
   * The word this slot showed last. Kept separately because the slot's entry in
   * `showing` is cleared the moment it dies, and the no-repeat rule has to
   * outlive that.
   */
  const lastWord = useRef<string | null>(null)

  const release = () => {
    const held = lanes.current
    if (!held) return
    for (const [lane, owner] of held) {
      if (owner === index) held.delete(lane)
    }
  }

  const claim = (next: WordInstance) => {
    const held = lanes.current
    if (held) {
      for (let offset = 0; offset < next.laneCount; offset++) {
        held.set(next.firstLane + offset, index)
      }
    }
  }

  useEffect(() => {
    return () => {
      release()
      material.dispose()
    }
    // Runs once: this is mount/unmount bookkeeping, not a reactive effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const t = (elapsed.current += dt)

    // --- Waiting to be born, or waiting for a free lane -------------------
    if (word === null) {
      if (t < 0) return

      const next = spawnWord(
        radius,
        words,
        lastWord.current ? [lastWord.current] : [],
        new Set(lanes.current?.keys() ?? []),
      )

      if (next === null) {
        // Wall is full. Wait a beat and try again rather than crowding.
        elapsed.current = -0.4
        return
      }

      claim(next)
      lastWord.current = next.text
      rate.current = next.drift
      elapsed.current = 0
      drift.current?.rotation.set(0, 0, 0)
      material.opacity = 0
      if (text.current) {
        text.current.fillOpacity = 0
        text.current.strokeOpacity = 0
      }
      setWord(next)
      return
    }

    const level = envelope(word, t)

    if (level < 0) {
      release()
      elapsed.current = -word.gap
      material.opacity = 0
      if (text.current) {
        text.current.fillOpacity = 0
        text.current.strokeOpacity = 0
      }
      setWord(null)
      return
    }

    let opacity = smootherstep(level) * word.opacity

    if (word.behaviour === 'breathe') {
      // A slow swell between full and (1 - depth). Never reaches zero, never
      // strobes, never touches colour.
      const phase = (t / word.breatheSeconds) * Math.PI * 2
      opacity *= 1 - TYPOGRAPHY.breatheDepth * 0.5 * (1 - Math.cos(phase))
    }

    // These marquee words are part of the hero. They clear as the works section
    // begins, so the WORKS title is the only thing readable on the wall — the
    // wall's colour keeps glowing, but "AI engineer", "Automation" and the rest
    // fade out with the same window the wordmark uses.
    const enter = LED.works.enterS
    const fade = Math.min(1, Math.max(0, (scrollProgress() - 0.02) / (enter + 0.05 - 0.02)))
    opacity *= 1 - smootherstep(fade)

    // Live brightness from the control_works panel — lifts these faint words
    // toward full so they read stronger against the wall.
    opacity *= LIVE.marquee.bright

    material.opacity = opacity
    if (text.current) {
      text.current.fillOpacity = opacity
      // Must track the fill, or the thickening stroke stays solid while the
      // letter fades out from under it and the word reads as an outline.
      text.current.strokeOpacity = opacity
    }

    if (word.behaviour === 'settle') {
      // Arrives quick, parks slow.
      rate.current *= Math.exp(-TYPOGRAPHY.settleRate * dt)
    }
    if (drift.current) drift.current.rotation.y += rate.current * dt
  })

  if (word === null) return null

  return (
    <group ref={drift}>
      <Text
        ref={text}
        material={material}
        font={TYPOGRAPHY.font}
        fontSize={word.size}
        letterSpacing={TYPOGRAPHY.letterSpacing}
        strokeWidth={`${TYPOGRAPHY.strokeWidth * 100}%`}
        strokeColor={TYPOGRAPHY.color}
        fillOpacity={0}
        strokeOpacity={0}
        anchorX="center"
        anchorY="middle"
        // The default 64 is plenty at these sizes and costs far less to
        // generate, which is what keeps a spawn from hitching a frame.
        sdfGlyphSize={64}
        // `curveRadius` is a real troika property drei forwards to the mesh, but
        // drei's TextProps omits it from its types. Spread it in untyped.
        {...({ curveRadius: radius } as { curveRadius: number })}
        renderOrder={LAYERS.typography.renderOrder}
        position={[
          radius * Math.sin(word.angle),
          word.y,
          radius * Math.cos(word.angle),
        ]}
        // Turn the lettering to face the room's axis so it lies tangent to the
        // wall; the extra half turn is because a Text faces +Z by default.
        rotation={[0, word.angle + Math.PI, 0]}
      >
        {word.text}
      </Text>
    </group>
  )
}

/**
 * Environmental typography on the cylindrical wall.
 *
 * Words occupy exclusive lanes aligned to the panel rows, travel in the
 * direction their lane dictates — alternating row by row — and cross-fade in and
 * out on independent clocks.
 */
export function TypographySystem() {
  const radius = ROOM.radius - LAYERS.typography.inset

  /** lane -> slot holding it. */
  const lanes = useRef<Map<number, number>>(new Map())

  /**
   * The pool, dealt out round-robin so no two slots share a word. That is what
   * guarantees a word is never on the wall twice: it is not a rule the spawn
   * logic enforces, it is a vocabulary each slot simply does not have.
   */
  const shares = useMemo(() => {
    const dealt: string[][] = Array.from(
      { length: TYPOGRAPHY.slots },
      () => [],
    )
    TYPOGRAPHY.words.forEach((word, index) => {
      dealt[index % TYPOGRAPHY.slots].push(word)
    })
    return dealt
  }, [])

  /**
   * Build every glyph's SDF up front. Generating them on first use is what
   * makes the first appearance of a word hitch; paying for it once at startup
   * keeps every fade smooth.
   */
  useEffect(() => {
    const characters = Array.from(new Set(TYPOGRAPHY.words.join(''))).join('')
    preloadFont({ font: TYPOGRAPHY.font, characters }, () => {})
  }, [])

  const delays = useMemo(
    () =>
      Array.from(
        { length: TYPOGRAPHY.slots },
        (_, index) => index * 0.55 + Math.random() * 0.5,
      ),
    [],
  )

  return (
    <Suspense fallback={null}>
      <group>
        {delays.map((delay, index) => (
          <WordSlot
            key={index}
            index={index}
            radius={radius}
            lanes={lanes}
            words={shares[index]}
            initialDelay={delay}
          />
        ))}
      </group>
    </Suspense>
  )
}
