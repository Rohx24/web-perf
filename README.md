# web-perf — performance test fork of the portfolio

A performance-optimized copy of the portfolio, built to be deployed and measured
on real (especially low-end) hardware. The original repo is untouched.

## Prime directive: the look never changes

Every change here is either **visually lossless** (identical on all devices) or
**opt-in** (only applies when a URL flag asks for it). The LED wall — its shader,
dot matrix, colours, palette ramp and glitch logic — was **not touched at all**.
The default deployment is pixel-identical to the original.

## What changed, and why

### Always-on (visually lossless on every device)

| Change | Before | After | Effect |
| --- | --- | --- | --- |
| Hero model `metal-letter.glb` — meshopt-compressed (no decimation; geometry + normals preserved) | 57 MB | **2.49 MB** | The site can actually download + parse on a phone. Same silhouette, same surface. Decoded by drei's bundled MeshoptDecoder — no code change, no CDN. |
| Removed unused `rd-logo.glb` | 55 MB | 0 | Dead weight; referenced nowhere. |
| Project previews → WebP (q90, same dimensions) | ~2.7 MB | **~0.3 MB** | Faster load; imperceptible quality change. |
| Removed unused `public/projects/` | 1.8 MB | 0 | Dead weight; referenced nowhere. |
| Pause the render loop while the tab is hidden (`frameloop`) | always rendering | paused when hidden | No visual change (nothing is on screen); saves battery/thermal, which protects sustained FPS. |

**`public/` total: 112 MB → 2.8 MB.**

### Opt-in quality tiers (for testing only — default is identical to the original)

The default tier is `high`, which reproduces the original exactly: DPR capped at
2, transmission (glass refraction) pass at full resolution. Lower tiers only
reduce fill-rate — the single thing a weak GPU is short on — and are **never**
selected automatically unless you ask.

Append to the URL:

| Flag | Does |
| --- | --- |
| `?stats=1` | Shows an FPS / draw-call / triangle / DPR HUD (top-left). |
| `?tier=high` | Default. DPR max **2**, transmission **1.0** — identical to the original. |
| `?tier=med` | DPR max **1.5**, transmission **0.6**. |
| `?tier=low` | DPR max **1.25**, transmission **0.4**. Biggest fill-rate cut. |
| `?auto=1` | Picks a tier from `hardwareConcurrency` / `deviceMemory` (conservative — errs toward `high`). |
| `?dpr=1.5` | Override just the DPR cap (isolate one lever). |
| `?transmission=0.5` | Override just the transmission-pass scale. |

Flags combine, e.g. `?stats=1&tier=low`.

### Suggested test matrix (run each on the target device with `&stats=1`)

1. `/?stats=1` — the identical-to-original baseline. Note load time + scroll FPS.
2. `/?stats=1&tier=med`
3. `/?stats=1&tier=low`
4. Isolate levers: `/?stats=1&dpr=1.5`, then `/?stats=1&transmission=0.4`.

On a high-DPI phone, `tier=low` drops DPR from 2 → 1.25 (a large fragment saving)
and the transmission pass to 0.4× — this is what should turn a laggy scroll
fluid. Because DPR reduction on a dense phone screen stays sharp to the eye, and
the transmission softening only affects the *interior* refraction of the glass
block, the trade is intended to be imperceptible. Decide from the numbers what
you're willing to ship as the default.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
```

## Deploy to Vercel

Framework preset: **Vite**. Build command `npm run build`, output directory
`dist`. No env vars required.

## Not done (optional follow-ups)

- Fonts are still `.ttf` (~72 KB). WOFF2 would save ~30 KB but risks glyph
  rendering changes, so it was left alone.
- The main JS chunk is ~400 KB gzip (Three.js + React + drei). Could be
  code-split, but it's needed up front anyway.
