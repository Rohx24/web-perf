type GridMarkerInput = {
  /** Radius the marks sit at. */
  radius: number
  bottom: number
  top: number
  wrapAngle: number
  cell: number
  /** Cells between major intersections, around the arc and up the wall. */
  majorEveryAcross: number
  majorEveryUp: number
  /** Half-length of each arm, in metres of surface distance. */
  arm: number
}

/**
 * Builds a "+" at every major grid intersection.
 *
 * The intersections are found the same way the grid finds them — cell indices
 * anchored at the centre of the arc and at y=0 — so a mark always lands exactly
 * on a crossing rather than near one.
 *
 * The horizontal arm is drawn as two chords through the centre point rather
 * than one straight span, so it follows the cylinder instead of cutting a
 * chord across it.
 */
export function buildGridMarkers({
  radius,
  bottom,
  top,
  wrapAngle,
  cell,
  majorEveryAcross,
  majorEveryUp,
  arm,
}: GridMarkerInput): number[] {
  const positions: number[] = []

  const centreAngle = Math.PI
  const stepAngle = cell / radius
  const cellLimit = wrapAngle / 2 / stepAngle
  const armAngle = arm / radius

  const at = (angle: number, y: number): [number, number, number] => [
    radius * Math.sin(angle),
    y,
    radius * Math.cos(angle),
  ]

  const firstColumn = Math.ceil(-cellLimit / majorEveryAcross)
  const lastColumn = Math.floor(cellLimit / majorEveryAcross)
  const rowHeight = majorEveryUp * cell
  const firstRow = Math.ceil(bottom / rowHeight)
  const lastRow = Math.floor(top / rowHeight)

  for (let k = firstColumn; k <= lastColumn; k++) {
    const angle = centreAngle + k * majorEveryAcross * stepAngle

    for (let m = firstRow; m <= lastRow; m++) {
      const y = m * rowHeight

      const left = at(angle - armAngle, y)
      const centre = at(angle, y)
      const right = at(angle + armAngle, y)
      positions.push(...left, ...centre, ...centre, ...right)

      const [x, , z] = centre
      positions.push(x, y - arm, z, x, y + arm, z)
    }
  }

  return positions
}
