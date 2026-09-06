/**
 * The LED wall, as a 2D dot matrix.
 *
 * This is the contact screen's own drawing routine, lifted verbatim so the tube
 * and the abyss run the same wall rather than two lookalikes. Values are
 * unchanged: pitch 26, radius 3.4, the four-colour ramp, the same three sines.
 *
 * It is also the cheap way to do this. A grid of ~1200 arcs redrawn at 20fps
 * costs a fraction of a per-pixel noise shader running every frame at device
 * resolution — which is what the tube used to do, and why it dragged.
 */

/** violet / cyan / orange / pink — the hero wall's ramp, no green. */
export const LED_PALETTE = [
  [139, 109, 255],
  [34, 211, 238],
  [245, 158, 11],
  [236, 72, 153],
] as const

export interface LedPanelOptions {
  /** spacing between lamps, px */
  pitch?: number
  /** lamp radius, px */
  radius?: number
  /** overall brightness multiplier */
  gain?: number
}

/**
 * Paints one frame of the wall into `ctx`. Clears first, so it owns the surface.
 */
export function drawLedPanel (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeMs: number,
  opts: LedPanelOptions = {},
): void {
  if (w < 2 || h < 2) return
  const pitch = opts.pitch ?? 26
  const r = opts.radius ?? 3.4
  const gain = opts.gain ?? 1
  const t = timeMs * 0.001

  ctx.clearRect(0, 0, w, h)
  for (let y = pitch / 2; y < h; y += pitch) {
    for (let x = pitch / 2; x < w; x += pitch) {
      const u = x / w
      const v = y / h
      const f =
        (Math.sin(u * 5 + t * 1.6) +
          Math.sin(v * 3.5 - t * 1.1) +
          Math.sin((u + v) * 4 + t * 0.7)) /
        3
      const g = (f * 0.5 + 0.5) * LED_PALETTE.length
      const i0 = Math.floor(g) % LED_PALETTE.length
      const i1 = (i0 + 1) % LED_PALETTE.length
      const fr = g - Math.floor(g)
      const c0 = LED_PALETTE[i0]
      const c1 = LED_PALETTE[i1]
      const bright = (0.35 + 0.65 * (Math.sin(u * 11 + v * 9 + t * 3) * 0.5 + 0.5)) * gain
      const R = (c0[0] + (c1[0] - c0[0]) * fr) * bright
      const G = (c0[1] + (c1[1] - c0[1]) * fr) * bright
      const B = (c0[2] + (c1[2] - c0[2]) * fr) * bright
      ctx.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
