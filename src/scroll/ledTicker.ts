/**
 * A scrolling LED sign: text in a 5×7 dot font, crawling right-to-left across a
 * strip of lamps, lit in the hero wall's colour ramp. Runs under the contact
 * set like a broadcast crawl.
 *
 * Plain 2D canvas: a strip ~110 lamps wide by 7 tall is a few hundred arcs a
 * frame, so it costs next to nothing, and it only runs while the contact page
 * is on screen (see CrtChannels).
 */
import { LED_PALETTE } from '../systems/ledPanel'

/* Row-major, '#' = lit. Widths vary (punctuation is narrow); one blank column
   is added between glyphs when the message is laid out. */
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.####'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '##', '.#', '#.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '*': ['..#..', '..#..', '.###.', '#####', '.###.', '..#..', '..#..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
}

/** Lays a message out as columns of 7 booleans (one blank column per gap). */
export function layoutTicker(text: string): boolean[][] {
  const cols: boolean[][] = []
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']
    for (let x = 0; x < g[0].length; x++) cols.push(g.map((row) => row[x] === '#'))
    cols.push(new Array(7).fill(false))
  }
  return cols
}

/**
 * Draws one frame. `offset` is in lamps and wraps, so the crawl loops seamlessly.
 * Lit lamps take the ramp colour for their screen position, drifting with time;
 * unlit lamps stay faintly visible so the strip reads as hardware when idle.
 */
export function drawTicker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cols: boolean[][],
  offset: number,
  timeMs: number,
): void {
  const pitch = h / 7
  const r = pitch * 0.34
  const n = Math.ceil(w / pitch)
  const start = Math.floor(offset)
  const t = timeMs * 0.00012
  ctx.clearRect(0, 0, w, h)
  for (let i = 0; i < n; i++) {
    const col = cols[(start + i) % cols.length]
    const x = (i + 0.5) * pitch
    // the ramp, slid along the strip over time
    const g = (((i / n) * 1.6 + t) % 1) * LED_PALETTE.length
    const c0 = LED_PALETTE[Math.floor(g) % LED_PALETTE.length]
    const c1 = LED_PALETTE[(Math.floor(g) + 1) % LED_PALETTE.length]
    const f = g - Math.floor(g)
    const lit = `rgb(${(c0[0] + (c1[0] - c0[0]) * f) | 0},${(c0[1] + (c1[1] - c0[1]) * f) | 0},${(c0[2] + (c1[2] - c0[2]) * f) | 0})`
    for (let y = 0; y < 7; y++) {
      ctx.fillStyle = col[y] ? lit : 'rgba(255,255,255,0.07)'
      ctx.beginPath()
      ctx.arc(x, (y + 0.5) * pitch, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
