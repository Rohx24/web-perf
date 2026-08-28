import { BackSide } from 'three'
import { RoomSurface } from './RoomSurface'

type CurvedWallProps = {
  radius: number
  /** Y of the band's lower edge. */
  bottom: number
  /** Y of the band's upper edge. */
  top: number
  /** Arc swept by the wall, in radians. */
  wrapAngle: number
  /** Subdivisions across a full 360deg; the arc gets a proportional share. */
  radialSegments: number
}

/**
 * The cylindrical display wall. An open-ended cylinder rendered from the
 * inside, swept only through `wrapAngle` and centred on -Z so the opening
 * falls behind the viewer.
 */
export function CurvedWall({
  radius,
  bottom,
  top,
  wrapAngle,
  radialSegments,
}: CurvedWallProps) {
  // Three's cylinder starts its sweep at +Z; rotate the start so the arc
  // is centred on -Z, i.e. straight ahead of the viewer.
  const thetaStart = Math.PI - wrapAngle / 2
  const arcSegments = Math.max(
    3,
    Math.round((radialSegments * wrapAngle) / (Math.PI * 2)),
  )
  const height = top - bottom

  return (
    <mesh position={[0, (top + bottom) / 2, 0]}>
      <cylinderGeometry
        args={[radius, radius, height, arcSegments, 1, true, thetaStart, wrapAngle]}
      />
      <RoomSurface side={BackSide} />
    </mesh>
  )
}
