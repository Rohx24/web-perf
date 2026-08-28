import { useEffect, useMemo } from 'react'
import { BackSide, Color, ShaderMaterial } from 'three'

import { LAYERS } from '../scene/layers'
import { ROOM } from '../scene/roomConfig'
import { registerControls } from '../dev/controls'
import { GLASS } from './glassConfig'
import { glassFragmentShader, glassVertexShader } from './glassShader'

/**
 * The sheet of glass over the display.
 *
 * One more cylinder, a few millimetres inside the wall's topmost layer, so
 * everything printed on the wall — the emitters, the sub-panel seams, the grid
 * and the drifting words — is seen through it. See `glassShader` for why this
 * reflects rather than refracts, and `glassConfig` for why it stays subtle.
 *
 * Additive and depth-writing off, so it can only add light to what is behind it
 * and never occludes anything in front.
 */
export function GlassLayer() {
  const { radius, bottom, top, wrapAngle, radialSegments } = ROOM

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: glassVertexShader,
        fragmentShader: glassFragmentShader,
        transparent: true,
        blending: 2, // AdditiveBlending
        depthWrite: false,
        side: BackSide,
        uniforms: {
          uCeiling: { value: new Color(GLASS.ceiling).convertSRGBToLinear() },
          uFloorTone: { value: new Color(GLASS.floorTone).convertSRGBToLinear() },
          uRoomLevel: { value: GLASS.roomLevel },
          uHorizon: { value: GLASS.horizon },
          uHorizonSoft: { value: GLASS.horizonSoft },
          uBaseReflect: { value: GLASS.baseReflect },
          uFresnelPower: { value: GLASS.fresnelPower },
          uAmount: { value: GLASS.amount },
        },
      }),
    [radius, bottom, top, wrapAngle],
  )

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const uniform = (name: string) => ({
      get: () => material.uniforms[name].value as number,
      set: (value: number) => {
        material.uniforms[name].value = value
      },
    })

    return registerControls([
      { group: 'glass', label: 'amount', min: 0, max: 3, step: 0.01, ...uniform('uAmount') },
      { group: 'glass', label: 'gloss', min: 0, max: 0.4, step: 0.005, ...uniform('uBaseReflect') },
      { group: 'glass', label: 'falloff', min: 0.5, max: 10, step: 0.1, ...uniform('uFresnelPower') },
      { group: 'glass', label: 'room level', min: 0, max: 4, step: 0.01, ...uniform('uRoomLevel') },
      { group: 'glass', label: 'horizon', min: 0, max: 1, step: 0.01, ...uniform('uHorizon') },
      { group: 'glass', label: 'horizon soft', min: 0.02, max: 1, step: 0.01, ...uniform('uHorizonSoft') },
    ])
  }, [material])

  const thetaStart = Math.PI - wrapAngle / 2
  const arcSegments = Math.max(
    3,
    Math.round((radialSegments * wrapAngle) / (Math.PI * 2)),
  )

  return (
    <mesh
      position={[0, (top + bottom) / 2, 0]}
      renderOrder={LAYERS.glass.renderOrder}
      material={material}
    >
      <cylinderGeometry
        args={[
          radius - LAYERS.glass.inset,
          radius - LAYERS.glass.inset,
          top - bottom,
          arcSegments,
          1,
          true,
          thetaStart,
          wrapAngle,
        ]}
      />
    </mesh>
  )
}
