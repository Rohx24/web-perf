import { MathUtils } from 'three'
import { ROOM, VIEWER } from '../scene/roomConfig'
import { LIVE } from '../dev/live'

/**
 * The post-hero scroll sequence.
 *
 * One normalised scroll variable S ∈ [0,1] drives everything. The hero and its
 * LED wall are never touched — the camera simply flies forward through them and
 * out into a lightweight "project void" that has its own, much cheaper backdrop
 * (accent-colour flashes, no dot matrix).
 *
 * Phases (by S):
 *   0.00–0.18  approach     camera eases forward, hero still framed
 *   0.18–0.35  dive+glitch  camera punches the wall; warp streaks + screen tear
 *   0.35–0.80  gallery      project windows stream past at a yaw, one in focus
 *   0.80–1.00  outro        cards recede; wireframe brand assembles
 *
 * All distances are metres, matching the scene.
 */

const WALL_Z = -ROOM.radius

export const SCROLL = {
  /**
   * Scroll length in viewport heights. Long, so each frame holds and has to be
   * watched before the next arrives — a small scroll past a frame's dwell (see
   * gallery.dwell + galleryActive) glides the next one in slowly.
   */
  pages: 11,

  phase: {
    approachEnd: 0.12,
    diveStart: 0.12,
    diveEnd: 0.18,
    // The WORKS title gets a slow, one-time pass first (LED.works enterS..exitS
    // ≈ 0.05..0.30), then the cards begin — so the title is done before the first
    // pane, not competing with it.
    galleryStart: 0.24,
    galleryEnd: 0.85,
    outroStart: 0.85,
  },

  camera: {
    startZ: VIEWER.position[2],
    startY: VIEWER.position[1],
    startLookY: 2.9,
    startLookZ: VIEWER.target[2],
    /** Eye height / look height once in the void. */
    voidY: 0.6,
    /** How far ahead the camera aims in the void. */
    lookAhead: 10,
    /** The camera advances until this S, then holds for the outro. */
    travelEndS: 0.8,
    /** Camera Z at travelEndS. Deep enough to have passed every card. */
    voidEndZ: -96,
    /** Fraction of scroll over which the eye settles from the standing pose. */
    settle: 0.16,
  },

  warp: {
    centreZ: WALL_Z,
    // Metres either side of the wall the dive spans. Kept short so the crossing
    // is a quick punch-through, not a long drawn-out transition.
    range: 4.5,
    count: 130,
    tubeRadius: 7,
    length: 15,
    reach: 28,
    brightness: 0.95,
    colour: '#bcd2ff',
  },

  /** The screen-tear "combobulation" — as WORKS clears, punching through the wall. */
  glitch: {
    centreS: 0.16,
    width: 0.04,
    strength: 1,
  },

  /**
   * The transport: WORKS rakes across the *hero LED wall* during the zoom-in
   * (before the camera punches through it), then a flash + glitch hands off to
   * the gallery.
   */
  intertitle: {
    worksInS: 0.06,
    worksOutS: 0.16,
    flashCentreS: 0.16,
    flashWidth: 0.03,
  },

  gallery: {
    // NOTE: the carousel geometry/pacing fields below (xRadius, zRadius,
    // frontDist, rise, yaw, growth, fillFracW/H, bend, corner, border, dwell) are
    // now live-tunable and are READ FROM `LIVE.works` at runtime (dev control_works
    // panel), not from here. The authoritative defaults live in src/dev/live.ts;
    // these are kept only as reference/first-paint values. `count`, `size`,
    // `visStart/visEnd`, `borderColor` and `spinTurns` are still read from here.
    /** Must match PROJECTS.length. */
    count: 4,

    // --- Rising curved-frame carousel (alche's WorksThumbnails, adapted) -----
    // Ported straight from alche's WorksThumbnails.update. Each frame's signed
    // slot offset is `xa = index − active` (xa>0 entering from the RIGHT+LOW,
    // 0 = centred/featured/head-on, xa<0 exiting to the LEFT+HIGH). Alche's
    // formula, per frame:
    //   position.x = sin(xa)·xRadius      (elliptical sweep, wide)
    //   position.z =  frontDist − (1−cos(xa))·zRadius   (recedes off-centre)
    //   position.y = −xa·rise             (linear diagonal climb, not an arc)
    //   rotation.y =  xa·yaw
    //   scale      = 1 + growth·(1 − min(1,|xa|))   (subtle; depth does the rest)
    // Placed in CAMERA space (copy camera pose, then translate), so the orbit
    // holds in front of the camera wherever the scroll has carried it. The frame
    // itself is CURVED in its own vertex shader (see ProjectFrames), always bent
    // like alche's, never flat.
    /** Horizontal sweep radius (alche's sin(x)·11, scaled to our room). */
    xRadius: 6.4,
    /** Depth radius — how much a frame recedes as it leaves centre (alche cos·5). */
    zRadius: 3.2,
    /** Metres ahead of the camera the centred (featured) frame sits. */
    frontDist: 6,
    /** Metres of linear diagonal climb per slot (alche's y = −x, scaled). Frame
     *  enters low-right, exits high-left. */
    rise: 0.9,
    /** Radians of inward yaw per slot (alche's rotation.y = x·0.6). */
    yaw: 0.6,
    /** Subtle scale growth at centre over the 0.9 base (alche 0.9 + 0.2·…). Most
     *  of the size change is perspective from the depth, as in alche. */
    growth: 0.22,
    /** Frame face [w, h] in metres — 16:9. On-screen size is set by the contain
     *  fit below, not these metres; this only fixes the aspect. */
    size: [5, 2.8125] as [number, number],
    /** The featured frame is CONTAIN-fitted at frontDist: scaled so it fits within
     *  fillFracW of the viewport width AND fillFracH of the height, taking the
     *  smaller — same comfortable margin whatever the aspect. Neighbours shrink
     *  from there by perspective. */
    fillFracW: 0.52,
    fillFracH: 0.5,
    /** How deep the frame bends (fraction of its width its edges recede toward the
     *  viewer) — alche's baked `cos(x)` curve, size-independent here. */
    bend: 0.28,
    /** Rounded-corner radius of the pane, in height-half units (0 = square,
     *  0.5 = pill). */
    corner: 0.14,
    /** Border thickness (same units) and its colour — a cool-white rim. */
    border: 0.022,
    borderColor: '#dbe6ff',
    /** Dwell: fraction of each frame's half-slot it holds centred before it
     *  starts moving. Higher = the frame parks longer and a small extra scroll
     *  snaps the next one in. (See galleryActive.) */
    dwell: 0.34,
    /** Visibility window: |xa| a frame stays fully lit, then the fade width — the
     *  edges of alche's `(1 − smoothstep(|x|, 0.8, 2.5))`. Only featured + its two
     *  neighbours show; the logo peeks through the gaps. */
    visStart: 0.8,
    visEnd: 2.5,
    /** Turns the logo backbone makes across the whole scroll (used by the logo
     *  spin in HeroController) — gentle, so the flat mark never spins edge-on. */
    spinTurns: 0.5,
  },

  /** The cheap LED-ish backdrop for the void. One cylinder, colour flashes. */
  void: {
    radius: 13,
    /** Comes in right after WORKS + the dive, carrying straight into the gallery. */
    fadeInS: 0.16,
    fadeOutS: 0.8,
    /** Base brightness of the backdrop tint (kept low so cards read on top). */
    brightness: 0.5,
  },

  /**
   * The finale: the RD portal swells and the frame zooms into it, a white flash,
   * then a clean white "about me" screen assembles.
   */
  finale: {
    // The pixel-grid dissolve is driven by LIVE.outro now (control_works), held
    // back so the pane leaves first. These place the white about screen and its
    // copy AFTER the grid has filled, so the order reads: pane exits → grid fills
    // → white screen slots up → text assembles.
    portalStart: 0.8,
    portalEnd: 0.88,
    // whiteStart is unused now — the white screen is keyed to the grid fill (75%)
    // in OutroWireframe for a seamless hand-off. Name/about/contact reveal just
    // after the grid completes (LIVE.outro.gridEnd default 0.925).
    whiteStart: 0.965,
    nameStart: 0.935,
    aboutStart: 0.95,
    contactStart: 0.96,
  },
} as const

/** Camera Z as a function of scroll: advance to voidEndZ, then hold. */
export function cameraZ(s: number): number {
  const c = SCROLL.camera
  const t = MathUtils.clamp(s / c.travelEndS, 0, 1)
  return MathUtils.lerp(c.startZ, c.voidEndZ, t)
}

/**
 * The carousel position for a scroll value: a continuous index where project i
 * is centred/featured when the result == i. A `dwell` holds each frame parked at
 * centre through most of its slot, then a smoothstep glides to the next — so
 * scrolling a little past a frame slides the next one in rather than tracking
 * scroll 1:1. Shared by the frames, the DOM copy and the wall backlight so all
 * three stay in lockstep.
 */
export function galleryActive(s: number): number {
  const { galleryStart, galleryEnd } = SCROLL.phase
  const g = SCROLL.gallery
  const t = MathUtils.clamp((s - galleryStart) / (galleryEnd - galleryStart), 0, 1)
  const raw = t * g.count - 0.5
  const base = Math.round(raw)
  const frac = raw - base
  const af = Math.abs(frac)
  const dwell = LIVE.works.dwell // live-tunable in control_works
  if (af <= dwell) return base
  const glide = MathUtils.smoothstep((af - dwell) / (0.5 - dwell), 0, 1)
  return base + Math.sign(frac) * glide * 0.5
}

/** Centre S of card i's featured moment. */
export function cardCentreS(i: number): number {
  const { galleryStart, galleryEnd } = SCROLL.phase
  const span = galleryEnd - galleryStart
  return galleryStart + ((i + 0.5) * span) / SCROLL.gallery.count
}

/** Half-width of a card's scroll slot. */
export function cardSlotHalf(): number {
  const { galleryStart, galleryEnd } = SCROLL.phase
  return (galleryEnd - galleryStart) / SCROLL.gallery.count / 2
}
