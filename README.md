# web-perf — performance test fork of the portfolio

A performance-optimized copy of the portfolio, built to be deployed and measured
on real (especially low-end) hardware. The original repo is untouched.

## Prime directive: the look never changes

Every change here is either **visually lossless** (identical on all devices) or
**opt-in** (only applies when a URL flag asks for it). The LED wall — its shader,
dot matrix, colours, palette ramp and glitch logic — was **not touched at all**.
The default deployment is pixel-identical to the original.

## Current status (Aug 2026)

Shipped baseline (this commit): the visually-lossless wins below + the opt-in
quality tiers + the stats/log HUD. An experimental reduced-motion toggle and an
FPS cap were tried and **removed** — the FPS cap corrupted frame timing, and the
toggle's backdrop-blur button cost a per-frame composite over the live canvas.

Open item: on a weak GPU (a U-series laptop iGPU, or a phone) the full-quality
scene is bottlenecked by the **glass transmission pass**, not by download size.
The next step under discussion is an auto-applied lighter profile for weak
devices (lower DPR + cheaper glass), leaving strong machines untouched.

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

### Automatic quality tiers (auto-selected from the device's GPU)

At load the app reads the real GPU (WebGL unmasked renderer string) plus CPU
cores / RAM / mobile signals and picks a tier — so a weak machine gets the fast
settings automatically while a strong one stays at full quality:

- **high** — Apple Silicon, desktop discrete GPUs (NVIDIA/AMD RX/Arc). DPR up to
  2, transmission full-res — **identical to the original.** Strong machines are
  never downgraded.
- **med** — integrated AMD. DPR 1.5, transmission 0.6.
- **low** — Intel integrated (Iris/UHD/HD) and mobile. DPR 1.25, transmission
  0.4. This is what makes a U-series laptop / phone fluid.

Open `?stats=1` and the HUD shows the detected GPU and the chosen `tier·source`.
A `?tier=` param always overrides the auto choice.

| Flag | Does |
| --- | --- |
| `?stats=1` | FPS / draw-call HUD — also shows the detected **GPU** and **tier·source**. |
| `?tier=high` | Force full quality (DPR 2, transmission 1.0) — the original, on any device. |
| `?tier=med` | Force DPR 1.5, transmission 0.6. |
| `?tier=low` | Force DPR 1.25, transmission 0.4. |
| `?dpr=1.5` | Override just the DPR cap (isolate one lever). |
| `?transmission=0.5` | Override just the transmission-pass scale. |
| `?log=1` | Real-time FPS graph **plus** per-frame CSV recording. A bottom bar shows `● REC N frames · <section>`; press **L** (or the button) to download the log, **R** to reset. |

Flags combine, e.g. `?stats=1&tier=low` or `?log=1&tier=low`.

### Recording a scroll for analysis (`?log=1`)

Open `/?log=1`, scroll slowly from the very top to the very bottom letting each
project settle, then press **L** to download `perf-log-*.csv`. Each row is one
frame: `time_ms, fps, frame_ms, scroll, section, drawcalls, triangles, dpr`. The
`section` column names exactly where you are — including project→project
transitions like `Works · BhashaBuddy → Satark.ai` — so a drop can be pinned to
the moment it happens rather than guessed at from a screenshot.

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
