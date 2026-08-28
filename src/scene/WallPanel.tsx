import { BackSide } from 'three'

type WallPanelProps = {
  /** Radius the panel face sits at. */
  radius: number
  thetaStart: number
  thetaLength: number
  centreY: number
  height: number
  /** Chord count for the panel's arc, so it matches the wall's smoothness. */
  segments: number
  color: string
  roughness: number
  renderOrder?: number
}

/**
 * One modular panel: a curved tile evaluated on the cylinder itself, so its
 * face is flush with the wall's curvature rather than a flat plate bent to fit.
 */
export function WallPanel({
  radius,
  thetaStart,
  thetaLength,
  centreY,
  height,
  segments,
  color,
  roughness,
  renderOrder = 0,
}: WallPanelProps) {
  return (
    <mesh position={[0, centreY, 0]} renderOrder={renderOrder}>
      <cylinderGeometry
        args={[radius, radius, height, segments, 1, true, thetaStart, thetaLength]}
      />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={0}
        envMapIntensity={0}
        flatShading={false}
        dithering
        side={BackSide}
      />
    </mesh>
  )
}
