import { useMemo } from 'react'
import { GRID } from './gridConfig'
import { LAYERS } from './layers'
import { PANELS } from './panelConfig'
import { buildPanelLayout, buildSeamCores } from './panelLayout'
import { ROOM } from './roomConfig'
import { WallPanel } from './WallPanel'

/**
 * Scales an sRGB hex by a factor.
 *
 * The variation is applied to the displayed value rather than to linear
 * intensity, so a stated +/-3% is +/-3% of what the eye actually sees.
 */
function scaleHex(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  return `#${channels
    .map((c) => Math.max(0, Math.min(255, Math.round(c * factor))))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * The wall's modular panel construction.
 *
 * Purely architectural: it divides the cylinder into display modules, tiles
 * some of them, and gives each face its own barely-there tone. It owns no
 * lines, marks or text, so the grid, the dot matrix and any later type or
 * lighting layer stay completely independent of it.
 */
export function PanelLayer() {
  const { radius, bottom, top, wrapAngle, radialSegments } = ROOM
  const { cell } = GRID
  const {
    cellsAcross,
    cellsUp,
    seam,
    color,
    recessColor,
    coreColor,
    coreWidth,
    roughness,
    brightnessVariation,
    roughnessVariation,
    subdivide,
    service,
  } = PANELS

  const panels = useMemo(
    () =>
      buildPanelLayout({
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
      }),
    [
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
    ],
  )

  const cores = useMemo(
    () =>
      buildSeamCores({
        radius,
        bottom,
        top,
        wrapAngle,
        cell,
        cellsAcross,
        cellsUp,
        coreWidth,
      }),
    [radius, bottom, top, wrapAngle, cell, cellsAcross, cellsUp, coreWidth],
  )

  const panelRadius = radius - LAYERS.panels.inset
  const segmentsFor = (thetaLength: number) =>
    Math.max(4, Math.round((radialSegments * thetaLength) / (Math.PI * 2)))

  return (
    <group>
      {/*
        The chamfer: the surface the panels are mounted onto, hidden except
        around the edge of every gap.
      */}
      <WallPanel
        radius={radius - LAYERS.panelRecess.inset}
        thetaStart={Math.PI - wrapAngle / 2}
        thetaLength={wrapAngle}
        centreY={(top + bottom) / 2}
        height={top - bottom}
        segments={radialSegments}
        color={recessColor}
        roughness={roughness}
        renderOrder={LAYERS.panelRecess.renderOrder}
      />

      {/* The dark core down the centre of each panel-to-panel seam. */}
      {cores.horizontal.map((core) => (
        <WallPanel
          key={core.key}
          radius={radius - LAYERS.panelCoreHorizontal.inset}
          thetaStart={core.thetaStart}
          thetaLength={core.thetaLength}
          centreY={core.centreY}
          height={core.height}
          segments={segmentsFor(core.thetaLength)}
          color={coreColor}
          roughness={roughness}
          renderOrder={LAYERS.panelCoreHorizontal.renderOrder}
        />
      ))}
      {cores.vertical.map((core) => (
        <WallPanel
          key={core.key}
          radius={radius - LAYERS.panelCoreVertical.inset}
          thetaStart={core.thetaStart}
          thetaLength={core.thetaLength}
          centreY={core.centreY}
          height={core.height}
          segments={segmentsFor(core.thetaLength)}
          color={coreColor}
          roughness={roughness}
          renderOrder={LAYERS.panelCoreVertical.renderOrder}
        />
      ))}

      {panels.map((panel) => (
        <WallPanel
          key={panel.key}
          radius={panelRadius}
          thetaStart={panel.thetaStart}
          thetaLength={panel.thetaLength}
          centreY={panel.centreY}
          height={panel.height}
          segments={segmentsFor(panel.thetaLength)}
          color={scaleHex(color, panel.brightness)}
          roughness={roughness + panel.roughnessOffset}
          renderOrder={LAYERS.panels.renderOrder}
        />
      ))}
    </group>
  )
}
