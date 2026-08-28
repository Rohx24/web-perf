import { CanvasTexture, NearestFilter, RepeatWrapping } from 'three'

/**
 * A bitmap font for the wall, rendered once at startup.
 *
 * The code programme used to draw characters as stroke patterns — a box
 * subdivided and partly lit. It read as texture rather than as text, because it
 * was texture: there were no letterforms in it at all, only noise with a stem.
 *
 * Real letters need a real font, and there are two ways to get one into a
 * fragment shader. Hand-authoring bitmaps is the obvious one and it is a trap:
 * a usable code face needs upper case, lower case, digits and a couple of dozen
 * symbols, which is some ninety glyphs and several hundred lines of hand-typed
 * pixels to maintain, all to arrive at worse letterforms than the machine
 * already has.
 *
 * So the browser draws it. Every glyph is rendered once into a canvas atlas in a
 * real monospace face and uploaded as a texture the shader indexes into. The
 * cost is one canvas at startup, and the letterforms are the ones a type
 * designer drew.
 *
 * Sampling is NEAREST and the shader thresholds what it reads. The atlas is
 * drawn at roughly one texel per emitter, so a glyph pixel and an LED are the
 * same thing — which is exactly how real LED signage works, and why the result
 * looks like a board rather than like text pasted onto one.
 */

/**
 * Everything the wall can print. Index into this is what the text texture
 * stores, so the order is load-bearing — changing it changes what every stored
 * line says.
 */
export const CODE_CHARS =
  ' abcdefghijklmnopqrstuvwxyz' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '0123456789' +
  '.,:;()[]{}<>=+-*/_#"\'|&!?@$%\\'

/** Atlas layout. Cells are wider than one glyph so neighbours cannot bleed. */
export const FONT_COLS = 16
export const FONT_ROWS = Math.ceil(CODE_CHARS.length / FONT_COLS)

/**
 * Texels per glyph cell.
 *
 * Small on purpose: this is a low-resolution bitmap font by intent, not a
 * compromise. A glyph is about six emitters wide on the wall, so rendering the
 * atlas much finer would only throw detail away at sample time — and worse,
 * would land different glyphs on different sub-pixel phases and make some
 * letters look bolder than others.
 */
const CELL_W = 8
const CELL_H = 12

export function buildCodeFont(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = FONT_COLS * CELL_W
  canvas.height = FONT_ROWS * CELL_H

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable — cannot build the code font')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${CELL_H - 3}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`

  for (let i = 0; i < CODE_CHARS.length; i++) {
    const col = i % FONT_COLS
    const row = Math.floor(i / FONT_COLS)
    ctx.fillText(
      CODE_CHARS[i],
      col * CELL_W + CELL_W / 2,
      row * CELL_H + CELL_H / 2,
    )
  }

  const texture = new CanvasTexture(canvas)
  // No filtering and no mipmaps: a glyph texel is meant to land on an emitter,
  // and anything that blends neighbouring texels turns the letterforms to mush
  // at exactly the size they are read at.
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  // The shader addresses the atlas by row from the top, matching how the canvas
  // was drawn. Leaving three's default flip on would mirror that vertically and
  // print every glyph upside down.
  texture.flipY = false
  texture.needsUpdate = true

  return texture
}
