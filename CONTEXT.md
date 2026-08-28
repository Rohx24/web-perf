# RD Portfolio — working context

Written so this project can be picked up cold, without the conversation that
produced it. It records what the thing is, how it is put together, and — most
importantly — the approaches that were tried and abandoned, so they are not
tried again.

## What it is

An immersive scroll-driven WebGL portfolio: a curved architectural room whose
wall is a giant LED screen, with a glass logo suspended in front of it.

React Three Fiber v9 / React 19 / three r185 / Vite 8 / TypeScript.

```bash
npm run dev -- --port 5175 --strictPort
```

This file covers the **hero** (room, LED wall, glass logo). The **post-hero
scroll sequence** — camera dive → "WORKS" title → 16:9 project panes → white
about screen — is a separate, additive subsystem in `src/scroll/`, documented in
`CONTEXT_SCROLL.md`. Read that too when working on the scroll experience.

## How it is built

**One explicitly-scoped subsystem per session.** Completed, in order: the room,
the engineering grid, architectural panels, the dot matrix, wall refinement, the
hero logo, the cursor lens, environmental typography, and the LED wall — then the
**post-hero scroll sequence** (`src/scroll/`, see `CONTEXT_SCROLL.md`). Finished
subsystems are not modified unless asked. (The hero glass was later bumped for
the RD-glow pass — iridescence/envMapIntensity up, roughness down; see
`heroConfig.ts`.)

**Never push to the remote unless explicitly asked in that message.** Commit
locally and say it is unpushed. A past "push it" authorises that one push.

## Layout

```
src/
  App.tsx                       scene graph
  scene/
    roomConfig.ts               radius 9, y -10..14, wrap 212 deg, fov 45
    layers.ts                   the stacking table — inset + renderOrder for
                                every layer. Inset is measured inward from the
                                wall radius, so larger inset = closer to camera.
    gridConfig.ts               grid cell 0.5m; major spacing derives from
                                PANELS so grid lines can only land on seams
    panelConfig.ts / panelLayout.ts / WallPanel.tsx / PanelLayer.tsx
    CurvedWall.tsx / RoomSurface.tsx / Room.tsx
    GridLayer.tsx / MarkerLayer.tsx / ScreenSpaceLines.tsx
  systems/
    LedWall.tsx                 the wall's light. One cylinder, one draw call.
    ledWallShader.ts            the dot lattice + gradient, per fragment
    ledWallConfig.ts            every knob on the wall
    ledPanels.ts                panel addressing — CPU owns the layout
    HeroSystem.tsx / HeroController.tsx / GlassMaterial.ts / heroConfig.ts
    CursorDistortionSystem.tsx / cursorLensShader.ts
    TypographySystem.tsx / typographyHalo.ts / typographyWord.ts
    wallTint.ts                 shared Color the wall writes, the crystal reads
  scroll/                       POST-HERO scroll sequence — see CONTEXT_SCROLL.md.
                                Camera dive, WORKS title, 16:9 project panes,
                                pixel-dissolve about screen. Additive, no GLSL.
                                Driven by one scroll value; no GSAP/Lenis.
```

## The LED wall

The wall is one cylinder. The dot lattice is computed **per fragment**: find the
cell of a metre-spaced grid, measure distance to its centre, shade a circle.
Cost is one draw call and does not depend on dot count. `fwidth` gives each dot
a rim exactly one pixel wide, so it is crisp at any resolution or pixel ratio,
and degrades to a smooth tint at distance rather than aliasing into moiré.

Everything is addressed in **metres of wall surface**, never pixels. That is why
the same numbers work on every display.

### Do not make the dots out of geometry

This was attempted twice — GL points, then instanced quads — and failed the same
two ways both times.

*Slow:* a wall this size needs six figures of dots, each running a vertex shader.

*Silently broken:* a dot's size had to be converted from metres to pixels by
hand, which meant feeding the shader the viewport height and field of view. When
that number was stale, zero, or measured before layout, every dot collapsed to
the minimum size. Sub-pixel dots do not visibly disappear — they dither, and a
wall of dithered dots averages into a smooth tint. So the lattice failed
*silently* and looked like a deliberate gradient. It cost hours across three
separate occurrences, including one where it worked on a 1x display and was
invisible on a 2x one.

The procedural version has no size uniform to get wrong.

### Other things that were tried and removed

- **Per-module on/off with a threshold.** Tiles switching against a cut-off,
  with a mosaic of per-tile brightness bias. It fought the lattice for attention
  and buried it. The picture behind the dots should be plain; the structure the
  eye picks up should be the dots.
- **Point lights carrying the wall's colour to the logo.** `light.layers` does
  **not** isolate lighting per object — three's forward renderer collects lights
  once per frame (gated only on *camera* layers) and applies the whole set to
  every lit material. Two lights aimed at the logo washed the entire room in a
  broad gradient, which is what buried the lattice. If the crystal needs its own
  light, use an `envMap`: that is a property of a material and reaches nothing
  else.
- **Brightness bands** (`sin` waves modulating level). Read as arbitrary patches
  lighting up. Removed.
- **A pure white palette stop.** Luminance 1.0 against purples near 0.60, so
  wherever the sweep crossed it the wall lit in a broad pale band that looked
  like a brightness effect and could not be tuned away. Palette stops are now
  held to roughly even luminance; hue varies freely, brightness does not.
- **A capsule-shaped cursor lens trail.** Deriving the shape from measured speed
  lags the hand and snaps back on stop, reading as a rigid streak. It is a plain
  disc now.
- **Multiplying typography halos.** Four live words each scaling level by 0.3
  compounded to 0.008 and took the whole wall to black. The darkest word wins
  instead.

## Panel addressing

Every sub-panel has a stable integer address. Panels are indexed across and up
the wall; each reserves a fixed block of ten sub-panel slots, so an index never
shifts because a neighbouring panel divides differently.

**The CPU owns the layout** (`ledPanels.ts`) and uploads it to the GPU as a
texture. The shader reads it rather than deciding for itself. This is
load-bearing: the obvious alternative is to hash panel coordinates on both
sides, but a hash built on `sin()` does not survive the trip between 64-bit
JavaScript and 32-bit GLSL. The two agree on most panels and diverge on
scattered ones, so clicks would occasionally address the wrong sub-panel with
nothing in either piece of code looking wrong. If the division rules change,
change `subGrid()` in `ledPanels.ts` and nowhere else.

**Light groups.** A panel split into a few sub-panels lights each on its own;
split into many (five or ten), they pair up — otherwise the wall reads as
confetti. An odd sub-panel out joins the last pair rather than standing alone,
so a row of five lights as two-and-three. A group is addressed by its *anchor*
(its first sub-panel), and `panelIndexAt()` resolves clicks to that same anchor,
so clicking and lighting can never disagree about which region is which.

**Overrides** use alpha as the "under manual control" flag, not a sentinel
colour — so a sub-panel commanded to black stays distinct from one that is
simply not commanded.

API: `panelIndexAt(metresX, metresY)`, `setPanelColour(index, r, g, b)`,
`clearPanelColour(index)`, `clearAllPanels()`, `PANEL_COUNT`.

Clicking a sub-panel commands it, cycling through colours deliberately unlike
anything the wall's palette produces, so an addressing mistake cannot hide.

## Environment quirks

- **The preview pane's JS/console realm is sometimes detached** from the page
  actually rendering. `document.querySelector('canvas')` may return troika's
  glyph canvas (300x150) rather than the renderer's. Pixel readback is often
  unavailable. **Visual isolation is the reliable debugging method:** exaggerate
  one value (force a huge dot, flat colour, zero intensity), screenshot, restore.
- **Screenshots lag.** Take two.
- **Screenshots are downscaled to 800px wide**, so fine detail like a dot
  lattice can look absent when it is rendering correctly. Verify structure by
  temporarily exaggerating it, not by squinting at a downscaled capture.
- **Stale Vite modules** cause blank or wrong renders after edits. Restart the
  dev server and hard-reload before diagnosing anything unexplained.
- `public/models/rd-logo.glb` is 52.7 MB, over GitHub's soft limit. Worth moving
  to Git LFS.

## A note on editing shaders

Run this after touching any shader, before reloading:

```bash
npm run audit:shaders
```

It catches three faults that all present identically from the outside — **the
mesh silently draws nothing and the room goes black**:

1. **A backtick inside the GLSL** (comments included) closes the `/* glsl */`
   template literal early. Has broken the build five times.
2. **A local named after a GLSL ES reserved word** — `active` is the one that
   bit us; the list also has `filter`, `input`, `output`, `flat`, `this`,
   `static`, `union`, `image`, `packed`, `short`, `long`. Hard compile error,
   whole shader rejected.
3. **A local shadowing a built-in** — `dot`, `distance`, `length`, `mix`,
   `step`, `mod`. Legal, so it compiles fine until something later calls the
   built-in, and then the error points at *the call*, not at the declaration.

### Why this matters more than it looks

A dead shader does not announce itself. The wall simply stops emitting, and the
room reads as **too dark** — so the instinct is to go tuning `intensity`, the
palette luminance and the per-programme levels, none of which can possibly help.
That is exactly what happened after the code programme went in: `float active`
killed the fragment shader, the wall drew nothing for an entire session, and the
symptom was misread as "programme brightness was never re-tuned after the
palette went dark."

**So: when the wall looks wrong, read the browser console before forming any
theory about brightness.** The console names the file, the line and the
identifier. Guessing costs hours; reading it costs seconds.

Also: do not edit these files by slicing on `s.index(...)` markers. Both shaders
in a file contain `void main() {`, so a slice between a fragment-shader marker
and `main` can invert and silently corrupt the file. Use exact-string edits.

## Next session — observations from alche.studio

Studied 2026-07-28. Their lighting model differs from ours in ways worth taking.

**The wall plays discrete programs, not one drifting gradient.** It cuts between
distinct states — deep blue with a bright pool behind the logo; near-black
monochrome with hard diagonal stripe bands; violet and brightly lit. Like a
video wall changing clips. Ours has exactly one program and never cuts.

**Panel on/off is a directional wipe, not twinkling.** Broad bands several
panels wide sweep across the wall at roughly 60 degrees, hard-edged. Panels are
lit where the band passes and dark outside it. This is what the early reference
crops showed. The right model is "a lit region sweeps across a dark wall", not
"panels switch at random".

**Two layers, not one.** Within a lit band, panels still vary in brightness
against each other — that is what stops a band reading as a solid painted
stripe. Per-panel variation rides on top of the wipe.

**Light travels wall to logo only.** The crystal takes the room's colour (blue
wall, blue crystal; monochrome wall, chrome crystal with rainbow dispersion on
the bevels). Nothing is cast from the logo back onto the wall.

**Their text ignores lighting entirely** — the wordmark is opaque white in every
frame whatever the wall does. Do not copy this directly: their type is a flat 2D
overlay sitting on top of the render, so it wins on contrast. Ours is
environmental, embedded in the wall surface, and genuinely needs its halo or it
drowns. Their look would be a separate HTML overlay, not a change to our 3D type.

**Their debug panel ships in production** — a live material inspector
(roughness 0.10, noiseScale 9.0) and a logo quaternion gizmo with a reset.
Worth copying the idea: every value in ledWallConfig.ts and heroConfig.ts is
currently tuned by editing a file and reloading, which cost most of one session.

### Cursor effect to build

Target: a soft billowing plume that trails the cursor — irregular and
volumetric, with a bright core at the pointer and a tail that curls as it moves.
Completely transparent: nothing is drawn, the light bends around its edges.

Distinct from the current CursorDistortionSystem, which displaces through a
clean circle. The shape needs to be an evolving soft volume rather than a disc,
so the displacement field wants noise-driven edges and a trailing tail — but
note the capsule-shaped trail was already tried and rejected for reading as a
rigid streak, so the tail has to come from the field itself, not from stretching
the shape along the travel direction.

### Where things stand

Done: procedural LED wall, sub-panel addressing with click-to-command, light
groups with pairing, even-luminance palette.

Open: the hero crystal has no dedicated light source since the point lights were
removed (see the note above on why layer-isolated lights do not work) — an
envMap plus a light the wall's material is immune to is the likely answer, and
the wall is a raw ShaderMaterial so it already ignores scene lights.
