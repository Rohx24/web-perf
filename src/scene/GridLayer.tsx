import { useMemo } from 'react'
import { buildCylinderGrid } from './cylinderGrid'
import { GRID } from './gridConfig'
import { LAYERS } from './layers'
import { ROOM } from './roomConfig'
import { ScreenSpaceLines } from './ScreenSpaceLines'

/**
 * The engineering grid wrapping the curved wall.
 *
 * It is its own layer, drawn just inside the wall rather than baked into the
 * room material, so it can be restyled, reordered or removed on its own.
 */
export function GridLayer() {
  const { radius, bottom, top, wrapAngle } = ROOM
  const { cell, majorEveryAcross, majorEveryUp, ringSegments, primary, secondary } =
    GRID

  const { primary: primaryLines, secondary: secondaryLines } = useMemo(
    () =>
      buildCylinderGrid({
        radius,
        bottom,
        top,
        wrapAngle,
        cell,
        majorEveryAcross,
        majorEveryUp,
        ringSegments,
        primaryInset: LAYERS.gridPrimary.inset,
        secondaryInset: LAYERS.gridSecondary.inset,
      }),
    [
      radius,
      bottom,
      top,
      wrapAngle,
      cell,
      majorEveryAcross,
      majorEveryUp,
      ringSegments,
    ],
  )

  return (
    <group>
      {GRID.subdivisions && (
        <ScreenSpaceLines
          positions={secondaryLines}
          renderOrder={LAYERS.gridSecondary.renderOrder}
          {...secondary}
        />
      )}
      <ScreenSpaceLines
        positions={primaryLines}
        renderOrder={LAYERS.gridPrimary.renderOrder}
        {...primary}
      />
    </group>
  )
}
