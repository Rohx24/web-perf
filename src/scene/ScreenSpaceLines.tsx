import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Color } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

export type LineStyle = {
  color: string
  opacity: number
  /** Width in CSS pixels. */
  lineWidth: number
}

type ScreenSpaceLinesProps = LineStyle & {
  /** Flat [x1,y1,z1, x2,y2,z2, ...] pairs, one pair per segment. */
  positions: number[]
  renderOrder?: number
}

/**
 * Draws a set of line segments at a constant width in screen pixels.
 *
 * Plain `LineBasicMaterial` ignores `linewidth` in WebGL, so line hierarchy is
 * impossible with it. `LineSegments2` expands each segment into a quad sized
 * against the viewport, which also means the lines stay exactly as thick and as
 * sharp on a high-DPR display as on a low one — the material just needs its
 * `resolution` kept in sync with the canvas.
 */
export function ScreenSpaceLines({
  positions,
  color,
  opacity,
  lineWidth,
  renderOrder = 0,
}: ScreenSpaceLinesProps) {
  const size = useThree((state) => state.size)

  const lines = useMemo(() => {
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)

    const material = new LineMaterial({
      color: new Color(color),
      linewidth: lineWidth,
      transparent: opacity < 1,
      opacity,
      // The lines float just inside the wall; they should not occlude anything
      // a later layer draws on top of them.
      depthWrite: false,
    })

    return new LineSegments2(geometry, material)
  }, [positions, color, opacity, lineWidth])

  useEffect(() => {
    return () => {
      lines.geometry.dispose()
      lines.material.dispose()
    }
  }, [lines])

  useEffect(() => {
    // Width is given in CSS pixels, so resolution is the CSS-pixel canvas size.
    lines.material.resolution.set(size.width, size.height)
  }, [lines, size.width, size.height])

  return <primitive object={lines} renderOrder={renderOrder} />
}
