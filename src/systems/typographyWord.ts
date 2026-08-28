import { MathUtils } from 'three'

import {
  LANE_HEIGHT,
  TYPOGRAPHY,
  laneCentreY,
  type Behaviour,
} from './typographyConfig'

export type WordInstance = {
  text: string
  /** Starting angle on the cylinder, in radians. */
  angle: number
  y: number
  /** Cap height in metres. */
  size: number
  /** Lowest lane this word holds, and how many it holds. */
  firstLane: number
  laneCount: number
  behaviour: Behaviour
  /** Angular velocity, in radians per second. Sign comes from the lane. */
  drift: number
  breatheSeconds: number
  opacity: number
  fadeIn: number
  hold: number
  fadeOut: number
  gap: number
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function weighted<T extends { weight: number }>(entries: readonly T[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * total
  for (const entry of entries) {
    roll -= entry.weight
    if (roll <= 0) return entry
  }
  return entries[entries.length - 1]
}

/**
 * Largest cap height at which a word still fits the wall.
 *
 * Word length drives how much surface a label covers, so size has to be capped
 * per word — otherwise the long entries wrap most of the way around the room at
 * the larger tiers.
 */
function fittedSize(text: string, radius: number): number {
  const { advancePerCharacter, maxArcDegrees } = TYPOGRAPHY.placement
  const span = Math.max(1, text.length) * advancePerCharacter
  return (MathUtils.degToRad(maxArcDegrees) * radius) / span
}

/**
 * Finds a run of `count` consecutive free lanes.
 *
 * Candidate runs are collected and one is picked at random rather than taking
 * the first that fits, so words do not pile up at the bottom of the wall.
 * Returns null when the wall is too busy — the caller waits and tries again,
 * which is preferable to overlapping something.
 */
function findLanes(
  taken: ReadonlySet<number>,
  count: number,
): number | null {
  const lanes = TYPOGRAPHY.lanes
  const options: number[] = []

  for (let start = 0; start + count <= lanes.length; start++) {
    let free = true
    for (let offset = 0; offset < count; offset++) {
      if (taken.has(lanes[start + offset])) {
        free = false
        break
      }
    }
    if (free) options.push(lanes[start])
  }

  if (options.length === 0) return null
  return options[Math.floor(Math.random() * options.length)]
}

/**
 * Rolls a new word into free lanes.
 *
 * `ownWords` is this slot's private share of the pool. The pool is split across
 * slots so their vocabularies never intersect, which makes the same word
 * appearing twice on the wall structurally impossible rather than something the
 * spawn logic has to keep checking for — checking it was not reliable, because
 * a slot's claim is only visible to the others after React commits its state.
 *
 * `exclude` then only has to stop a slot repeating itself back to back.
 *
 * Returns null if no run of lanes is free; the slot simply waits.
 */
export function spawnWord(
  radius: number,
  ownWords: readonly string[],
  exclude: readonly string[],
  takenLanes: ReadonlySet<number>,
): WordInstance | null {
  const { placement, timing } = TYPOGRAPHY

  const available = ownWords.filter((word) => !exclude.includes(word))
  const pool = available.length > 0 ? available : ownWords
  const text = pool[Math.floor(Math.random() * pool.length)]

  const isHero =
    (TYPOGRAPHY.heroWords as readonly string[]).includes(text) &&
    Math.random() < TYPOGRAPHY.heroChance
  const tier = weighted(TYPOGRAPHY.sizes)
  const wanted = isHero
    ? between(TYPOGRAPHY.heroSize.min, TYPOGRAPHY.heroSize.max)
    : between(tier.min, tier.max)
  let size = Math.min(wanted, fittedSize(text, radius))

  // A word must fit inside the lanes it holds, or neighbouring rows would
  // collide even though their lanes do not.
  let laneCount = Math.max(1, Math.ceil(size / LANE_HEIGHT))
  let firstLane = findLanes(takenLanes, laneCount)

  // Too crowded for the size rolled: try to squeeze into a single lane before
  // giving up entirely.
  if (firstLane === null && laneCount > 1) {
    laneCount = 1
    size = Math.min(size, LANE_HEIGHT * 0.8)
    firstLane = findLanes(takenLanes, 1)
  }
  if (firstLane === null) return null

  const behaviour = weighted(TYPOGRAPHY.behaviours)
  // Direction is the lane's, not the word's: every word in a given row travels
  // the same way, and adjacent rows travel opposite ways.
  const direction = firstLane % 2 === 0 ? 1 : -1
  const speed = between(behaviour.speedMin, behaviour.speedMax)

  return {
    text,
    angle:
      Math.PI +
      MathUtils.degToRad(between(-placement.angleRange, placement.angleRange)),
    y: laneCentreY(firstLane, laneCount),
    size,
    firstLane,
    laneCount,
    behaviour: behaviour.name,
    drift: (speed / radius) * direction,
    breatheSeconds: between(
      TYPOGRAPHY.breatheSecondsMin,
      TYPOGRAPHY.breatheSecondsMax,
    ),
    opacity: between(TYPOGRAPHY.opacityMin, TYPOGRAPHY.opacityMax),
    fadeIn: between(timing.fadeMin, timing.fadeMax),
    hold: between(timing.holdMin, timing.holdMax),
    fadeOut: between(timing.fadeMin, timing.fadeMax),
    gap: between(timing.gapMin, timing.gapMax),
  }
}
