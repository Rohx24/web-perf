/**
 * Performance quality tiers, auto-selected from the device's specs at load.
 *
 * The scene's cost floor is the glass transmission pass — a whole-scene re-render
 * every frame. Strong GPUs eat it; weak integrated GPUs and phones choke on it.
 * So at load we read the real GPU (via WebGL's unmasked renderer string), plus
 * CPU cores / RAM / mobile signals, and pick a tier:
 *
 *   high — desktop discrete GPUs and Apple Silicon. Identical to the original
 *          (DPR up to 2, transmission at full resolution). Strong machines are
 *          never downgraded.
 *   med  — midrange / integrated AMD.
 *   low  — Intel integrated (Iris/UHD/HD) and mobile: DPR 1.25, transmission 0.4.
 *          This is what turns a U-series laptop / phone from a slog into fluid.
 *
 * A `?tier=high|med|low` URL param always overrides the auto choice (force the
 * original look anywhere, or force low to test). `?dpr=` / `?transmission=` /
 * `?fps=`-style fine overrides still apply on top.
 *
 * Nothing here mutates per frame, and nothing here touches the LED wall.
 */

export type Tier = 'high' | 'med' | 'low'

export interface Quality {
  tier: Tier
  dprMax: number
  transmissionScale: number
  showStats: boolean
  /** 'auto' (from specs), 'url' (forced by ?tier=), or 'default' (fallback). */
  source: 'default' | 'url' | 'auto'
  /** Human-readable detection detail for the HUD (GPU string or the rule hit). */
  detected: string
}

const PRESETS: Record<Tier, Pick<Quality, 'dprMax' | 'transmissionScale'>> = {
  high: { dprMax: 2, transmissionScale: 1 },
  med: { dprMax: 1.5, transmissionScale: 0.6 },
  low: { dprMax: 1.25, transmissionScale: 0.4 },
}

/** Reads the unmasked GPU renderer string via a throwaway WebGL context. */
function readGpuRenderer(): string {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return ''
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
    // Free the throwaway context immediately.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return String(renderer || '')
  } catch {
    return ''
  }
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/android|iphone|ipod|windows phone|iemobile|blackberry/i.test(ua)) return true
  // iPadOS reports a desktop UA — catch it via touch + coarse pointer.
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches
  if ((navigator.maxTouchPoints ?? 0) > 1 && coarse && /ipad|macintosh/i.test(ua)) {
    return true
  }
  return false
}

/** Picks a tier from the device's specs. Errs toward `high` when unsure, so a
 *  capable machine is never wrongly downgraded (which would break the look). */
function detectTier(): { tier: Tier; detected: string } {
  if (isMobile()) return { tier: 'low', detected: 'mobile' }

  const gpu = readGpuRenderer()
  const g = gpu.toLowerCase()

  // Apple Silicon + desktop discrete GPUs → full quality.
  if (/apple m\d|apple gpu/.test(g)) return { tier: 'high', detected: gpu }
  if (/nvidia|geforce|\brtx\b|\bgtx\b|radeon rx|radeon pro|\barc\b/.test(g)) {
    return { tier: 'high', detected: gpu }
  }
  // Intel integrated graphics (the U-series case) → low.
  if (/intel|iris|uhd graphics|hd graphics/.test(g)) return { tier: 'low', detected: gpu }
  // AMD integrated (Vega / Radeon Graphics, no RX) → med.
  if (/amd|radeon/.test(g)) return { tier: 'med', detected: gpu }

  // No usable GPU string — fall back to CPU cores / RAM.
  const cores = navigator?.hardwareConcurrency ?? 8
  const mem = (navigator as unknown as { deviceMemory?: number })?.deviceMemory ?? 8
  if (mem <= 4 || cores <= 4) return { tier: 'low', detected: `cpu:${cores}c mem:${mem}` }
  if (mem <= 8 || cores <= 6) return { tier: 'med', detected: `cpu:${cores}c mem:${mem}` }
  return { tier: 'high', detected: gpu || `cpu:${cores}c mem:${mem}` }
}

function readParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function resolve(): Quality {
  const params = readParams()

  let tier: Tier
  let source: Quality['source']
  let detected: string

  const requested = params.get('tier')
  if (requested === 'high' || requested === 'med' || requested === 'low') {
    tier = requested
    source = 'url'
    detected = 'forced by ?tier'
  } else {
    // DEFAULT: auto-select from the device's specs.
    const auto = detectTier()
    tier = auto.tier
    source = 'auto'
    detected = auto.detected
  }

  const preset = PRESETS[tier]

  const dprOverride = Number(params.get('dpr'))
  const transOverride = Number(params.get('transmission'))

  return {
    tier,
    dprMax: Number.isFinite(dprOverride) && dprOverride > 0 ? dprOverride : preset.dprMax,
    transmissionScale:
      Number.isFinite(transOverride) && transOverride > 0
        ? transOverride
        : preset.transmissionScale,
    showStats: params.get('stats') === '1' || params.get('log') === '1',
    source,
    detected,
  }
}

/** Resolved once at module load and shared everywhere. */
export const QUALITY: Quality = resolve()
