import { useEffect, useState } from 'react'

import { QUALITY, TIER_STORAGE_KEY, autoTier, type Tier } from './quality'

/**
 * Quality settings.
 *
 * Quality now defaults to LOW rather than to whatever the GPU string suggested,
 * because detection kept picking a tier machines could not hold. That is the
 * safe default, but it should not be the only option — this lets anyone raise
 * it on hardware that can take it, and the choice is remembered.
 *
 * Changing tier means rebuilding the renderer's pixel ratio and the
 * transmission buffer, which are read once at module load, so it reloads. That
 * is honest about what is happening rather than half-applying.
 */

const OPTIONS: { id: Tier | 'auto'; label: string; note: string }[] = [
  { id: 'low', label: 'Low', note: 'Smoothest. The default.' },
  { id: 'med', label: 'Medium', note: 'Sharper, still light.' },
  { id: 'high', label: 'High', note: 'Full resolution. Needs a real GPU.' },
  { id: 'auto', label: 'Auto', note: 'Guess from this device.' },
]

export function Settings() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (id: Tier | 'auto') => {
    try {
      if (id === 'auto') localStorage.setItem(TIER_STORAGE_KEY, autoTier())
      else localStorage.setItem(TIER_STORAGE_KEY, id)
    } catch {
      // storage blocked — fall back to the URL, which resolve() also honours
      window.location.search = `?tier=${id === 'auto' ? autoTier() : id}`
      return
    }
    window.location.reload()
  }

  return (
    <>
      <button
        className="rd-settings-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Quality settings"
        title="Quality settings"
      >
        ◍
      </button>

      {open && (
        <div className="rd-settings" role="dialog" aria-label="Quality settings">
          <h4>Quality</h4>
          <ul>
            {OPTIONS.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => choose(o.id)}
                  aria-current={o.id === QUALITY.tier ? 'true' : undefined}
                >
                  <span className="rd-settings-label">{o.label}</span>
                  <span className="rd-settings-note">{o.note}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="rd-settings-now">
            now: {QUALITY.tier} · {QUALITY.source}
          </p>
        </div>
      )}
    </>
  )
}
