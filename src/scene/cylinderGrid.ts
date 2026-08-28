type CylinderGridInput = {
  /** Wall radius; lines are placed at `radius - inset`. */
  radius: number
  /** Y of the wall band's lower edge. */
  bottom: number
  /** Y of the wall band's upper edge. */
  top: number
  wrapAngle: number
  /** Subdivision spacing in metres of surface distance. */
  cell: number
  /** Every Nth vertical subdivision, around the arc, is a primary line. */
  majorEveryAcross: number
  /** Every Nth horizontal subdivision, up the wall, is a primary line. */
  majorEveryUp: number
  /** Chord count used to trace one full 360deg ring. */
  ringSegments: number
  primaryInset: number
  secondaryInset: number
}

type CylinderGridResult = {
  /** Flat [x1,y1,z1, x2,y2,z2, ...] pairs, one pair per line segment. */
  primary: number[]
  secondary: number[]
}

/**
 * Generates the grid as points evaluated on the cylinder itself, not as a
 * texture projected onto it: every vertex is placed with sin/cos at the wall
 * radius, so the lines sit exactly on the surface no matter how the room is
 * proportioned.
 *
 * Vertical lines are true straight edges of the cylinder, so each needs only a
 * single segment. Horizontal lines are rings, traced as chord chains.
 *
 * Columns are laid out from the centre of the arc outward and rows from y=0
 * outward, so the grid stays symmetric about the viewer's forward axis and its
 * divisions do not shift when the band is extended.
 */
export function buildCylinderGrid({
  radius,
  bottom,
  top,
  wrapAngle,
  cell,
  majorEveryAcross,
  majorEveryUp,
  ringSegments,
  primaryInset,
  secondaryInset,
}: CylinderGridInput): CylinderGridResult {
  const primary: number[] = []
  const secondary: number[] = []

  // The wall's arc is centred on -Z, so that is where index 0 sits.
  const centreAngle = Math.PI
  const halfArc = wrapAngle / 2
  // Equal arc length between lines -> equal angle, since the radius is constant.
  const stepAngle = cell / radius
  const columns = Math.floor(halfArc / stepAngle)

  // Vertical lines: one straight segment from floor to wall top.
  for (let i = -columns; i <= columns; i++) {
    const isPrimary = i % majorEveryAcross === 0
    const target = isPrimary ? primary : secondary
    const r = radius - (isPrimary ? primaryInset : secondaryInset)
    const angle = centreAngle + i * stepAngle
    const x = r * Math.sin(angle)
    const z = r * Math.cos(angle)
    target.push(x, bottom, z, x, top, z)
  }

  // Horizontal lines: rings traced around the arc at each height step.
  const firstRow = Math.ceil(bottom / cell)
  const lastRow = Math.floor(top / cell)
  const arcSegments = Math.max(
    2,
    Math.round((ringSegments * wrapAngle) / (Math.PI * 2)),
  )

  for (let j = firstRow; j <= lastRow; j++) {
    const isPrimary = j % majorEveryUp === 0
    const target = isPrimary ? primary : secondary
    const r = radius - (isPrimary ? primaryInset : secondaryInset)
    const y = j * cell
    const startAngle = centreAngle - halfArc

    let prevX = r * Math.sin(startAngle)
    let prevZ = r * Math.cos(startAngle)

    for (let s = 1; s <= arcSegments; s++) {
      const angle = startAngle + (s / arcSegments) * wrapAngle
      const x = r * Math.sin(angle)
      const z = r * Math.cos(angle)
      target.push(prevX, y, prevZ, x, y, z)
      prevX = x
      prevZ = z
    }
  }

  return { primary, secondary }
}
