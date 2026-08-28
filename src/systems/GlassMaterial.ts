import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  Vector2,
} from 'three'

import { HERO } from './heroConfig'
import { WALL_TINT } from './wallTint'

/**
 * A smooth, seamless waviness field.
 *
 * This is the "not perfectly clean" part of the glass: a handful of low
 * frequency sine waves summed into a height field, converted to normals
 * analytically. It is deliberately *not* noise — there is no high frequency
 * content, so it cannot read as scratches, dirt, grain or frost. All it does is
 * make the refracted view through the block wander by a fraction of a degree,
 * the way it does through a real cast optical blank.
 *
 * Frequencies are whole numbers so the field tiles seamlessly.
 */
function createWavinessMap(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4)

  // Amplitude, frequency in u, frequency in v, phase.
  const waves: [number, number, number, number][] = [
    [1, 3, 2, 0],
    [0.6, 5, 4, 1.7],
    [0.45, 2, 7, 0.3],
    [0.3, 7, 5, 2.4],
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size

      // Slope of the height field, evaluated analytically rather than sampled,
      // so the normals stay exact and free of stair-stepping.
      let slopeU = 0
      let slopeV = 0
      for (const [amplitude, fu, fv, phase] of waves) {
        const au = 2 * Math.PI * fu
        const av = 2 * Math.PI * fv
        slopeU += amplitude * au * Math.cos(au * u + phase) * Math.cos(av * v)
        slopeV += -amplitude * av * Math.sin(au * u + phase) * Math.sin(av * v)
      }

      // Normalise (-slopeU, -slopeV, 1) and pack into RGB.
      const scale = 0.02
      const nx = -slopeU * scale
      const ny = -slopeV * scale
      const length = Math.hypot(nx, ny, 1)

      const index = (y * size + x) * 4
      data[index] = Math.round(((nx / length) * 0.5 + 0.5) * 255)
      data[index + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255)
      data[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
      data[index + 3] = 255
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(HERO.glass.wavinessScale, HERO.glass.wavinessScale)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // Normals are data, not colour — no sRGB decode.
  texture.colorSpace = NoColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * The one material every mesh in the logo shares: thick, polished optical
 * glass.
 *
 * The waviness rides on `normalMap` only. `clearcoat` sits on top of it with no
 * normal map of its own, so the outer surface stays a perfect mirror and the
 * edges read as polished while the refraction underneath still bends.
 */
export function createGlassMaterial(): MeshPhysicalMaterial {
  const glass = HERO.glass

  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: glass.transmission,
    ior: glass.ior,
    thickness: glass.thickness,
    roughness: glass.roughness,
    metalness: glass.metalness,
    clearcoat: glass.clearcoat,
    clearcoatRoughness: glass.clearcoatRoughness,
    reflectivity: glass.reflectivity,
    envMapIntensity: glass.envMapIntensity,
    // Beer-Lambert absorption through the body. The colour is written every
    // frame from the wall's own ramp, so the block is stained by whatever the
    // panels behind it are showing rather than carrying a colour of its own.
    attenuationColor: WALL_TINT.clone(),
    attenuationDistance: glass.attenuationDistance,
    // Thin-film interference: the bands of unrelated colour across the block.
    iridescence: glass.iridescence,
    iridescenceIOR: glass.iridescenceIOR,
    iridescenceThicknessRange: [...glass.iridescenceThicknessRange],
    // The room's light, spread across the surface. Colour is written per frame.
    sheen: glass.sheen,
    sheenRoughness: glass.sheenRoughness,
    sheenColor: WALL_TINT.clone(),
    transparent: true,
    opacity: 1,
  })

  material.normalMap = createWavinessMap()
  material.normalScale = new Vector2(glass.waviness, glass.waviness)

  return material
}
