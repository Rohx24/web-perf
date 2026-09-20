import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  MathUtils,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
} from 'three'

import { GRID } from '../scene/gridConfig'
import { LAYERS } from '../scene/layers'
import { PANELS } from '../scene/panelConfig'
import { ROOM } from '../scene/roomConfig'
import { LED, PROGRAM } from './ledWallConfig'
import { introActive, onIntroChange } from '../perf/introState'
import { FONT_COLS, FONT_ROWS, buildCodeFont } from './codeFont'
import {
  CODE_COLS,
  CODE_ROWS,
  SECRET_ROWS,
  SECRET_START,
  buildCodeText,
} from './codeSource'
import {
  OVERRIDE_SIZE,
  PANELS_ACROSS,
  PANELS_UP,
  PANEL_LAYOUT,
  PANEL_OVERRIDES,
} from './ledPanels'
import { ledWallFragmentShader, ledWallVertexShader } from './ledWallShader'
import { WALL_TINT } from './wallTint'
import { FLUID } from './fluidCursorState'
import { registerControls } from '../dev/controls'
import { scrollProgress } from '../scroll/scrollProgress'
import { PROJECTS } from '../scroll/projects'
import { SCROLL, galleryActive } from '../scroll/scrollConfig'

/**
 * The wall's light: one cylinder carrying a procedural LED dot matrix.
 *
 * This is the entire lighting system. There is no dot geometry, no per-dot
 * instancing and no light in the scene — a fragment shader draws the lattice and
 * the gradient together on a single surface, so the whole wall costs one draw
 * call whatever the dot pitch is.
 *
 * It sits just in front of the panel faces and blends additively, so it can only
 * ever add light to the architecture rather than replace it, and it writes no
 * depth, so the grid, the markers and the type in front of it are untouched.
 */

/**
 * One soft dot in a cell, tiled across the wall as the emitter mask.
 *
 * The dot occupies `fill` of the cell and fades to nothing before the edge, so a
 * dark gap survives between neighbours. Mipmaps (built by the GPU) average it
 * into a smooth tint as the wall recedes — the crisp-far / soft-near behaviour we
 * used to compute per pixel with fwidth, now free from a single texture read.
 * `softness` widens the falloff so the dots read as gentle glows, not hard discs.
 */
function buildDotTexture(fill: number, softness: number): CanvasTexture {
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')!
  // Dark substrate between dots.
  g.fillStyle = '#000000'
  g.fillRect(0, 0, S, S)
  // A soft radial dot, centred in the cell. softness pushes the falloff wider.
  const c = S / 2
  const radius = fill * 0.5 * S * (0.85 + softness * 0.08)
  const grad = g.createRadialGradient(c, c, 0, c, c, radius)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.72)')
  grad.addColorStop(0.82, 'rgba(255,255,255,0.16)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)

  const texture = new CanvasTexture(canvas)
  // The mask is a plain intensity, not a colour — sample it as-is, no sRGB.
  texture.colorSpace = LinearSRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  // Keeps the dots from smearing to mush where the wall turns away at the sides.
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

/**
 * The word WORKS, drawn once to a canvas for the wall to print.
 *
 * Outlined, not solid — a faint translucent fill inside a bright white stroke,
 * the same treatment as the drifting marquee words. The shader reads the red
 * channel as coverage and supplies the tint/brightness, so encoding the fill as
 * a low value (~0.24) and the outline as full white makes the wall render the
 * letters as a see-through body with a lit rim. The canvas is sized to the word
 * so its aspect is exact; that ratio is handed to the shader (`uWorksAspect`) so
 * the letters keep their proportion however the word is scaled on the wall.
 */
function buildWorksTexture(): { texture: CanvasTexture; aspect: number } {
  const word = 'WORKS'
  const cap = 208
  const pad = 24
  const font = `800 ${cap}px "Arial Black", "Arial Narrow", Arial, sans-serif`

  // Measure first, so the canvas is exactly the word plus a thin margin.
  const gauge = document.createElement('canvas').getContext('2d')!
  gauge.font = font
  const tracking = cap * 0.06
  const widths = word.split('').map((ch) => gauge.measureText(ch).width)
  const wordWidth =
    widths.reduce((sum, w) => sum + w, 0) + tracking * (word.length - 1)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(wordWidth) + pad * 2
  canvas.height = cap + pad * 2

  const g = canvas.getContext('2d')!
  g.fillStyle = '#000000'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.font = font
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = cap * 0.03
  let x = pad
  for (let i = 0; i < word.length; i++) {
    // Translucent body...
    g.fillStyle = 'rgba(255,255,255,0.24)'
    g.fillText(word[i], x, canvas.height / 2)
    // ...inside a bright white outline.
    g.strokeStyle = '#ffffff'
    g.strokeText(word[i], x, canvas.height / 2)
    x += widths[i] + tracking
  }

  const texture = new CanvasTexture(canvas)
  // A coverage mask, not a colour — sample it raw.
  texture.colorSpace = LinearSRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.anisotropy = 8
  texture.needsUpdate = true
  return { texture, aspect: canvas.width / canvas.height }
}

/**
 * A project image, pre-blurred to a small canvas — the wall's "out-of-focus
 * projector slide" (alche pre-blurs each work into a 512² render target with a
 * Gaussian; a heavily-downscaled canvas blur is the same idea for far less code).
 *
 * The image loads async; until it arrives the texture is black and `loaded` is 0,
 * so the shader shows nothing rather than a flash. Cover-fitted so a 16:9 image
 * fills the square-ish canvas without letterboxing, then blurred hard so only its
 * colour survives — no shapes, no text.
 */
function buildBlurredProject(src: string): {
  texture: CanvasTexture
  loaded: { value: number }
} {
  const W = 320
  const H = 180
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  g.fillStyle = '#000000'
  g.fillRect(0, 0, W, H)

  const texture = new CanvasTexture(canvas)
  // We linearise in the shader (pow 2.2), so keep the canvas value raw.
  texture.colorSpace = LinearSRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false

  const loaded = { value: 0 }
  const img = new Image()
  img.onload = () => {
    // Cover-fit, then blur hard so only colour remains.
    const ir = img.width / img.height
    const cr = W / H
    let dw = W
    let dh = H
    if (ir > cr) {
      dh = H
      dw = dh * ir
    } else {
      dw = W
      dh = dw / ir
    }
    g.save()
    g.filter = 'blur(12px)'
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    g.restore()
    texture.needsUpdate = true
    loaded.value = 1
  }
  img.src = src

  return { texture, loaded }
}

/** The shader's ramp, mirrored on the CPU so the crystal can be stained by it. */
function rampColour(t: number, palette: Color[], out: Color): Color {
  const stops = palette.length
  const x = (t - Math.floor(t)) * stops
  out.setRGB(0, 0, 0)
  let total = 0
  for (let i = 0; i < stops; i++) {
    let distance = Math.abs(x - i)
    distance = Math.min(distance, stops - distance)
    let weight = Math.max(0, 1 - distance)
    weight = weight * weight * (3 - 2 * weight)
    out.r += palette[i].r * weight
    out.g += palette[i].g * weight
    out.b += palette[i].b * weight
    total += weight
  }
  return out.multiplyScalar(1 / Math.max(total, 0.0001))
}

const WHITE = new Color(1, 1, 1)

/**
 * What the wall is allowed to cycle while the WORKS overlay is up.
 *
 * Only the Alche colour fields — the wall keeps glowing and changing colour
 * behind the title, but the text programmes (code, glyphs) and the stripes stay
 * out, so the only thing readable on the wall is WORKS. In the hero the full
 * `LED.programs.enabled` roster runs as before.
 */
// fieldDark (the near-black Alche state) is deliberately left OUT — the wall
// should always be showing colour, never go fully black.
const WORKS_ROSTER = [
  PROGRAM.fieldBlue,
  PROGRAM.fieldViolet,
  PROGRAM.fieldTeal,
  PROGRAM.fieldCoral,
  PROGRAM.fieldOrange,
] as const


export function LedWall() {
  const { radius, bottom, top, wrapAngle, radialSegments } = ROOM

  /**
   * The palette, built from hues at locked saturation and luminance.
   *
   * HSL gives constant saturation but not constant brightness — luminance is
   * mostly green, so a cyan reads far brighter than a violet at the same
   * lightness. So each stop is generated at the shared saturation, then scaled
   * until its Rec.709 luminance matches the target. Hue is then the only thing
   * that varies between stops, which is the whole point: a stop that is duller
   * or brighter than its neighbours shows up on the wall as a rectangular
   * region of different quality, because colour is sampled per light group.
   */
  const palette = useMemo(() => {
    const colour = new Color()

    return LED.hues.map((hue) => {
      colour.setHSL(hue / 360, LED.paletteSaturation, 0.6).convertSRGBToLinear()

      const luma = 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b
      return colour.clone().multiplyScalar(LED.paletteLuma / Math.max(luma, 1e-4))
    })
  }, [])

  /**
   * The glyph atlas and the source lines, built once.
   *
   * Both are textures the shader indexes into rather than anything computed per
   * frame — the font is drawn to a canvas at startup and the lines are a table
   * of character indices, so printing real code costs two texture reads per
   * fragment and nothing else.
   */
  const codeFont = useMemo(() => buildCodeFont(), [])
  const codeText = useMemo(() => buildCodeText(), [])
  const dotTexture = useMemo(
    () => buildDotTexture(LED.fill, LED.dotSoftness),
    [],
  )
  const works = useMemo(() => buildWorksTexture(), [])

  // The pre-blurred project slides, one per project, for the wall projection.
  const blurred = useMemo(
    () => PROJECTS.map((p) => buildBlurredProject(p.image ?? '')),
    [],
  )
  // A black fallback for the incoming slot when there is no next project.
  const blankBlur = useMemo(() => buildBlurredProject(''), [])

  // Each project's accent in linear space, so the wall can glow in the work's own
  // colour even when its screenshot is near-black (Satark, Parallel, Boardroom).
  const accentColors = useMemo(
    () => PROJECTS.map((p) => new Color(p.accent).convertSRGBToLinear()),
    [],
  )

  useEffect(
    () => () => {
      codeFont.dispose()
      codeText.dispose()
      dotTexture.dispose()
      works.texture.dispose()
      blurred.forEach((b) => b.texture.dispose())
      blankBlur.texture.dispose()
    },
    [codeFont, codeText, dotTexture, works, blurred, blankBlur],
  )

  const material = useMemo(() => {
    const wallRadius = radius - LAYERS.illumination.inset

    return new ShaderMaterial({
      vertexShader: ledWallVertexShader,
      fragmentShader: ledWallFragmentShader,
      // Deliberately NOT transparent, even though it blends: this keeps the mesh
      // in the opaque pass, which is the pass three captures into the buffer
      // that transmissive materials refract. In the transparent queue the glass
      // logo would sample an unlit wall and render as a black silhouette.
      transparent: false,
      blending: 2, // AdditiveBlending
      depthWrite: false,
      side: BackSide,
      uniforms: {
        uPalette: { value: palette },
        uTime: { value: 0 },
        // The wall's real size, so the lattice can be spaced in metres.
        uArcLength: { value: wrapAngle * wallRadius },
        uBandHeight: { value: top - bottom },
        uPanelWidth: { value: PANELS.cellsAcross * GRID.cell },
        uPanelHeight: { value: PANELS.cellsUp * GRID.cell },
        uSeamClearance: { value: LED.seamClearance },
        uSubClearance: { value: LED.subClearance },
        uPitch: { value: LED.pitch },
        uIntensity: { value: LED.intensity },
        uDotTex: { value: dotTexture },
        uGradientTurns: { value: LED.gradientTurns },
        uGradientRise: { value: LED.gradientRise },
        uGradientOffset: { value: LED.gradientOffset },
        uGradientDrift: { value: LED.gradientDrift },
        // Which programme is showing. Driven by the scheduler below.
        uProgramA: { value: LED.programs.startOn },
        uProgramB: { value: LED.programs.startOn },
        uProgramMix: { value: 0 },
        // How the current cut is laid across the wall (0 hard, 1 wipe, 2 sweep).
        uProgramSelectType: { value: 0 },
        uCutSlant: { value: LED.programs.cutSlant },
        uBandPeriod: { value: LED.bandPeriod },
        uBandSpeed: { value: LED.bandSpeed },
        uBandWidth: { value: LED.bandWidth },
        uBandSlant: { value: LED.bandSlant },
        uPanelRate: { value: LED.panelRate },
        uPanelHold: { value: LED.panelHold },
        uPanelFade: { value: LED.panelFade },
        uCodeLine: { value: LED.codeLine },
        uCodeCell: { value: LED.codeCell },
        uCodeScroll: { value: LED.codeScroll },
        uCodeDim: { value: LED.codeDim },
        uCodeBg: { value: LED.codeBg },
        uCodeFont: { value: codeFont },
        uCodeText: { value: codeText },
        uFontCols: { value: FONT_COLS },
        uFontRows: { value: FONT_ROWS },
        uCodeCols: { value: CODE_COLS },
        uCodeRows: { value: CODE_ROWS },
        uTextRows: { value: CODE_ROWS + SECRET_ROWS },
        uCodeType: { value: LED.codeType },
        uSecret: { value: 0 },
        uSecretStart: { value: SECRET_START },
        uSecretRows: { value: SECRET_ROWS },
        uAgentCell: { value: LED.agentCell },
        uAgentNode: { value: LED.agentNode },
        uAgentLink: { value: LED.agentLink },
        uAgentSpark: { value: LED.agentSpark },
        uAgentSpeed: { value: LED.agentSpeed },
        uAgentDensity: { value: LED.agentDensity },
        uAgentDim: { value: LED.agentDim },
        uGlyphSize: { value: LED.glyphSize },
        uGlyphScroll: { value: LED.glyphScroll },
        uGlyphDim: { value: LED.glyphDim },
        uGlyphHot: { value: LED.glyphHot },
        uWorksTex: { value: works.texture },
        uWorksAspect: { value: works.aspect },
        uWorksHeight: { value: LED.works.height },
        uWorksCentreY: { value: LED.works.centreY },
        uWorksDim: { value: LED.works.dim },
        uWorksAngle: { value: LED.works.angle },
        uWorksTravel: { value: LED.works.travel },
        uWorksProgress: { value: 0 },
        uWorksAmount: { value: 0 },
        // The blurry project projection. Textures + blend are driven live in
        // useFrame from the gallery scroll; these are the resting values.
        uWorks1Tex: { value: blankBlur.texture },
        uWorks2Tex: { value: blankBlur.texture },
        uWorks1Loaded: { value: 0 },
        uWorks2Loaded: { value: 0 },
        uWorksBlend: { value: 0 },
        uWorksImgAspect: { value: 16 / 9 },
        uScreenAspect: { value: 1.6 },
        uWorksProjAmount: { value: 0 },
        uWorksProjDim: { value: LED.worksProj.dim },
        uWorksProjMix: { value: LED.worksProj.mix },
        uWorksAccent1: { value: new Color(0, 0, 0) },
        uWorksAccent2: { value: new Color(0, 0, 0) },
        uWorksWallFade: { value: 0 },
        uPoolWidth: { value: LED.poolWidth },
        uPoolHeight: { value: LED.poolHeight },
        uPoolCentreY: { value: LED.poolCentreY },
        uPoolFloor: { value: LED.poolFloor },
        // The pointer fluid trail — texture is set live from FLUID each frame.
        uFluidsTex: { value: null },
        uFluidsAmount: { value: LED.fluid.glow },
        // Addressing: which panel is divided how, and what each sub-panel has
        // been told to show. See ledPanels.ts.
        uLayout: { value: PANEL_LAYOUT },
        uOverrides: { value: PANEL_OVERRIDES },
        uPanelGrid: { value: new Vector2(PANELS_ACROSS, PANELS_UP) },
        uOverrideSize: { value: new Vector2(...OVERRIDE_SIZE) },
      },
    })
  }, [radius, bottom, top, wrapAngle, palette, codeFont, codeText, dotTexture, works, blankBlur])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  /**
   * Live controls. These write straight into the uniforms the wall is drawing
   * with, so a change lands on the next frame with nothing rebuilt — and the
   * panel reads the same uniforms back, so it cannot show a value the wall is
   * not using. Dev only; this registers nothing in a production build.
   */
  useEffect(() => {
    const uniform = (name: string) => ({
      get: () => material.uniforms[name].value as number,
      set: (value: number) => {
        material.uniforms[name].value = value
      },
    })

    return registerControls([
      { group: 'wall · lattice', label: 'pitch (m)', min: 0.02, max: 0.2, step: 0.001, ...uniform('uPitch') },
      { group: 'wall · lattice', label: 'intensity', min: 0, max: 4, step: 0.01, ...uniform('uIntensity') },
      { group: 'wall · seams', label: 'panel', min: 0, max: 0.2, step: 0.001, ...uniform('uSeamClearance') },
      { group: 'wall · seams', label: 'sub-panel', min: 0, max: 0.12, step: 0.001, ...uniform('uSubClearance') },
      { group: 'wall · gradient', label: 'turns', min: 0, max: 3, step: 0.01, ...uniform('uGradientTurns') },
      { group: 'wall · gradient', label: 'rise', min: 0, max: 3, step: 0.01, ...uniform('uGradientRise') },
      { group: 'wall · gradient', label: 'offset', min: 0, max: 1, step: 0.005, ...uniform('uGradientOffset') },
      { group: 'wall · gradient', label: 'drift', min: 0, max: 0.2, step: 0.001, ...uniform('uGradientDrift') },
      { group: 'wall · bands', label: 'period (m)', min: 2, max: 30, step: 0.1, ...uniform('uBandPeriod') },
      { group: 'wall · bands', label: 'speed', min: 0, max: 0.3, step: 0.001, ...uniform('uBandSpeed') },
      { group: 'wall · bands', label: 'width', min: 0.05, max: 0.9, step: 0.01, ...uniform('uBandWidth') },
      { group: 'wall · panels', label: 'rate', min: 0.005, max: 0.3, step: 0.005, ...uniform('uPanelRate') },
      { group: 'wall · panels', label: 'dark for', min: 0, max: 0.4, step: 0.005, ...uniform('uPanelHold') },
      { group: 'wall · panels', label: 'fade', min: 0.005, max: 0.2, step: 0.005, ...uniform('uPanelFade') },
      { group: 'wall · code', label: 'line (m)', min: 0.1, max: 1.2, step: 0.01, ...uniform('uCodeLine') },
      { group: 'wall · code', label: 'cell (m)', min: 0.04, max: 0.6, step: 0.005, ...uniform('uCodeCell') },
      { group: 'wall · code', label: 'scroll', min: -3, max: 3, step: 0.05, ...uniform('uCodeScroll') },
      { group: 'wall · code', label: 'dim', min: 0, max: 1, step: 0.01, ...uniform('uCodeDim') },
      { group: 'wall · code', label: 'backdrop', min: 0, max: 1.5, step: 0.01, ...uniform('uCodeBg') },
      { group: 'wall · code', label: 'typing', min: 1, max: 90, step: 1, ...uniform('uCodeType') },
      { group: 'wall · agents', label: 'spacing (m)', min: 0.6, max: 6, step: 0.05, ...uniform('uAgentCell') },
      { group: 'wall · agents', label: 'node (m)', min: 0.02, max: 0.5, step: 0.005, ...uniform('uAgentNode') },
      { group: 'wall · agents', label: 'edge (m)', min: 0.005, max: 0.2, step: 0.005, ...uniform('uAgentLink') },
      { group: 'wall · agents', label: 'message', min: 0.01, max: 0.3, step: 0.005, ...uniform('uAgentSpark') },
      { group: 'wall · agents', label: 'speed', min: 0, max: 1.5, step: 0.01, ...uniform('uAgentSpeed') },
      { group: 'wall · agents', label: 'wiring', min: 0, max: 1, step: 0.01, ...uniform('uAgentDensity') },
      { group: 'wall · agents', label: 'dim', min: 0, max: 1, step: 0.01, ...uniform('uAgentDim') },
      { group: 'wall · glyphs', label: 'cell (m)', min: 0.15, max: 1.5, step: 0.01, ...uniform('uGlyphSize') },
      { group: 'wall · glyphs', label: 'scroll', min: -2, max: 2, step: 0.01, ...uniform('uGlyphScroll') },
      { group: 'wall · glyphs', label: 'dim', min: 0, max: 1, step: 0.01, ...uniform('uGlyphDim') },
      { group: 'wall · glyphs', label: 'hot', min: 0, max: 0.4, step: 0.005, ...uniform('uGlyphHot') },
      { group: 'wall · works', label: 'height (m)', min: 1, max: 14, step: 0.1, ...uniform('uWorksHeight') },
      { group: 'wall · works', label: 'centre y', min: 0, max: 1, step: 0.005, ...uniform('uWorksCentreY') },
      { group: 'wall · works', label: 'brightness', min: 0, max: 1.5, step: 0.01, ...uniform('uWorksDim') },
      { group: 'wall · works', label: 'angle (rad)', min: -0.8, max: 0.8, step: 0.005, ...uniform('uWorksAngle') },
      { group: 'wall · works', label: 'travel', min: 0, max: 1.6, step: 0.01, ...uniform('uWorksTravel') },
      { panel: 'works', group: 'works · glow', label: 'accent glow', min: 0, max: 3, step: 0.01, ...uniform('uWorksProjMix') },
      { group: 'wall · room', label: 'centre width', min: 0.1, max: 1.2, step: 0.01, ...uniform('uPoolWidth') },
      { group: 'wall · room', label: 'centre height', min: 0.1, max: 2, step: 0.01, ...uniform('uPoolHeight') },
      { group: 'wall · room', label: 'centre y', min: 0, max: 1, step: 0.01, ...uniform('uPoolCentreY') },
      { group: 'wall · room', label: 'edge floor', min: 0, max: 1, step: 0.01, ...uniform('uPoolFloor') },
      // Ranges over every programme that exists, not just the ones in rotation,
      // so a disabled one can still be inspected.
      { group: 'wall · programme', label: 'slant', min: -0.3, max: 0.3, step: 0.005, ...uniform('uCutSlant') },
      { group: 'wall · programme', label: 'showing', min: 0, max: Math.max(...Object.values(PROGRAM)), step: 1, ...uniform('uProgramA') },
    ])
  }, [material])

  /**
   * The scheduler's state: which programme is showing, and the cut to the next.
   *
   * `held` counts down the current programme; when it runs out a different one
   * is chosen — different, never the same, because a cut to the thing already
   * on screen looks like a dropped frame — and `mix` walks from A to B over
   * cutSeconds before B becomes the new A.
   *
   * Declared above the easter egg because that reaches in to hold the wall still
   * while its message plays.
   */
  const show = useRef<{
    held: number
    cutting: boolean
    works: boolean
    cutDur: number
  }>({
    held: LED.programs.holdSeconds,
    cutting: false,
    works: false,
    cutDur: LED.programs.cutSeconds,
  })

  /**
   * Begin a cut. Three styles exist -- 0 hard cut, 1 wipe across the arc, 2 slow
   * exponential sweep -- and every programme change takes the wipe: the tiles
   * turning over left to right is the one that reads as a wall of screens
   * changing, where the hard cut is a pop and the long sweep drags.
   * Sets the shader's select-type and the duration this particular cut runs
   * over (alche's fade durations were [0, 0.3, 3]s; ours are matched but never
   * instant, so even the hard cut has a frame or two to move). The caller has
   * already set uProgramB and reset uProgramMix to 0.
   */
  const beginCut = (type = 1) => {
    material.uniforms.uProgramSelectType.value = type
    show.current.cutDur = [0.14, LED.programs.cutSeconds, 2.2][type]
    show.current.cutting = true
  }

  /* The arrival beat.

     The page comes up on the glyph field and, a beat later, cuts to colour —
     using the wipe that already exists for programme changes rather than a new
     effect. Pinned rather than random: the first thing anyone sees should be
     the same every time, and it is the one cut that is part of the opening
     rather than part of the wall's ordinary rotation.

     Type 1 is the wipe travelling across the arc. */
  useEffect(() => {
    let timer = 0
    const arrive = () => {
      material.uniforms.uProgramA.value = LED.programs.startOn
      material.uniforms.uProgramB.value = LED.programs.arriveOn
      material.uniforms.uProgramMix.value = 0
      timer = window.setTimeout(() => {
        beginCut(1)
        // hand the wall back to its own scheduler afterwards
        show.current.held = LED.programs.holdSeconds
      }, LED.programs.arriveDelay * 1000)
    }
    // ?noboot=1 mounts with the intro already done, so arrive immediately
    if (!introActive()) { arrive(); return () => window.clearTimeout(timer) }
    const off = onIntroChange((stillUp) => { if (!stillUp) arrive() })
    return () => { off(); window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material])

  /**
   * The easter egg.
   *
   * The Konami code prints a hidden block of lines instead of the source, and
   * holds the wall on the code programme while it runs. Konami rather than
   * something shorter because nobody types it by accident, which is the entire
   * requirement for a thing meant to be found rather than tripped over.
   *
   * It sets a uniform and moves an offset — the hidden lines live in the same
   * texture as the visible ones, so nothing is loaded or reallocated when it
   * fires and it cannot hitch on the frame it triggers.
   */
  useEffect(() => {
    const SEQUENCE = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
      'b', 'a',
    ]

    let at = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const onKey = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      // A wrong key restarts the sequence — but if it is itself a valid opening
      // key it starts the next attempt, so mistyping never locks you out until
      // a full reset.
      at = key === SEQUENCE[at] ? at + 1 : key === SEQUENCE[0] ? 1 : 0

      if (at < SEQUENCE.length) return
      at = 0

      material.uniforms.uSecret.value = 1
      // Hold the wall on the code programme, and stop the scheduler cutting
      // away mid-message.
      material.uniforms.uProgramA.value = PROGRAM.code
      material.uniforms.uProgramB.value = PROGRAM.code
      material.uniforms.uProgramMix.value = 0
      show.current.cutting = false
      show.current.held = LED.programs.secretSeconds

      clearTimeout(timer)
      timer = setTimeout(() => {
        material.uniforms.uSecret.value = 0
      }, LED.programs.secretSeconds * 1000)
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [material])

  useFrame((rootState, delta) => {
    const time = (material.uniforms.uTime.value += Math.min(delta, 1 / 30))

    const step = Math.min(delta, 1 / 30)
    const uniforms = material.uniforms
    const state = show.current

    // The fluid ping-pongs between two targets, so its output texture object
    // changes every frame — re-read it here rather than binding it once.
    uniforms.uFluidsTex.value = FLUID.texture

    // Scroll owns the wall past the hero. Through the hero (scroll 0) the wall
    // cycles its full roster exactly as before; past works.enterS the WORKS
    // overlay eases in and the wall's rotation narrows to the colour fields, so
    // the only readable thing on it is the title over the still-glowing colour.
    const scroll = scrollProgress()
    // One-time pass: progress runs 0->1 across the works window and clamps, so
    // WORKS travels across once as you scroll and never loops back round.
    uniforms.uWorksProgress.value = MathUtils.clamp(
      (scroll - LED.works.enterS) / (LED.works.exitS - LED.works.enterS),
      0,
      1,
    )
    const worksActive = scroll >= LED.works.enterS
    const roster: readonly number[] = worksActive
      ? WORKS_ROSTER
      : LED.programs.enabled

    // The WORKS title is only the intro: it eases in past enterS and back out by
    // exitS, so it clears as the first project pane slots into the centre. The
    // colour-only roster (below) persists through the whole gallery, but the word
    // itself does not linger over the projects. Zero through the hero, so the
    // shader's `if (uWorksAmount > 0.0)` branch costs the hero nothing.
    const targetAmount =
      MathUtils.smoothstep(scroll, LED.works.enterS - 0.02, LED.works.enterS + 0.04) *
      (1 - MathUtils.smoothstep(scroll, LED.works.exitS - 0.05, LED.works.exitS))
    uniforms.uWorksAmount.value +=
      (targetAmount - uniforms.uWorksAmount.value) *
      (1 - Math.exp(-6 * step))

    // --- The blurry project projection ------------------------------------
    // Through the gallery, the wall carries the featured project's pre-blurred
    // hue, cross-fading to the next as the carousel advances. Driven by the same
    // galleryActive() the frames use, so the hue on the wall and the frame in
    // front stay in lockstep; a slightly laggier feel comes from the frames'
    // own ease. Gated to the gallery phase so the hero and intro pay nothing.
    const { galleryStart, outroStart } = SCROLL.phase
    const projAmount =
      MathUtils.smoothstep(scroll, galleryStart - 0.03, galleryStart + 0.06) *
      (1 - MathUtils.smoothstep(scroll, outroStart - 0.03, outroStart + 0.02))
    uniforms.uWorksProjAmount.value = projAmount
    // Fade the wall's colour programme to neutral through the gallery, so only the
    // panes carry colour. Same gate as the projection glow.
    uniforms.uWorksWallFade.value = projAmount
    if (projAmount > 0.001) {
      const count = SCROLL.gallery.count
      const active = galleryActive(scroll)
      const i1 = MathUtils.clamp(Math.floor(active), 0, count - 1)
      const i2 = Math.min(i1 + 1, count - 1)
      const frac = MathUtils.clamp(active - i1, 0, 1)
      const b1 = blurred[i1] ?? blankBlur
      const b2 = blurred[i2] ?? blankBlur
      uniforms.uWorks1Tex.value = b1.texture
      uniforms.uWorks2Tex.value = b2.texture
      uniforms.uWorks1Loaded.value = b1.loaded.value
      uniforms.uWorks2Loaded.value = b2.loaded.value
      uniforms.uWorksBlend.value = frac
      uniforms.uWorksAccent1.value.copy(accentColors[i1] ?? accentColors[0])
      uniforms.uWorksAccent2.value.copy(accentColors[i2] ?? accentColors[0])
      uniforms.uScreenAspect.value =
        rootState.size.height > 0
          ? rootState.size.width / rootState.size.height
          : 1.6
    }

    // Crossing into or out of the works section: if the programme on screen is
    // not one the new roster allows (e.g. code was showing when we entered),
    // cut straight to a colour field so no text lingers under the title.
    if (worksActive !== state.works) {
      state.works = worksActive
      const current = uniforms.uProgramA.value as number
      if (!roster.includes(current) && !state.cutting) {
        uniforms.uProgramB.value =
          roster[Math.floor(Math.random() * roster.length)]
        uniforms.uProgramMix.value = 0
        beginCut()
      }
    }

    if (state.cutting) {
      uniforms.uProgramMix.value += step / state.cutDur
      if (uniforms.uProgramMix.value >= 1) {
        // B has fully arrived: it becomes the programme on screen.
        uniforms.uProgramA.value = uniforms.uProgramB.value
        uniforms.uProgramMix.value = 0
        state.cutting = false
        state.held = LED.programs.holdSeconds
      }
    } else {
      state.held -= step
      // Through the gallery the wall holds still (no new cuts) — its colour is
      // faded to neutral anyway, and cycling behind the panes only distracts.
      if (state.held <= 0 && projAmount < 0.5) {
        // Picked from the current roster rather than from a count, and never the
        // one already showing — a cut to what is already on screen reads as a
        // dropped frame. Choosing among the *others* rather than re-rolling also
        // means this cannot stall when the roster is short.
        const current = uniforms.uProgramA.value as number
        const others = roster.filter((id) => id !== current)
        const next = others.length > 0 ? others : roster

        // Weighted, so the bands come round more often than the rest.
        const weight = (id: number) =>
          id === PROGRAM.bands ? LED.programs.bandsWeight : 1
        let pick = Math.random() * next.reduce((sum, id) => sum + weight(id), 0)
        let chosen = next[next.length - 1]
        for (const id of next) {
          pick -= weight(id)
          if (pick < 0) { chosen = id; break }
        }
        uniforms.uProgramB.value = chosen
        // Each time the bands come round, flip the diagonal at random, so it
        // alternates between the original lean and its mirror rather than always
        // running the same way.
        if (chosen === PROGRAM.bands) {
          uniforms.uBandSlant.value =
            (Math.random() < 0.5 ? -1 : 1) * Math.abs(LED.bandSlant)
        }
        uniforms.uProgramMix.value = 0
        beginCut()
      }
    }

    // The colour the middle of the wall is showing, so the crystal in front of
    // it is stained by whatever is actually behind it.
    rampColour(
      LED.gradientOffset +
        0.5 * LED.gradientTurns +
        0.5 * LED.gradientRise +
        time * LED.gradientDrift,
      palette,
      WALL_TINT,
    )
    WALL_TINT.lerp(WHITE, LED.tintWash)
  })

  const thetaStart = Math.PI - wrapAngle / 2
  const arcSegments = Math.max(
    3,
    Math.round((radialSegments * wrapAngle) / (Math.PI * 2)),
  )

  return (
    <mesh
      position={[0, (top + bottom) / 2, 0]}
      renderOrder={LAYERS.illumination.renderOrder}
      material={material}
    >
      <cylinderGeometry
        args={[
          radius - LAYERS.illumination.inset,
          radius - LAYERS.illumination.inset,
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
