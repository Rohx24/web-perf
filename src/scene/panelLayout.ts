type SubdivideVariant = {
  /** Split offsets across the panel, in whole grid cells from its left edge. */
  readonly across: readonly number[]
  /** Split offsets up the panel, in whole grid cells from its bottom edge. */
  readonly up: readonly number[]
}

type PanelLayoutInput = {
  radius: number
  bottom: number
  top: number
  wrapAngle: number
  /** Grid cell size in metres — panels are whole multiples of this. */
  cell: number
  cellsAcross: number
  cellsUp: number
  seam: number
  brightnessVariation: number
  roughnessVariation: number
  subdivide: {
    readonly chance: number
    readonly seam: number
    readonly brightnessVariation: number
    readonly variants: readonly SubdivideVariant[]
  }
  service: {
    readonly chance: number
    readonly brightness: number
    readonly roughness: number
  }
}

export type PanelSpec = {
  key: string
  /** Sweep start on the cylinder, in radians, seam already deducted. */
  thetaStart: number
  thetaLength: number
  /** Y of the tile's centre. */
  centreY: number
  height: number
  /** Multiplier on the panel base colour: 1 is the unvaried tone. */
  brightness: number
  /** Absolute offset to add to the panel base roughness. */
  roughnessOffset: number
}

/** A narrow band down the centre of one seam. */
export type SeamCoreSpec = {
  key: string
  thetaStart: number
  thetaLength: number
  centreY: number
  height: number
}

type SeamCoreInput = {
  radius: number
  bottom: number
  top: number
  wrapAngle: number
  cell: number
  cellsAcross: number
  cellsUp: number
  coreWidth: number
}

/**
 * Deterministic value in [0, 1) from a pair of integers and a salt.
 *
 * Panels need to differ from each other but must not shimmer or reshuffle
 * between renders, so this is a fixed hash of the panel's coordinates rather
 * than a random draw. The salt lets one panel draw several independent values —
 * tone, roughness, role — that do not correlate with each other, which is what
 * stops the wall falling into a visible checkerboard.
 *
 * The two coordinates are mixed together before the avalanche steps rather than
 * XORed at the end, so neighbours along a row or column do not share structure.
 */
function hashUnit(a: number, b: number, salt: number): number {
  let h = Math.imul(a, 0x27d4eb2d) + Math.imul(b, 0x165667b1) + Math.imul(salt, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Maps a hash to a symmetric spread around zero. */
function spread(unit: number, amount: number): number {
  return (unit * 2 - 1) * amount
}

/**
 * Divides the wall band into panels, and some panels into display tiles.
 *
 * Both axes are laid out in grid-cell indices anchored at the centre of the arc
 * and at y=0, which is the same origin the grid uses — so panel edges, and the
 * internal tile edges, always fall on grid lines. Panels at the ends of the arc
 * and the top of the band are clipped to the wall rather than dropped, so there
 * is no bare strip anywhere the camera can see; clipped panels are never
 * subdivided, since a partial tile grid would give the clipping away.
 */
export function buildPanelLayout({
  radius,
  bottom,
  top,
  wrapAngle,
  cell,
  cellsAcross,
  cellsUp,
  seam,
  brightnessVariation,
  roughnessVariation,
  subdivide,
  service,
}: PanelLayoutInput): PanelSpec[] {
  const panels: PanelSpec[] = []

  const centreAngle = Math.PI
  const stepAngle = cell / radius
  const cellLimit = wrapAngle / 2 / stepAngle
  const panelHeight = cellsUp * cell

  const firstColumn = Math.floor(-cellLimit / cellsAcross)
  const lastColumn = Math.ceil(cellLimit / cellsAcross) - 1
  const firstRow = Math.floor(bottom / panelHeight)
  const lastRow = Math.ceil(top / panelHeight) - 1

  for (let k = firstColumn; k <= lastColumn; k++) {
    const fromCell = Math.max(k * cellsAcross, -cellLimit)
    const toCell = Math.min((k + 1) * cellsAcross, cellLimit)
    if ((toCell - fromCell) * stepAngle <= seam / radius) continue
    const clippedAcross =
      fromCell !== k * cellsAcross || toCell !== (k + 1) * cellsAcross

    for (let m = firstRow; m <= lastRow; m++) {
      const fromY = Math.max(m * panelHeight, bottom)
      const toY = Math.min((m + 1) * panelHeight, top)
      if (toY - fromY <= seam) continue
      const clipped =
        clippedAcross || fromY !== m * panelHeight || toY !== (m + 1) * panelHeight

      const role = hashUnit(k, m, 1)
      const isService = role < service.chance
      const isSubdivided =
        !isService && !clipped && role < service.chance + subdivide.chance

      let brightness = 1 + spread(hashUnit(k, m, 2), brightnessVariation)
      let roughnessOffset = spread(hashUnit(k, m, 3), roughnessVariation)
      if (isService) {
        brightness *= service.brightness
        roughnessOffset += service.roughness
      }

      // A plain panel is just the degenerate case of a tiled one: a single
      // interval on each axis, so both go through the same code below.
      let acrossSplits: readonly number[] = []
      let upSplits: readonly number[] = []
      if (isSubdivided && subdivide.variants.length > 0) {
        const index = Math.floor(
          hashUnit(k, m, 4) * subdivide.variants.length,
        )
        const variant = subdivide.variants[Math.min(index, subdivide.variants.length - 1)]
        acrossSplits = variant.across
        upSplits = variant.up
      }

      const columnBounds = [
        fromCell,
        ...acrossSplits.map((offset) => k * cellsAcross + offset),
        toCell,
      ]
      const rowBounds = [
        fromY,
        ...upSplits.map((offset) => m * panelHeight + offset * cell),
        toY,
      ]

      const lastColumnIndex = columnBounds.length - 2
      const lastRowIndex = rowBounds.length - 2

      for (let p = 0; p <= lastColumnIndex; p++) {
        // Outer edges use the full panel-to-panel seam; internal tile edges use
        // the finer one.
        const leftGap = (p === 0 ? seam : subdivide.seam) / 2 / radius
        const rightGap = (p === lastColumnIndex ? seam : subdivide.seam) / 2 / radius
        const thetaStart = centreAngle + columnBounds[p] * stepAngle + leftGap
        const thetaLength =
          (columnBounds[p + 1] - columnBounds[p]) * stepAngle - leftGap - rightGap
        if (thetaLength <= 0) continue

        for (let q = 0; q <= lastRowIndex; q++) {
          const bottomGap = (q === 0 ? seam : subdivide.seam) / 2
          const topGap = (q === lastRowIndex ? seam : subdivide.seam) / 2
          const tileBottom = rowBounds[q] + bottomGap
          const tileTop = rowBounds[q + 1] - topGap
          if (tileTop <= tileBottom) continue

          const tileBrightness = isSubdivided
            ? brightness *
              (1 +
                spread(
                  hashUnit(p + k * 31, q + m * 17, 5),
                  subdivide.brightnessVariation,
                ))
            : brightness

          panels.push({
            key: `${k}:${m}:${p}:${q}`,
            thetaStart,
            thetaLength,
            centreY: (tileBottom + tileTop) / 2,
            height: tileTop - tileBottom,
            brightness: tileBrightness,
            roughnessOffset,
          })
        }
      }
    }
  }

  return panels
}

/**
 * The dark band running down the centre of every panel-to-panel seam.
 *
 * Drawn in front of the chamfer surface but behind the panels, so a seam reads
 * chamfer / core / chamfer across its width rather than as one flat dark line.
 * Internal tile seams deliberately get no core — that is what keeps them
 * reading as shallower than the seams between whole panels.
 */
export function buildSeamCores({
  radius,
  bottom,
  top,
  wrapAngle,
  cell,
  cellsAcross,
  cellsUp,
  coreWidth,
}: SeamCoreInput): { vertical: SeamCoreSpec[]; horizontal: SeamCoreSpec[] } {
  const vertical: SeamCoreSpec[] = []
  const horizontal: SeamCoreSpec[] = []

  const centreAngle = Math.PI
  const stepAngle = cell / radius
  const cellLimit = wrapAngle / 2 / stepAngle
  const panelHeight = cellsUp * cell
  const coreAngle = coreWidth / radius

  const firstColumn = Math.ceil(-cellLimit / cellsAcross)
  const lastColumn = Math.floor(cellLimit / cellsAcross)
  for (let k = firstColumn; k <= lastColumn; k++) {
    const angle = centreAngle + k * cellsAcross * stepAngle
    vertical.push({
      key: `v${k}`,
      thetaStart: angle - coreAngle / 2,
      thetaLength: coreAngle,
      centreY: (top + bottom) / 2,
      height: top - bottom,
    })
  }

  const firstRow = Math.ceil(bottom / panelHeight)
  const lastRow = Math.floor(top / panelHeight)
  for (let m = firstRow; m <= lastRow; m++) {
    horizontal.push({
      key: `h${m}`,
      thetaStart: centreAngle - wrapAngle / 2,
      thetaLength: wrapAngle,
      centreY: m * panelHeight,
      height: coreWidth,
    })
  }

  return { vertical, horizontal }
}
