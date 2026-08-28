import { FrontSide, type Side } from 'three'
import { SURFACE } from './roomConfig'

type RoomSurfaceProps = {
  /** FrontSide for the caps, BackSide for the wall we stand inside. */
  side?: Side
}

/**
 * The one material the whole room shares: matte charcoal, fully rough,
 * non-metallic, with no reflections to pick up.
 *
 * `dithering` is a built-in material flag, not an effect — it breaks up the
 * 8-bit quantisation that otherwise shows as vertical bands across a
 * near-black surface.
 */
export function RoomSurface({ side = FrontSide }: RoomSurfaceProps) {
  return (
    <meshStandardMaterial
      color={SURFACE.color}
      roughness={SURFACE.roughness}
      metalness={SURFACE.metalness}
      envMapIntensity={0}
      flatShading={false}
      dithering
      side={side}
    />
  )
}
