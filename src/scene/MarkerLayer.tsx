import { useMemo } from 'react'
import { GRID } from './gridConfig'
import { buildGridMarkers } from './gridMarkers'
import { LAYERS } from './layers'
import { MARKERS } from './markerConfig'
import { ROOM } from './roomConfig'
import { ScreenSpaceLines } from './ScreenSpaceLines'

/**
 * Registration crosses at the major grid intersections.
 *
 * Its own layer, sharing only the grid's spacing constants and its line
 * renderer — no geometry or material is shared, so the marks can be restyled or
 * dropped without touching the grid.
 */
export function MarkerLayer() {
  const { radius, bottom, top, wrapAngle } = ROOM
  const { cell, majorEveryAcross, majorEveryUp } = GRID
  const { arm, color, opacity, lineWidth } = MARKERS

  const positions = useMemo(
    () =>
      buildGridMarkers({
        radius: radius - LAYERS.markers.inset,
        bottom,
        top,
        wrapAngle,
        cell,
        majorEveryAcross,
        majorEveryUp,
        arm,
      }),
    [radius, bottom, top, wrapAngle, cell, majorEveryAcross, majorEveryUp, arm],
  )

  return (
    <ScreenSpaceLines
      positions={positions}
      color={color}
      opacity={opacity}
      lineWidth={lineWidth}
      renderOrder={LAYERS.markers.renderOrder}
    />
  )
}
