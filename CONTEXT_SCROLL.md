# RD Portfolio — scroll sequence context (handoff)

Read this together with `CONTEXT.md` (the hero/room/LED-wall context). This file
documents the **post-hero scroll experience** built in `src/scroll/`.

## The project in one paragraph

An immersive scroll-driven WebGL portfolio for **Rohit Diggi**. The hero is a
curved architectural LED-screen room with a **glass RD logo** (a GLB) floating
in front of it. Scrolling flies the camera *through* the logo and the wall into
a dark "project void" where his work streams past as 3D UI-window panes, then a
pixel dissolve resolves into a white about-me screen.

- **Repo:** `/Users/rohitdiggi/Trial website/portfolio` → GitHub `Rohx24/rd-portfolio`
- **Stack:** Vite 8 · React 19 · React Three Fiber v9 · @react-three/drei v10 · three r185 · TypeScript. **No GSAP/Lenis** — a tiny custom module-level scroll store is used instead.
- **Run:** `npm run dev -- --port 5175 --strictPort` (dev server has been run on 5177 during this work via `npx vite --port 5177`).
- **Git:** currently ~2 commits **ahead of origin, not pushed**. Never push unless explicitly asked in that message.

> ⚠️ There is a **separate, unrelated** project at `~/Resume website v2` (a Next.js
> experiment). It is NOT this repo. Do not touch it.

## Hard constraints (the user is emphatic about these)

1. **Never modify the hero or the main LED wall.** The camera flies through them; that's fine. Do not edit `src/scene/*` or the hero `src/systems/*` internals. (The one exception already made: hero glass iridescence bumped in `src/systems/heroConfig.ts`.)
2. **Shaders:** run `npm run audit:shaders` after touching any GLSL. A backtick inside GLSL or a local named after a reserved word silently kills the shader and the room goes black. (The scroll subsystem uses **no GLSL** — all canvas/DOM — so this mainly concerns the hero.)
3. **Preview-pane caveat:** Claude's in-app browser detaches, throttles rAF, and serves stale/black frames. Verify with DOM/JS reads (`document.querySelector`, computed styles) and in the user's real Chrome — not by trusting screenshots (which are also downscaled to 800px).

## The scroll sequence (S = normalized scroll 0…1, page is `pages: 7` tall)

Driven entirely by one value `S` from `scrollProgress()`. Phases (see `scrollConfig.ts`):

| S range | Beat |
| --- | --- |
| 0.00–0.06 | Hero; camera zooms toward the LED wall (through the RD logo at z≈−2.2) |
| 0.06–0.16 | **WORKS** intertitle rakes diagonally across the **hero LED wall** |
| ~0.12–0.20 | **Dive**: warp streaks + "combobulation" glitch as camera punches the wall (z≈−9) |
| 0.20–0.80 | **Yaw window gallery**: 6 project panes stream past, slotting to centre |
| 0.80–1.00 | **Finale**: bottom-up pixel dissolve → white about-me screen |

## Files (`src/scroll/`)

- **`scrollProgress.ts`** — module-level scroll store. `scrollProgress()`, plus `scrollVelocity()` / `tickScrollVelocity(dt)` (smoothed scroll speed, used to tell "moving" vs "settled").
- **`scrollConfig.ts`** — single source of truth for all timings/positions. Key knobs: `pages:7`, `phase.galleryStart:0.20 / galleryEnd:0.80`, `gallery.featureAhead:8.5`, `gallery.slotDead:0.34`, `void.fadeInS:0.16`, `intertitle.worksInS:0.06 / worksOutS:0.16`. Helpers `cameraZ(s)`, `cardCentreS(i)`, `cardSlotHalf()`, `cardBaseZ(i)`.
- **`ScrollController.tsx`** — owns the camera each frame (default priority, so it runs *before* CursorDistortionSystem's priority-1 render). Flies camera down −Z. Also calls `tickScrollVelocity(dt)`.
- **`WorksIntertitle.tsx`** + CSS — the "WORKS" title. Russo One font (same as hero wall, `/fonts/russo-one.ttf`), white outline, blue→pink flowing gradient, **per-letter arc bend** to match the curved wall, sweeps diagonally (sideways + slight down).
- **`WarpStreaks.tsx`** — instanced additive light streaks over the wall crossing (camera-parented).
- **`CombobulationFlash.tsx`** — RGB scanline glitch over the dive (camera-parented additive quad).
- **`VoidLedBackdrop.tsx`** — lightweight LED tunnel behind the gallery. One cylinder, colour flashes between project accents, **no dot matrix** (deliberately cheap).
- **`ProjectYawWindowGallery.tsx`** — the panes (see below). The big/complex one.
- **`ProjectOverlay.tsx`** — minimal DOM chrome (brand tag, rotated "WORKS" side label, scroll hint), fades out into the finale.
- **`OutroWireframe.tsx`** — the finale. A `<canvas>` pixel dissolve that rises from the bottom, then a white about-me screen (`.rd-white`) slots up with name/role/about/skills/contact.
- **`useScrollSequence.ts`** — thin helper hook (glitch/warp/outro strength getters).
- **`projects.ts`** — the 6 projects (data).

Wiring is in `src/App.tsx` (added `<ScrollController/>`, `<VoidLedBackdrop/>`, `<ProjectYawWindowGallery/>`, `<WarpStreaks/>`, `<CombobulationFlash/>` inside the Canvas; `<ProjectOverlay/>`, `<WorksIntertitle/>`, `<OutroWireframe/>` + a scroll-spacer div outside it). Canvas is pinned `position:fixed` via inline style; the spacer gives the page its height.

## The project panes (ProjectYawWindowGallery)

Each pane is a **16:9 glassmorphic UI-window** (title bar with traffic-light dots + category tag, a preview area, project title + tech chips, a big highlighted index number). The window chrome is drawn to a `CanvasTexture`; the card is a plane on a `<group>`.

**Motion / "slotting":** per-card `u = (S − cardCentreS)/half`. Within a deadzone (`slotDead`) the pane holds locked head-on; past it, it slides sideways (X), yaws (±38°) and recedes — so a small scroll snaps the next pane into centre. Cards fade via a visibility window.

**Live embeds:** panes with a `launchUrl` overlay the real site via drei `<Html transform>` (a DOM iframe transformed onto the pane). `EMBED = { offsetY:0.16, z:0.06, wPx:1280, hPx:720, scale:0.18 }`.

## ⚠️ THE UNRESOLVED PROBLEM (start here)

**Live iframes cannot be perfectly synced to a moving 3D pane.** drei `<Html transform>` repositions the DOM *after* WebGL renders, so during scroll the iframe **lags a frame** behind the pane and looks detached. This is a hard limitation of DOM-over-canvas — you cannot texture a live cross-origin iframe into WebGL.

An attempt was made to gate the embed on "centred AND scroll settled" (`centred * settled * (1-outro)` in `ProjectYawWindowGallery.tsx` ~line 259). It has a bug: even when the centre card is settled (`scrollVelocity()`≈0, `u`≈0), `show` computes 0 and the embed never appears. This was being debugged when the session ended — **but this whole approach is being abandoned** in favour of the plan below, so don't sink time into fixing it.

## ✅ THE AGREED NEXT PLAN (implement this)

The user will **generate a short preview video for each project**. The panes should:

1. **Show the preview video as a texture on the 3D pane** (`VideoTexture` on the plane) instead of the live iframe. This is part of WebGL → perfectly synced, rotates/slots with no lag, matches the Alche.studio look the user keeps referencing.
2. **Click a pane → it expands to a fullscreen window** showing the **actual live site** (the iframe, now full-screen where lag doesn't matter). Close it with a **Mac-style close button** and/or the **Esc key**.

So: video texture for the ambient/scrolling state; live iframe only in the click-to-expand fullscreen modal. Keep the "Visit ↗" affordance too.

## The 6 projects (`projects.ts`) + URL mapping

1. **Satark.ai** (`01`, cyan) — scam/fraud detection. No URL yet.
2. **DriveDash** (`02`, orange) — in-car nav dashboard, phone GPS fused at 10 Hz. **AI-generated demo video coming** (this is the first video to wire in).
3. **BhashaBuddy** (`03`, purple) — conversational language companion. `launchUrl: parampara-one.vercel.app` ✅ confirmed.
4. **Parallel Risk-Assessment Agents** (`04`, blue) — multi-agent risk eval. `launchUrl: prism-risk-rho.vercel.app` ✅ confirmed (site is "PRISM").
5. **Hybrid Deep-Learning IDS** (`05`, green) — intrusion detection. `launchUrl: adaptive-honeypot-agent.vercel.app` ✅ confirmed.
6. **AI Boardroom** (`06`, pink) — AI-persona board that pressure-tests ideas. No URL yet.

## Still-open TODOs

- **Contact placeholders:** the finale/about screen needs the real **WhatsApp number** and **LinkedIn URL** (GitHub `github.com/Rohx24` and email `rohitjd.btech23@rvu.edu.in` are already wired).
- **Preview videos** per project (see plan above) — DriveDash first.
- Optional: a dedicated interactive **"THE STACK"** tech-grid section (discussed, not built; skills currently live as chips on the white about screen).
- The GLB `public/models/rd-logo.glb` is ~52 MB (over GitHub's soft limit) — worth moving to Git LFS.
