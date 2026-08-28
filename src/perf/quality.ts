/**
 * Performance quality tiers — a *test-harness* layer bolted on top of the site.
 *
 * PRIME DIRECTIVE: the shipped default must look pixel-identical to the original.
 * So the default tier is `high`, whose numbers reproduce the site's existing
 * behaviour exactly (dpr capped at 2, transmission pass at full resolution).
 * The lower tiers only ever *reduce* fill-rate, and they are never selected on
 * their own — they are opt-in, chosen by a `?tier=` / `?auto=1` URL flag — so no
 * capable device is ever downgraded without being asked.
 *
 * This lets a real device be measured against each setting (open `?stats=1`)
 * and the acceptable trade decided from data, not guessed.
 *
 * Everything here is read ONCE at load and frozen. Nothing here mutates per
 * frame, and nothing here touches the LED wall, its shader, colours or logic.
 */

export type Tier = 'high' | 'med' | 'low'

export interface Quality {
  tier: Tier
  /** Upper bound handed to <Canvas dpr={[1, dprMax]}>. 2 = the original. */
  dprMax: number
  /** renderer.transmissionResolutionScale. 1 = the original (full-res glass). */
  transmissionScale: number
  /** Whether the FPS / draw-call overlay is shown. */
  showStats: boolean
  /** How the tier was chosen, surfaced in the overlay for clarity. */
  source: 'default' | 'url' | 'auto'
}

/**
 * Tier presets. `high` is the untouched original; `med`/`low` trade a sliver of
 * refraction sharpness and pixel density (imperceptible on a high-DPI phone) for
 * fill-rate headroom on a weak GPU.
 */
const PRESETS: Record<Tier, Pick<Quality, 'dprMax' | 'transmissionScale'>> = {
  high: { dprMax: 2, transmissionScale: 1 },
  med: { dprMax: 1.5, transmissionScale: 0.6 },
  low: { dprMax: 1.25, transmissionScale: 0.4 },
}

/**
 * A deliberately conservative device sniff, used ONLY when `?auto=1` is set.
 * Reports `low` for clearly memory/thread-starved devices, `med` for midrange,
 * and otherwise `high`. It intentionally errs toward `high` — a false downgrade
 * on a capable device would break the visual promise, so the bar to step down is
 * kept high. (A weak laptop iGPU can still slip through this; that is what the
 * manual `?tier=` override is for.)
 */
function detectTier(): Tier {
  const cores = navigator.hardwareConcurrency ?? 8
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  if (mem <= 4 || cores <= 4) return 'low'
  if (mem <= 8 || cores <= 6) return 'med'
  return 'high'
}

function readParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function resolve(): Quality {
  const params = readParams()

  let tier: Tier = 'high'
  let source: Quality['source'] = 'default'

  const requested = params.get('tier')
  if (requested === 'high' || requested === 'med' || requested === 'low') {
    tier = requested
    source = 'url'
  } else if (params.get('auto') === '1') {
    tier = detectTier()
    source = 'auto'
  }

  const preset = PRESETS[tier]

  // Fine-grained per-knob overrides, so a single lever can be isolated on a real
  // device (e.g. ?dpr=1.5 alone, transmission held at the tier's value).
  const dprOverride = Number(params.get('dpr'))
  const transOverride = Number(params.get('transmission'))

  return {
    tier,
    dprMax: Number.isFinite(dprOverride) && dprOverride > 0 ? dprOverride : preset.dprMax,
    transmissionScale:
      Number.isFinite(transOverride) && transOverride > 0
        ? transOverride
        : preset.transmissionScale,
    showStats: params.get('stats') === '1',
    source,
  }
}

/** Resolved once at module load and shared everywhere. */
export const QUALITY: Quality = resolve()
