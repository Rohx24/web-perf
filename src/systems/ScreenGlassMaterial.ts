import { Color, DataTexture, ShaderMaterial, Texture, Vector2 } from 'three'

import { HERO } from './heroConfig'
import { WALL_TINT } from './wallTint'
import { screenGlassFrag, screenGlassVert } from './screenGlassShader'
import { createWavinessMap } from './GlassMaterial'

/**
 * The screen-space glass, wearing MeshPhysicalMaterial's clothes.
 *
 * HeroController mutates `thickness`, `ior`, `envMapIntensity`, `normalScale`,
 * `attenuationColor` and `sheenColor` every frame, and the tuner writes
 * `roughness`, `metalness`, `iridescence` and `clearcoat`. Rather than fork the
 * controller — which would make the A/B a comparison of two different rigs
 * instead of two different materials — this exposes the same property names and
 * routes them at the uniforms underneath.
 *
 * The three object-valued ones (`normalScale`, `attenuationColor`,
 * `sheenColor`) ARE the uniform values, not copies, so `.copy()` and `.set()`
 * mutate them in place and nothing has to be synced.
 */
export class ScreenGlassMaterial extends ShaderMaterial {
  /** Present so the tuner's writes land somewhere harmless. */
  metalness = 0
  clearcoat = 1
  clearcoatRoughness = 0.04
  reflectivity = 1
  iridescenceIOR = 1.35
  iridescenceThicknessRange: [number, number] = [180, 940]
  attenuationDistance = 4.4
  sheen = 1
  sheenRoughness = 0.5
  /* MUST stay 0. three decides whether to run its transmission pass by reading
     this property alone, on any material class -- so a non-zero value here puts
     the mark back in the transmissive list and re-renders the entire scene, the
     exact cost this material exists to avoid. */
  transmission = 0
  normalMap: DataTexture | null = null

  constructor() {
    const glass = HERO.glass
    const waviness = createWavinessMap()

    super({
      vertexShader: screenGlassVert,
      fragmentShader: screenGlassFrag,
      transparent: true,
      uniforms: {
        uSceneTex: { value: null as Texture | null },
        uResolution: { value: new Vector2(1, 1) },
        uWaviness: { value: waviness },
        uWavinessScale: { value: glass.wavinessScale },
        // the live Vector2 behind `normalScale`
        uWavinessAmountVec: { value: new Vector2(glass.waviness, glass.waviness) },
        uWavinessAmount: { value: glass.waviness },
        uRoughness: { value: glass.roughness },
        uRefractPower: { value: 0.1 },
        uDispersion: { value: 1 },
        uEnvIntensity: { value: glass.envMapIntensity },
        uBodyColor: { value: WALL_TINT.clone() },
        uSheenColor: { value: WALL_TINT.clone() },
        uIridescence: { value: glass.iridescence },
        uOpacity: { value: 1 },
      },
    })

    this.normalMap = waviness

    /* normalScale is a Vector2 the controller calls .set() on, but the shader
       wants one float. Reading it here rather than on assignment is what lets
       the in-place mutation work. */
    this.onBeforeRender = () => {
      this.uniforms.uWavinessAmount.value = this.uniforms.uWavinessAmountVec.value.x
    }
  }

  // --- MeshPhysicalMaterial's surface, mapped onto the uniforms -------------

  /**
   * Depth of the block → how far the screen-space bend reaches, in screen UV.
   *
   * Alche's 0.1 is a tenth of the screen, which is fine for a logo that covers
   * a small part of it. Ours fills the viewport, so at 0.1 each fragment
   * samples something entirely unrelated to what sits behind it and the mark
   * goes blotchy. Scaled to roughly a third of that.
   */
  get thickness(): number { return this.uniforms.uRefractPower.value / 0.0075 }
  set thickness(v: number) { this.uniforms.uRefractPower.value = v * 0.0075 }

  /** Index of refraction → how far apart R, G and B land. */
  get ior(): number { return this.uniforms.uDispersion.value / 2 + 1 }
  set ior(v: number) { this.uniforms.uDispersion.value = (v - 1) * 2 }

  get envMapIntensity(): number { return this.uniforms.uEnvIntensity.value }
  set envMapIntensity(v: number) { this.uniforms.uEnvIntensity.value = v }

  get roughness(): number { return this.uniforms.uRoughness.value }
  set roughness(v: number) { this.uniforms.uRoughness.value = v }

  get iridescence(): number { return this.uniforms.uIridescence.value }
  set iridescence(v: number) { this.uniforms.uIridescence.value = v }

  get normalScale(): Vector2 { return this.uniforms.uWavinessAmountVec.value }
  set normalScale(v: Vector2) { this.uniforms.uWavinessAmountVec.value.copy(v) }

  get attenuationColor(): Color { return this.uniforms.uBodyColor.value }
  set attenuationColor(v: Color) { this.uniforms.uBodyColor.value.copy(v) }

  get sheenColor(): Color { return this.uniforms.uSheenColor.value }
  set sheenColor(v: Color) { this.uniforms.uSheenColor.value.copy(v) }

  /** Called by the sentinel once the frame's scene has been captured. */
  setSceneTexture(tex: Texture, width: number, height: number): void {
    this.uniforms.uSceneTex.value = tex
    this.uniforms.uResolution.value.set(width, height)
  }
}
