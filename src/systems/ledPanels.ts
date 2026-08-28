import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three'

import { GRID } from '../scene/gridConfig'
import { LAYERS } from '../scene/layers'
import { PANELS } from '../scene/panelConfig'
import { ROOM } from '../scene/roomConfig'

/**
 * The wall's addressing: every sub-panel is an independently controlled display
 * with a stable index.
 *
 * A panel is one physical module. Most panels are divided into sub-panels, and
 * it is the *sub-panel* that is addressable — it decides for itself what colour
 * to show, independently of its neighbours and of the panel containing it.
 *
 * The layout lives on the CPU and is uploaded to the GPU, rather than each side
 * computing it. That is deliberate. The obvious alternative — hash the panel
 * coordinates in both places — cannot be trusted: GLSL evaluates `sin` at 32-bit
 * precision and JavaScript at 64-bit, and a hash built on `sin` of a large
 * product diverges between them. The two would agree almost everywhere and
 * disagree on scattered panels, so a click would occasionally light up the wrong
 * sub-panel and nothing about the code would look wrong. One source of truth
 * makes that impossible.
 */

const WALL_RADIUS = ROOM.radius - LAYERS.illumination.inset

/** The wall's surface, in metres. Everything below is addressed in these units. */
export const ARC_LENGTH = ROOM.wrapAngle * WALL_RADIUS
export const BAND_HEIGHT = ROOM.top - ROOM.bottom

export const PANEL_WIDTH = PANELS.cellsAcross * GRID.cell
export const PANEL_HEIGHT = PANELS.cellsUp * GRID.cell

export const PANELS_ACROSS = Math.ceil(ARC_LENGTH / PANEL_WIDTH)
export const PANELS_UP = Math.ceil(BAND_HEIGHT / PANEL_HEIGHT)

/**
 * Sub-panels per panel, at most. The widest split is five across by two up, and
 * every panel reserves a full block of this many indices whether it uses them or
 * not — so an index stays valid even if a panel's division changes.
 */
const SUB_ACROSS = 5
const SUB_UP = 2
const SUB_PER_PANEL = SUB_ACROSS * SUB_UP

/** Total addressable sub-panels on the wall. */
export const PANEL_COUNT = PANELS_ACROSS * PANELS_UP * SUB_PER_PANEL

/** How one panel is divided. The only place this is decided. */
function subGrid(px: number, py: number): [number, number] {
  // A small integer hash — exact in both float64 and int32, unlike anything
  // built on sin(), so the layout is perfectly reproducible.
  const h = (px * 73856093) ^ (py * 19349663)
  const roll = ((h >>> 0) % 1000) / 1000

  if (roll < 0.18) return [1, 1] // one whole panel
  if (roll < 0.42) return [2, 1] // two wide rectangles
  if (roll < 0.62) return [2, 2] // four squarish tiles
  if (roll < 0.84) return [5, 1] // five tall strips
  return [5, 2] //                 ten small squares
}

/**
 * The layout, as a texture the shader reads: one texel per panel, holding how
 * many sub-panels it is divided into across and up.
 */
export const PANEL_LAYOUT = (() => {
  const data = new Float32Array(PANELS_ACROSS * PANELS_UP * 4)

  for (let py = 0; py < PANELS_UP; py++) {
    for (let px = 0; px < PANELS_ACROSS; px++) {
      const [gx, gy] = subGrid(px, py)
      const i = (py * PANELS_ACROSS + px) * 4
      data[i] = gx
      data[i + 1] = gy
    }
  }

  const texture = new DataTexture(
    data,
    PANELS_ACROSS,
    PANELS_UP,
    RGBAFormat,
    FloatType,
  )
  // Nearest, always: these are counts, and interpolating between a panel split
  // in two and one split in five would produce a division that exists nowhere.
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
})()

// --- Per-sub-panel colour overrides ---------------------------------------

/** Texture width for the override table. Height follows from the panel count. */
const OVERRIDE_WIDTH = 64
const OVERRIDE_HEIGHT = Math.ceil(PANEL_COUNT / OVERRIDE_WIDTH)

const overrideData = new Float32Array(OVERRIDE_WIDTH * OVERRIDE_HEIGHT * 4)

/**
 * What each sub-panel is being told to show: rgb, plus alpha as the flag for
 * "this one is under manual control". Alpha 0 means the sub-panel falls back to
 * the wall's own gradient, which is why clearing is just setting alpha to 0.
 */
export const PANEL_OVERRIDES = (() => {
  const texture = new DataTexture(
    overrideData,
    OVERRIDE_WIDTH,
    OVERRIDE_HEIGHT,
    RGBAFormat,
    FloatType,
  )
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
})()

export const OVERRIDE_SIZE: [number, number] = [OVERRIDE_WIDTH, OVERRIDE_HEIGHT]

/** Which sub-panel covers a point on the wall, in metres. -1 if off the wall. */
export function panelIndexAt(metresX: number, metresY: number): number {
  if (metresX < 0 || metresY < 0) return -1
  if (metresX >= ARC_LENGTH || metresY >= BAND_HEIGHT) return -1

  const px = Math.floor(metresX / PANEL_WIDTH)
  const py = Math.floor(metresY / PANEL_HEIGHT)
  if (px >= PANELS_ACROSS || py >= PANELS_UP) return -1

  const [gx, gy] = subGrid(px, py)
  const withinX = metresX / PANEL_WIDTH - px
  const withinY = metresY / PANEL_HEIGHT - py

  const tx = Math.min(gx - 1, Math.floor(withinX * gx))
  const ty = Math.min(gy - 1, Math.floor(withinY * gy))

  // Resolve to the light group's anchor, exactly as the shader does. A panel cut
  // into many sub-panels lights them in pairs, so several sub-panels share one
  // address — and a click has to land on the address that actually lights, or
  // the wall would colour a different region from the one that was clicked.
  const groupWidth = gx >= 5 ? 2 : 1
  const groupsAcross = Math.max(1, Math.floor(gx / groupWidth))
  const anchorX = Math.min(Math.floor(tx / groupWidth), groupsAcross - 1) * groupWidth

  // A fixed block per panel, so an index does not shift when a neighbouring
  // panel is divided differently.
  return (py * PANELS_ACROSS + px) * SUB_PER_PANEL + ty * SUB_ACROSS + anchorX
}

/** Put one sub-panel under manual control, showing this colour. */
export function setPanelColour(index: number, r: number, g: number, b: number) {
  if (index < 0 || index >= PANEL_COUNT) return
  const i = index * 4
  overrideData[i] = r
  overrideData[i + 1] = g
  overrideData[i + 2] = b
  overrideData[i + 3] = 1
  PANEL_OVERRIDES.needsUpdate = true
}

/** Hand one sub-panel back to the wall's own gradient. */
export function clearPanelColour(index: number) {
  if (index < 0 || index >= PANEL_COUNT) return
  overrideData[index * 4 + 3] = 0
  PANEL_OVERRIDES.needsUpdate = true
}

/** Hand the whole wall back to its gradient. */
export function clearAllPanels() {
  overrideData.fill(0)
  PANEL_OVERRIDES.needsUpdate = true
}
