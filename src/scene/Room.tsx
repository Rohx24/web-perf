import { CurvedWall } from './CurvedWall'
import { ROOM } from './roomConfig'

/**
 * The architecture: a single continuous curved wall.
 *
 * There is deliberately no ceiling and no floor — a cap facing away from the
 * light reads as a flat black band across the frame and cuts the surface off.
 * The band instead runs past both edges of the viewport, so the wall is
 * unbroken from top to bottom.
 */
export function Room() {
  const { radius, bottom, top, wrapAngle, radialSegments } = ROOM

  return (
    <group>
      <CurvedWall
        radius={radius}
        bottom={bottom}
        top={top}
        wrapAngle={wrapAngle}
        radialSegments={radialSegments}
      />
    </group>
  )
}
