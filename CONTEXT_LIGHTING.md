# Lighting reference — alche.studio

Observations from studying the site directly on 2026-07-28, kept separate from
`CONTEXT.md` because this is a design target rather than a record of our own
build. Everything here is something I saw, not something inferred; where I did
not see something, it is listed as open rather than guessed at.

## The wall is a display playing content, not a lit surface

This is the single biggest difference from ours. Their wall does not drift
through one gradient forever. It cuts between distinct programs, the way a video
wall cuts between clips. States seen in one sitting:

1. **Deep blue**, evenly lit, with a brighter pool behind the logo.
2. **Near-black monochrome**, with hard-edged diagonal stripe bands sweeping.
3. **Very dark**, faint stripes only — most of the wall effectively off.
4. **Violet**, brightly lit across most of the visible arc.
5. **Blue with graphics** — faint triangle glyph outlines at several sizes
   scattered across the panels, as *content displayed on the screen*.

That last one matters: the wall shows **shapes**, not only colour fields. Their
own logo mark appears on it as large soft outlines. So the right mental model is
a framebuffer being drawn into, which the dot lattice then samples — not a
lighting rig.

Ours currently has exactly one program and never cuts.

## Panel on/off is a directional wipe

Not twinkling, not random dropout. Broad bands — several panels wide, hard
edged, running at roughly 60 degrees — sweep across the wall. Panels are lit
where a band passes and dark outside it. This is exactly what the early zoomed
reference crops showed: dots plainly on inside a stripe, plainly off beside it,
with the boundary cutting across the lattice rather than following panel edges.

**Panels do go fully dark.** In the darkest states most of the wall is off, with
only a few faint bands surviving. So "off" is a real state, not just dim.

## Two layers, always

Within a lit band, panels still vary in brightness against each other. That is
what stops a band reading as a solid painted stripe — there is per-panel
variation riding on top of the sweep. Any implementation needs both: a
large-scale travelling region, and a per-panel modulation inside it.

## Light travels wall to logo only

The crystal takes the room's colour — blue wall gives a blue crystal, monochrome
wall gives a chrome/silver crystal with rainbow dispersion along the bevels,
violet wall gives a violet crystal. Nothing is cast from the logo back onto the
wall.

Their material panel ships in production and reads `roughness 0.10`,
`noiseScale 9.0`. Ours now sits at roughness 0.13, envMapIntensity 1.6 and
iridescence 1.0 (all bumped during the "make the RD glow" pass — see
`heroConfig.ts`), wavinessScale 5. So the direction was right; theirs is finer.

Note: the network log shows a six-face cube map at `/envmap/*.png`, and the
bevels carry strong directional specular. So it is an environment map **plus**
lights, not one or the other.

## Text

The wordmark is opaque white in every frame regardless of what the wall does —
no dimming, no halo, no blending with the light behind it.

**Do not copy this directly.** Their type is a flat 2D overlay sitting on top of
the render, so it can ignore the wall and win on contrast alone. Ours is
environmental — faint outlined letters embedded in the wall surface — and
genuinely needs its halo or it drowns. Their look would be a separate HTML
overlay layer, not a change to our 3D typography.

## Motion — described by the user, not observed

Screenshots cannot show motion, so none of this was seen directly. It is
recorded as described:

- **Text moves in marquee only** — horizontal travel. There is no vertical
  drift on the text.
- **The glyph has vertical motion**, up and down. The glyph and the text move
  differently, and separately.
- **The design is abstract.**

We have none of these yet. Worth building.

## Open — not yet observed
- **What drives the program changes.** Whether the wall's states cycle on a
  timer, respond to scroll, or respond to the pointer is unknown.
- **The cursor effect.** A displacement lens only reveals itself as a difference
  between two frames of identical content, and their wall content changes every
  frame, so stills tell nothing. Target described by the user: a transparent
  billowing plume trailing the cursor, bright core at the pointer, tail curling
  as it moves, light bending around its edges rather than anything being drawn.
  Note that a speed-derived capsule tail was already tried in our build and
  rejected for reading as a rigid streak — the tail has to emerge from the
  distortion field itself, not from stretching a shape along the travel vector.

## Worth stealing regardless

Their debug UI ships in production: a live material inspector and a logo
quaternion gizmo with a reset button. Every value in our `ledWallConfig.ts` and
`heroConfig.ts` is currently tuned by editing a file and reloading, and that
round-trip consumed a large part of one session. A small live panel would pay
for itself quickly.
