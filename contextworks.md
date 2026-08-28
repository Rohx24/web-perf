# WORKS / Project section — full context & design

Reference: **alche.studio** (Works section). This doc = the agreed design for Rohit's portfolio post-hero section, so context survives. Hero is locked; everything here is the scroll section AFTER it.

---

## 1. The scroll journey (top → bottom)

1. **Hero (scroll 0)** — LOCKED. Curved LED-dot wall + glass "RD" logo + "ROHIT DIGGI" wordmark + top nav. Do NOT rework. One rule: wall must **never go fully black** — always some colour (fieldDark program removed from both rosters).
2. **WORKS title** — a big translucent-fill + white-outline "WORKS" makes ONE slow tilted diagonal pass across the LED wall (top-left→bottom-right), then fades. Plays once. Logo eases back on Z a little (keeps full size) to clear what's coming.
3. **Project frames (the carousel)** — the core. See §2.
4. **Wall backlight behind frames** — faint dark colour bleed of the featured image. See §3.
5. **Outro** — white about/finale screen (later, not focus).

---

## 2. The frames (project cards) — THE key mechanic

- **Frames are CURVED, not flat.** Each is a horizontal cylinder-section that bends concavely toward the viewer, same curvature as the LED wall — reads as mounted on the curved wall, wrapping around. (alche shot: exiting frame visibly bends at its edges.)
- **Motion = rising orbit, right → center → left:**
  - Enters from the **RIGHT, slightly LOW**.
  - Sweeps to **CENTER** = **largest, nearest, most head-on** = the featured moment.
  - Exits to the **LEFT, slightly HIGH**.
  - So the whole travel is a **shallow upward arc** (bottom-right → center → top-left). A gentle rising spiral, NOT a flat horizontal slide.
- **Yaw:** frames rotate to stay **tangent to the cylinder** — head-on at center; on the right the left edge leads, on the left the right edge leads.
- **Depth/scale:** big+near at center, receding+shrinking to both sides. Only featured + immediate neighbours visible; logo peeks through the gaps between frames.
- Featured frame = **crisp, bright, full-colour** project image, 16:9, rounded corners, subtle glass/chromatic edge.
- Scroll drives it; each project slots to center in turn.
- Open tuning Qs: how MUCH rise across the sweep (subtle ~one frame-height?), curve amount, spacing.

**BUILT (`src/scroll/ProjectFrames.tsx`) — matches reference:** custom ShaderMaterial (vertex bends by `uBend` = flat at centre, curves off-centre; fragment = image linearised `pow(2.2)` + rounded-rect mask via `uRadius`/`uAspect` + `uOpacity`). Motion per frame from `galleryActive(s)`: `p = active − index`; `θ=−p·arcSpacing`, `x=R·sinθ`, `z=R(cosθ−1)−frontDist`, `y=p·rise`; **`rotateY(θ)`** (inward-facing yaw — side frames hinge on inner edge, outer swings back) + **`rotateX(−p·pitch)`** (3D tumble). Config `SCROLL.gallery`: `arcRadius 6, arcSpacing 0.66, frontDist 6, rise 1.15, pitch 0.14, bend 0.62, size [4.4,2.475] (margin, not filling), corner 0.06, shrink 0.15, visSpread 1.1, visFade 0.55, dwell 0.34`.
- **Scroll pacing:** `galleryActive(s)` in scrollConfig applies a `dwell` (holds each frame parked at centre, then smoothsteps to next). `SCROLL.pages 16` (longer scroll). Dev: `window.__scroll(v)` jumps the eased scroll (DEV only, in scrollProgress.ts).
- BhashaBuddy image had a stray eXIf orientation chunk (rendered rotated 90°); re-encoded via scratchpad `pngcrop.mjs` to strip it. All 4 previews clean 1920×1080.
- **Responsive size:** frame is NOT a fixed metre size on screen — in useFrame it computes `visW = 2·frontDist·tan(fov/2)·aspect` and scales so the featured frame fills `fillFrac (0.66)` of the viewport WIDTH whatever the aspect. Fixes "too much empty space on wide monitors" (fixed metres covered less width on a wide Chrome than in the narrow Claude pane).

---

## 3. Wall backlight (behind the frames) — got this wrong twice, get it right

- **IT IS DONE ON THE EXISTING LED WALL PANELS/DOTS.** Same dot-matrix wall from the hero. The existing panels/LEDs light up faintly with the image's colours. It goes **IN THE WALL SHADER (ledWallShader.ts), on the existing dots** — NOT a separate mesh, NOT an overlay in front. (Confirmed by Rohit.)
- It is **NOT the image displayed brightly**. It is a **faint, dark, heavily-blurred COLOUR BLEED** of the featured project's image on those dots — colours leaking softly like backlight/reflection.
- Wall stays ~80–90% **black**; you read **colour, not a picture** (no shapes/text). Shifts hue as featured project changes.
- My earlier in-shader `uEcho` attempt was the RIGHT PLACE (through the existing dots) but WAY too bright/sharp → rejected. Correct = same mechanism dialed down hard (faint, dark, heavy blur). The separate "glow blob" mesh (ProjectWallEcho) was also wrong (a layer in front) → deleted.

- **PROJECTOR MODEL (key):** the wall hue is a **huge, out-of-focus, SCALED-TO-FILL-THE-WHOLE-SCREEN** projection of the featured image — much bigger than the frame, not a small 16:9 region. Think: light source → the frame (sharp "slide") in front → behind it a giant unfocused projection of the SAME image on the wall. Frame = focused/sharp/small; wall = same image blown up huge + blurred + dark.
- **IT MOVES + CONVERGES:** the frame slides in from the **RIGHT → center**; the blurry hue projection slides in from the **LEFT → center** (opposite directions). They meet at center, so at the featured moment the sharp frame sits right in front of its own giant blurry hue. Hue sweeps/shifts as projects change.
- Open Q: exactly how faint (barely-there tint vs clearly-coloured-but-dark). Tied to featured pane (confirmed).

---

## 4. DOM overlay (over everything)

- Bottom-left: **date · big title · subtitle · tag chips**, synced to featured project.
- Bottom-right: **"More Works ↗"**.
- Far-left vertical: small **"WORKS"** label.
- Top: nav (ROHIT DIGGI · Work/About/Lab · Contact↗).
- Lives in `ProjectOverlay.tsx` (`.rd-active` etc.), already syncs to gallery phase.

---

## 5. Projects (exactly 4) + colours

All previews in `public/previews/`, all **1920×1080 (16:9)**.

| # | Project | file | base | dominant hue → accent |
|---|---------|------|------|------------------------|
| 01 | Satark.ai | satark.png | near-black | teal/emerald `#10b981` |
| 02 | BhashaBuddy | bhashabuddy.png | **light/cream** | warm coral/peach `#FB8C6B` |
| 03 | Parallel Risk-Assessment | parallel-risk.png | near-black | violet `#8b5cf6` |
| 04 | AI Boardroom | ai-boardroom.png | near-black | gold/amber `#D6A34E` (green/red data chips) |

3 dark + 1 light. AI Boardroom captured from live URL via thum.io + cropped to 16:9 (scratchpad `pngcrop.mjs`). Data in `src/scroll/projects.ts`, `SCROLL.gallery.count = 4`.

---

## 6. Current code state

**Built & correct:** hero (locked); WORKS one-time diagonal pass (translucent + white outline); wall never all-black; 4-project data + images + matched accents.

**Deleted / reverted (do NOT resurrect without re-spec):**
- `ProjectYawWindowGallery.tsx` — old cards + glow/halo. DELETED.
- `ProjectWallEcho.tsx` — smooth glow-blob mesh. DELETED.
- In-shader bright image-on-dots projection (uEcho*, TextureLoader echo, LED.echo config). REMOVED.
- `uWallDim` near-black wall dim. REMOVED.

So right now post-hero = WORKS pass → wall keeps normal colour programmes → NO frames, NO backlight yet. Clean baseline, ready to build §2 + §3.

---

## 7. Key files

- `src/systems/ledWallShader.ts` — wall dot-matrix shader (fragile: run `npm run audit:shaders` after ANY edit; no backticks in GLSL comments).
- `src/systems/LedWall.tsx` — wall material + scheduler; `WORKS_ROSTER` (colour fields, no fieldDark); WORKS uniforms drive.
- `src/systems/ledWallConfig.ts` — `LED.works` (WORKS title params), `LED.programs.enabled` (hero roster, no fieldDark).
- `src/scroll/scrollConfig.ts` — `SCROLL.phase` (galleryStart 0.34 etc.), `SCROLL.gallery` (arc params leftover from old build).
- `src/scroll/projects.ts` — 4 projects.
- `src/scroll/ProjectOverlay.tsx` — DOM copy.
- `src/App.tsx` — scene composition.
- `src/systems/HeroController.tsx` — logo scroll-out (Z pushback only, keeps full size).

## 8. Rules / gotchas

- Hero at scroll 0 = untouched. Only hook logo position/scale on scroll.
- Wall never fully black.
- WORKS plays once (not looping), tilted, translucent+outline.
- Wall backlight = faint/dark/blurred colour, NOT a displayed picture, NOT a smooth blob.
- Frames = curved (cylinder sections), rising right→center→left orbit, yaw tangent.
- Eased scroll caps 0.22/s → big scroll jumps take seconds to settle when testing.
- After shader edits: `npm run audit:shaders`, then close tab + `preview_start` fresh (HMR goes stale).
- Preview pane screenshots intermittently time out (compositing); external-site screenshots work.
