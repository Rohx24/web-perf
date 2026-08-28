/**
 * The LED wall, drawn procedurally.
 *
 * Every previous attempt at this made the dots out of geometry — one GL point,
 * then one instanced quad, per dot — and every one of them failed the same two
 * ways. They were slow, because a wall this size needs six figures of them and
 * each one runs a vertex shader. And they were fragile, because a dot's size had
 * to be converted from metres into pixels by hand, which meant feeding the
 * shader the viewport height and the field of view; when that number was stale
 * or wrong the dots collapsed below a pixel, and sub-pixel dots do not vanish
 * visibly — they dither, and a wall of dithered dots averages into a smooth
 * tint. The lattice failed silently and looked like a design choice.
 *
 * So there is no dot geometry here at all. The whole wall is one cylinder, and
 * the lattice is computed per *fragment*: work out which cell of a metre-spaced
 * grid this pixel falls in, measure its distance from that cell's centre, and
 * shade a circle. The cost is one draw call and does not depend on the number of
 * dots. The dots stay perfectly round at any resolution, and `fwidth` gives the
 * rim an edge exactly one pixel wide however close the camera gets — which is
 * something no amount of geometry could do.
 */

export const ledWallVertexShader = /* glsl */ `
varying vec2 vUv;
/** This fragment's position in screen space (0..1), so the works image can be
 *  projected across the wall like a projector — independent of the cylinder UV,
 *  the way alche's bgQuad projects each dot's screen position. */
varying vec2 vScreenUv;

void main() {
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreenUv = clip.xy / clip.w * 0.5 + 0.5;
  gl_Position = clip;
}
`

export const ledWallFragmentShader = /* glsl */ `
uniform vec3 uPalette[8];
uniform float uTime;

/** Wall size in metres, so the lattice can be spaced in real units. */
uniform float uArcLength;
uniform float uBandHeight;
/** Panel module size in metres, for the seams the dots stop short of. */
uniform float uPanelWidth;
uniform float uPanelHeight;
uniform float uSeamClearance;
uniform float uSubClearance;

uniform float uPitch;
uniform float uIntensity;
/** The soft dot emitter — one dot per cell, tiled in metre-space. Its mipmaps
 *  blur it into a smooth tint as the wall recedes, so there is no moire and no
 *  per-pixel dot maths. */
uniform sampler2D uDotTex;

uniform float uGradientTurns;
uniform float uGradientRise;
uniform float uGradientOffset;
uniform float uGradientDrift;

/** Which programme the wall is showing, and how far between the two. */
uniform float uProgramA;
uniform float uProgramB;
uniform float uProgramMix;
/**
 * How the cut from A to B is laid across the wall — alche's uPatternSelectType:
 *   0  hard cut, the whole wall flips at once (fast).
 *   1  a wipe travelling across the arc, group by group.
 *   2  a slow exponential sweep across the arc, each group briefly dimming as the
 *      front crosses it — alche's rotating-tile sweep, faked with a flip-dim
 *      since our wall is one cylinder, not instanced tiles.
 * uProgramMix still runs 0..1 over the cut; this only reshapes it per fragment.
 */
uniform float uProgramSelectType;
/** Band programme: stripe spacing in metres, travel rate, and duty cycle. */
uniform float uBandPeriod;
uniform float uBandSpeed;
uniform float uBandWidth;
/** Sign flips the diagonal's direction; magnitude is its steepness. */
uniform float uBandSlant;
/** Panel programme: how fast a panel comes round, how long it is dark, its fade. */
uniform float uPanelRate;
uniform float uPanelHold;
uniform float uPanelFade;
/** Glyph programme: cell size in metres, scroll rate, dim level, hot fraction. */
/** Code programme: line height, cell width, scroll rate, resting level. */
uniform float uCodeLine;
uniform float uCodeCell;
uniform float uCodeScroll;
uniform float uCodeDim;
/** Peak brightness of the code programme's side-glow backdrop. */
uniform float uCodeBg;
/** How much of the wall's width the block of code spans. */
uniform float uCodeWidth;
uniform float uGlyphSize;
uniform float uGlyphScroll;
uniform float uGlyphDim;
uniform float uGlyphHot;
/** The WORKS section title, overlaid on the colour programme and flowing. */
uniform sampler2D uWorksTex;
uniform float uWorksAspect;
uniform float uWorksHeight;
uniform float uWorksCentreY;
uniform float uWorksDim;
/** Baseline tilt (radians) and how far the single word travels across the wall. */
uniform float uWorksAngle;
uniform float uWorksTravel;
/** One-time progress [0,1] through the works window — drives the single pass. */
uniform float uWorksProgress;
/** 0 in the hero, eased to 1 in the works section — gates the whole overlay. */
uniform float uWorksAmount;

/**
 * The blurry project projection — alche's BGQuadWorks, adapted to our dots.
 *
 * Two pre-blurred project images (outgoing/incoming) are projected across the
 * whole wall in screen space, cross-fading with a horizontal wipe as the featured
 * project changes — so the wall carries a huge, out-of-focus, screen-filling hue
 * of whatever frame is centred, sliding in from the opposite side to the frame
 * and meeting at centre. Kept dark and read through the dot lattice + vignette:
 * you read colour, not a picture.
 */
uniform sampler2D uWorks1Tex;
uniform sampler2D uWorks2Tex;
uniform float uWorks1Loaded;
uniform float uWorks2Loaded;
/** 0..1 cross-fade between the outgoing (1) and incoming (2) project. */
uniform float uWorksBlend;
/** Image and screen aspect, so the projection covers the wall without stretching. */
uniform float uWorksImgAspect;
uniform float uScreenAspect;
/** Gate over the gallery phase; how far the wall dims under the hue; hue mix. */
uniform float uWorksProjAmount;
uniform float uWorksProjDim;
uniform float uWorksProjMix;
/** The featured and next project accent colours (linear). A project's image can
 *  be near-black (Satark), so the accent guarantees the wall still glows in the
 *  work's own colour rather than going dark under a dim image. */
uniform vec3 uWorksAccent1;
uniform vec3 uWorksAccent2;
/** 0 in the hero, eased to 1 through the works gallery: desaturates and dims the
 *  wall's colour programme to a faint neutral lattice, so the only colour on
 *  screen through works is the project panes and the accent glow behind them. */
uniform float uWorksWallFade;
/** The code the wall prints: the glyph atlas, and the lines themselves. */
uniform sampler2D uCodeFont;
uniform sampler2D uCodeText;
uniform float uFontCols;
uniform float uFontRows;
uniform float uCodeCols;
uniform float uCodeRows;
uniform float uTextRows;
uniform float uCodeType;
/** The easter egg: which block of lines is being printed. */
uniform float uSecret;
uniform float uSecretStart;
uniform float uSecretRows;
/** Agent graph: spacing, node and edge size, message length, rate, wiring. */
uniform float uAgentCell;
uniform float uAgentNode;
uniform float uAgentLink;
uniform float uAgentSpark;
uniform float uAgentSpeed;
uniform float uAgentDensity;
uniform float uAgentDim;
/** The room's falloff: brighter in the middle, dimmer toward the edges. */
uniform float uPoolWidth;
uniform float uPoolHeight;
uniform float uPoolCentreY;
uniform float uPoolFloor;

/**
 * The pointer fluid — alche's StableFluids, run in FluidCursor and read here in
 * screen space. Its xy is the velocity the cursor has stirred into the field; the
 * dots along that trail flare up, the way alche lights his tile side-faces from
 * length(fluids.xy). uFluidsAmount gates and scales the flare.
 */
uniform sampler2D uFluidsTex;
uniform float uFluidsAmount;

/** The wall's addressing. See ledPanels.ts — the CPU owns this layout. */
uniform sampler2D uLayout;
uniform sampler2D uOverrides;
uniform vec2 uPanelGrid;
uniform vec2 uOverrideSize;

varying vec2 vUv;
varying vec2 vScreenUv;

const float TAU = 6.28318530718;

/** RGB<->HSV, so the projected hue can be pushed more saturated (alche does the
 *  same: it doubles the works image's saturation before laying it on the wall). */
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

/**
 * The blurry project hue at this fragment, projected across the wall in screen
 * space and cross-faded between the outgoing and incoming project.
 *
 * The two images slide in opposite directions (outgoing drifts one way, incoming
 * the other) and the cross-fade is a soft horizontal wipe by screen-x, so as the
 * featured project changes the new hue sweeps across the wall from the far side
 * and settles as the frame reaches centre — alche's convergence. The result is
 * pushed more saturated; darkness and the dot read are applied by the caller.
 */
vec4 worksProjection() {
  // Cover-fit the 16:9 image to the screen so it fills the wall without stretch.
  vec2 uv1 = vScreenUv;
  vec2 uv2 = vScreenUv;
  float slide = 0.12;
  uv1.x -= uWorksBlend * slide;         // outgoing drifts off to one side
  uv2.x += (1.0 - uWorksBlend) * slide; // incoming arrives from the other
  if (uScreenAspect < uWorksImgAspect) {
    uv1.x = (uv1.x - 0.5) * (uScreenAspect / uWorksImgAspect) + 0.5;
    uv2.x = (uv2.x - 0.5) * (uScreenAspect / uWorksImgAspect) + 0.5;
  } else {
    uv1.y = (uv1.y - 0.5) / (uScreenAspect / uWorksImgAspect) + 0.5;
    uv2.y = (uv2.y - 0.5) / (uScreenAspect / uWorksImgAspect) + 0.5;
  }
  vec3 t1 = texture2D(uWorks1Tex, uv1).rgb * uWorks1Loaded;
  vec3 t2 = texture2D(uWorks2Tex, uv2).rgb * uWorks2Loaded;
  float bs = 0.28;
  float wipe = smoothstep(vScreenUv.x - bs, vScreenUv.x + bs, uWorksBlend);
  vec3 col = mix(t1, t2, wipe);
  // Linearise (the blurred images are sRGB) and push saturation.
  col = pow(col, vec3(2.2));
  vec3 hsv = rgb2hsv(col);
  vec3 hue = hsv2rgb(vec3(hsv.x, min(1.0, hsv.y * 1.7), hsv.z));
  // Coverage: only the COLOURFUL parts of the image bleed onto the wall. White
  // and grey areas (low saturation) contribute almost nothing, so a light
  // project tints the wall with its accents instead of flooding it grey — the
  // wall reads as colour, not as a picture, and stays mostly dark.
  float cover = smoothstep(0.12, 0.5, hsv.y) * smoothstep(0.02, 0.2, hsv.z);
  return vec4(hue, cover);
}

/**
 * Cyclic eight-stop ramp. Each stop contributes over a smooth tent two segments
 * wide, measured with wrap-around distance, so the sequence closes on itself and
 * can rotate forever without a seam.
 */
vec3 ramp(float t) {
  float x = fract(t) * 8.0;
  vec3 sum = vec3(0.0);
  float total = 0.0;

  for (int i = 0; i < 8; i++) {
    float d = abs(x - float(i));
    d = min(d, 8.0 - d);
    float w = max(0.0, 1.0 - d);
    w = w * w * (3.0 - 2.0 * w);
    sum += uPalette[i] * w;
    total += w;
  }

  return sum / max(total, 0.0001);
}

/** Distance from a value to the nearest multiple of a period. */
float toLattice(float value, float period) {
  return abs(value - floor(value / period + 0.5) * period);
}

/**
 * How one panel is divided into sub-panels — read from the layout the CPU built,
 * not computed here.
 *
 * Panels are not all broken up the same way, so the wall is never a uniform grid
 * of identical rectangles: some are left whole, some split in two, some into ten.
 *
 * The choice is deliberately not made in the shader. The CPU needs the identical
 * answer to work out which sub-panel a click landed on, and a hash built on sin()
 * does not survive the trip between 64-bit JavaScript and 32-bit GLSL — the two
 * would agree on most panels and quietly disagree on scattered ones, so a click
 * would sometimes light the wrong sub-panel with nothing looking wrong.
 */
vec2 subPanelGrid(vec2 panel) {
  return texture2D(uLayout, (panel + 0.5) / uPanelGrid).rg;
}

/** Where a sub-panel's entry sits in the override table. */
vec2 overrideUv(float index) {
  float x = mod(index, uOverrideSize.x);
  float y = floor(index / uOverrideSize.x);
  return (vec2(x, y) + 0.5) / uOverrideSize;
}

// --- Programs -------------------------------------------------------------
// The wall is a screen showing content, not a surface being lit. Each program
// is a different thing to display, returning rgb plus how hard to drive; the
// scheduler cuts between them. Some sample per light group, so a group is one
// flat colour of its own; others sample continuously, because a shape drawn on
// a screen crosses panel boundaries the way an image does.

/**
 * One smooth palette sweep, flat within each light group.
 *
 * This used to carry wallMarks() on top — three enormous rounded-triangle
 * outlines drifting across the wall as artwork. They were removed: at that scale
 * a triangle outline is mostly off screen, so what actually reached the viewer
 * was a pair of long diagonal strokes meeting at a point, reading as stray
 * chevrons laid over the picture rather than as a mark.
 */
vec4 programGradient(vec2 groupUv) {
  float sweep = groupUv.x * uGradientTurns + groupUv.y * uGradientRise;
  vec3 colour = ramp(uGradientOffset + sweep + uTime * uGradientDrift);
  return vec4(colour, 1.0);
}

/**
 * The wall as a set of screens, with individual panels switching off and back.
 *
 * Each group runs its own clock, offset by its address, so they never switch
 * together and only a handful are dark at any moment. The edges of the dark
 * slice are eased rather than stepped: a panel that snaps off reads as a
 * dropped frame, one that fades reads as hardware being driven.
 *
 * This is the only programme where the wall's own structure is the content —
 * nothing is drawn *on* the panels, they simply stop showing anything.
 */
vec4 programPanels(vec2 groupUv, float index) {
  vec3 colour = ramp(
    uGradientOffset
      + groupUv.x * uGradientTurns
      + groupUv.y * uGradientRise
      + uTime * uGradientDrift
  );

  float own = fract(sin(index * 12.9898) * 43758.5453);
  float cycle = fract(uTime * uPanelRate + own);
  float off =
      smoothstep(0.0, uPanelFade, cycle)
    * (1.0 - smoothstep(uPanelHold, uPanelHold + uPanelFade, cycle));

  return vec4(colour, 1.0 - off);
}

/**
 * Hard-edged bands sweeping diagonally across an otherwise dark wall.
 *
 * The band travels; panels are lit where it passes and off outside it. Measured
 * in metres so the diagonal holds its true angle around the curve, and the edge
 * is a step rather than a ramp — the boundary should cut across the dot lattice,
 * not fade into it.
 */
vec4 programBands(vec2 uv, vec2 groupUv) {
  float along = uv.x * uArcLength * 0.5 + uv.y * uBandHeight * uBandSlant;
  float phase = fract(along / uBandPeriod - uTime * uBandSpeed);
  float lit = step(phase, uBandWidth);

  vec3 colour = ramp(uGradientOffset + groupUv.x * 0.4 + uTime * uGradientDrift);
  return vec4(colour, lit);
}

/**
 * One symbol inside its cell. p runs -0.5..0.5; returns coverage.
 *
 * Drawn with distance maths rather than sampled from a texture, so the symbols
 * stay sharp at any size and cost nothing to store. Six shapes is enough for the
 * grid to read as a character set rather than as a repeating motif.
 */
float glyphMask(vec2 p, float id) {
  float r = length(p);
  float box = max(abs(p.x), abs(p.y));

  if (id < 1.0) return 1.0 - step(0.11, r);                      // filled dot
  if (id < 2.0) return 1.0 - step(0.055, abs(r - 0.20));          // ring
  if (id < 3.0) {                                                 // plus
    return step(box, 0.28) * (1.0 - step(0.055, min(abs(p.x), abs(p.y))));
  }
  if (id < 4.0) {                                                 // cross
    vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.70710678;
    float qbox = max(abs(q.x), abs(q.y));
    return step(qbox, 0.26) * (1.0 - step(0.055, min(abs(q.x), abs(q.y))));
  }
  if (id < 5.0) return step(0.17, box) * (1.0 - step(0.25, box)); // open square
  return 1.0 - step(0.17, box);                                   // filled square
}

/**
 * A grid of symbols scrolling up the wall.
 *
 * Cells are laid out in metres like everything else, so the symbols keep their
 * real size as the wall curves away. Each cell picks its shape from a hash of
 * its own coordinates, and the whole field travels vertically — the cell grid
 * moves, not the symbols within it, so nothing smears.
 *
 * Most cells sit dim and a scattered few burn bright, on a stepped clock so they
 * flip between states rather than pulsing. That contrast is what makes it read
 * as data rather than as decoration.
 */
vec4 programGlyphs(vec2 uv) {
  vec2 metres = vec2(
    uv.x * uArcLength,
    uv.y * uBandHeight + uTime * uGlyphScroll
  );

  vec2 cell = floor(metres / uGlyphSize);
  vec2 p = fract(metres / uGlyphSize) - 0.5;

  float pick = fract(sin(dot(cell, vec2(41.3, 289.1))) * 24634.6345);
  float mask = glyphMask(p, floor(pick * 6.0));

  float hot = step(1.0 - uGlyphHot, fract(pick * 7.31 + floor(uTime * 0.4) * 0.137));

  vec3 colour = ramp(uGradientOffset + uv.y * 0.3 + uTime * uGradientDrift);
  return vec4(colour, mask * mix(uGlyphDim, 1.0, hot));
}

/**
 * Blocks of code scrolling up the wall.
 *
 * Not the green rain — that is a single column of falling characters and reads
 * as a screensaver. Real code on a screen has *structure*: lines of differing
 * length, indentation that steps in and out, runs of characters broken by
 * spaces, and a few lines picked out as active. That structure is what makes it
 * legible as code at a glance, and it is all this draws.
 *
 * Characters are bars rather than glyphs. At this size on a dot lattice a real
 * letterform would be indistinguishable from a rectangle anyway, and a bar per
 * character costs nothing.
 *
 * Colour comes from the wall's own palette, so it stays in the room's cyan and
 * violet rather than importing a terminal's green.
 */
/**
 * Real code, in a real typeface, typed out as it arrives.
 *
 * The characters used to be generated — first solid rectangles, then stroke
 * patterns picked from a hash. Neither read as code, because neither contained
 * any: a pattern that merely has the texture of text is still not text, and at a
 * glance the eye can tell. So the wall prints actual source now. The letterforms
 * come from a canvas-rendered atlas (see codeFont) and the lines themselves from
 * a texture of character indices (see codeSource), because GLSL has no strings
 * and the CPU already owns the wall's other lookup tables.
 *
 * Lines are typed rather than appearing whole, one character at a time, starting
 * the moment a line rises into view. That is what makes the wall look like
 * something is running on it rather than like a picture of code.
 */
vec4 programCode(vec2 uv) {
  // The screen glows faintly behind the code, so the wall reads as switched on
  // rather than black: a hue gradient across the width, up at the sides and
  // easing to nothing through the centre, where the logo and the marquee sit.
  // codeEdge is 0 dead centre and 1 at either side.
  float codeEdge = abs(uv.x - 0.5) * 2.0;
  float codeGlow = uCodeBg * smoothstep(0.04, 0.82, codeEdge);
  // The screen glows faintly behind the code from the wall's palette. The sweep
  // across the arc is kept small so the hue stays smooth and even — one drifting
  // colour like the rest of the LED programmes — instead of splitting into two
  // different hues from one side of the wall to the other (which read as uneven).
  vec3 codeGlowColour = ramp(uGradientOffset + uv.x * 0.12 + uTime * uGradientDrift);

  // Content travels upward and new lines arrive at the bottom, the way a
  // terminal scrolls. The subtraction is what sets that direction: a given line
  // climbs the wall as time passes, so line numbers fall rather than rise.
  // The u axis is reversed here, and it has to be.
  //
  // The wall is a cylinder drawn from the inside, so its surface is seen from
  // behind: u climbs to the *left* on screen. Nothing else on the wall notices,
  // because a lattice, a stripe and a scatter of glyphs all look the same either
  // way round — but text does not. Left unflipped every line prints backwards,
  // and each letterform is mirrored too, which reads as a broken font rather
  // than as a handedness bug.
  vec2 m = vec2(
    (1.0 - uv.x) * uArcLength,
    uv.y * uBandHeight - uTime * uCodeScroll
  );

  // The block is centred, so it lands where the camera looks rather than off at
  // the edge of a 212-degree wrap that is mostly behind the viewer.
  float blockWidth = uCodeCols * uCodeCell;
  float x = m.x - (uArcLength - blockWidth) * 0.5;

  float col = floor(x / uCodeCell);
  float across = fract(x / uCodeCell);
  if (col < 0.0 || col >= uCodeCols) return vec4(codeGlowColour, codeGlow);

  float line = floor(m.y / uCodeLine);
  float downLine = fract(m.y / uCodeLine);

  // Which stored line to print. The hidden block sits after the visible one in
  // the same texture, so the easter egg is a change of offset — nothing is
  // reallocated, and it cannot hitch on the frame it fires.
  float first = uSecret > 0.5 ? uSecretStart : 0.0;
  float count = uSecret > 0.5 ? uSecretRows : uCodeRows;
  float src = first + mod(line, count);

  float index = floor(texture2D(
    uCodeText,
    vec2((col + 0.5) / uCodeCols, (src + 0.5) / uTextRows)
  ).r * 255.0 + 0.5);

  // Typed out as the line arrives. "entered" is the moment this line crossed the
  // bottom of the wall, so every line is written at the same rate no matter when
  // it appears, and a line already well up the wall is long since finished.
  float entered = -(line * uCodeLine) / uCodeScroll;
  float typed = (uTime - entered) * uCodeType;
  if (col > typed) return vec4(codeGlowColour, codeGlow);

  // The glyph itself, looked up in the atlas.
  vec2 atlasCell = vec2(mod(index, uFontCols), floor(index / uFontCols));
  vec2 inGlyph = vec2(across, 1.0 - downLine);
  float ink = step(0.5, texture2D(
    uCodeFont,
    (atlasCell + inGlyph) / vec2(uFontCols, uFontRows)
  ).r);

  // The cursor, sitting on the character about to be written and blinking.
  float atHead = step(typed - col, 1.0) * step(0.0, typed - col);
  float cursor =
      atHead
    * step(0.12, downLine) * (1.0 - step(0.9, downLine))
    * step(0.5, fract(uTime * 1.7));

  vec3 colour = ramp(uGradientOffset + line * 0.012 + uTime * uGradientDrift);
  return vec4(colour, max(max(ink * uCodeDim, cursor), codeGlow));
}

/** Where the agent in a given cell sits, kept off the cell edges. */
vec2 agentAt(vec2 cell) {
  float hx = fract(sin(dot(cell, vec2(12.989, 78.233))) * 43758.5453);
  float hy = fract(sin(dot(cell, vec2(39.346, 11.135))) * 24634.6345);
  return cell + vec2(0.2 + hx * 0.6, 0.2 + hy * 0.6);
}

/**
 * A network of agents passing messages.
 *
 * Nodes on a loose grid, edges between neighbours, and a pulse running the
 * length of an edge each time one talks to another. Dark, like the glyph and
 * code programmes — the wall is mostly black and what you read is the traffic.
 *
 * The work is bounded rather than unbounded: a fragment only ever considers the
 * nine cells around it. Agents are inset from their cell edges, so an edge
 * between neighbours can never span more than about a cell and a half, and
 * anything outside that neighbourhood cannot reach this pixel. That is what
 * keeps a graph of arbitrarily many nodes down to a fixed cost per fragment.
 *
 * Each agent draws only two of its edges — to the one on its right and the one
 * above — because an edge drawn from both ends is drawn twice, and where the two
 * overlap it would come out brighter than a single one.
 */
vec4 programAgents(vec2 uv) {
  vec2 m = vec2(uv.x * uArcLength, uv.y * uBandHeight);
  vec2 g = m / uAgentCell;
  vec2 base = floor(g);

  float link = 0.0;
  float node = 0.0;
  float spark = 0.0;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cell = base + vec2(float(dx), float(dy));
      vec2 a = agentAt(cell);

      // The agent itself.
      float toNode = length(g - a) * uAgentCell;
      node = max(node, 1.0 - smoothstep(uAgentNode, uAgentNode * 1.7, toNode));

      for (int k = 0; k < 2; k++) {
        vec2 step2 = k == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        float seed = fract(
          sin(dot(cell, vec2(7.13, 3.71)) + float(k) * 19.77) * 43758.5453
        );
        // Not every pair is wired together, or the wall reads as a mesh.
        if (seed > uAgentDensity) continue;

        vec2 other = agentAt(cell + step2);
        vec2 pa = g - a;
        vec2 ba = other - a;
        // How far along the edge the nearest point to this pixel lies, and how
        // far off the edge the pixel is.
        float along = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
        float off = length(pa - ba * along) * uAgentCell;

        link = max(link, 1.0 - smoothstep(uAgentLink, uAgentLink * 2.4, off));

        // The message in flight.
        float travel = fract(uTime * uAgentSpeed + seed * 7.0);
        spark = max(
          spark,
          (1.0 - smoothstep(0.0, uAgentSpark, abs(along - travel)))
            * (1.0 - smoothstep(uAgentLink, uAgentLink * 3.0, off))
        );
      }
    }
  }

  vec3 colour = ramp(uGradientOffset + base.x * 0.03 + uTime * uGradientDrift);
  return vec4(colour, max(max(link * uAgentDim, node), spark));
}

/**
 * A colour field — the Alche states. Each is a specific two-colour gradient
 * across the wall, carrying its own (uneven) brightness and its own share of
 * light groups sitting dark, so the wall can cut between rich, distinct looks
 * like a video wall changing clips.
 *
 * The colours are lifted straight from alche.studio's background patterns — the
 * three source triples its wall lives on: the violet base #350FFD
 * vec3(0.207,0.059,0.992), the ice highlight #B2EDFF vec3(0.698,0.929,1.0), and
 * the orange spark #FD5F0C vec3(0.992,0.372,0.047), plus a steel blue from its
 * pattern1 field. No green/warm-teal — Alche's hero world is cool violet and ice
 * with orange accents, and matching that is the whole point of this pass.
 *
 * Unlike the palette programmes these do not draw from the cyclic even-luminance
 * ramp — they carry their own colours and their own brightness.
 */
vec4 programField(vec2 uv, float index, float state) {
  // Vibrant AND bright colour fields. The first pass was richly saturated but too
  // dark — a pure blue-violet carries almost no green light, so the wall dimmed.
  // These lift the low channels so each colour is luminous enough to light the
  // wall and keep the architecture clearly visible, while still reading as strong
  // colour (each keeps one channel well under 1 so it never washes to white).
  vec3 vViolet = vec3(0.58, 0.28, 1.00); // bright electric violet
  vec3 vBlue   = vec3(0.28, 0.58, 1.00); // bright electric blue
  vec3 vCyan   = vec3(0.22, 0.95, 1.00); // bright cyan
  vec3 vOrange = vec3(1.00, 0.52, 0.12); // bright orange
  vec3 vPink   = vec3(1.00, 0.30, 0.72); // bright hot pink

  vec3 a;
  vec3 b;
  float bright;
  float drop;
  if (state < 0.5) {          // blue to cyan
    a = vBlue; b = vCyan; bright = 1.10; drop = 0.06;
  } else if (state < 1.5) {   // electric violet to blue
    a = vViolet; b = vBlue; bright = 1.05; drop = 0.10;
  } else if (state < 2.5) {   // near-black, mostly off (kept; out of rotation)
    a = vec3(0.059, 0.102, 0.227); b = a; bright = 0.42; drop = 0.58;
  } else if (state < 3.5) {   // violet to cyan
    a = vViolet; b = vCyan; bright = 1.10; drop = 0.07;
  } else if (state < 4.5) {   // violet to pink
    a = vViolet; b = vPink; bright = 1.08; drop = 0.07;
  } else {                    // pink to orange — vibrant sunset
    a = vPink; b = vOrange; bright = 1.05; drop = 0.08;
  }

  // The literals above are sRGB; the wall renders linear, so bring them across.
  a = pow(a, vec3(2.2));
  b = pow(b, vec3(2.2));

  // A slight diagonal sweep between the two colours, matching Alche's gradients.
  // Sampled continuously (uv, not the group centre) so the gradient is smooth
  // instead of stair-stepping at the light-group seams.
  float sweep = clamp(uv.x + (uv.y - 0.5) * 0.25, 0.0, 1.0);
  vec3 colour = mix(a, b, sweep);

  // Panel dropout: a share (drop) of the light groups sit dark at any moment,
  // drifting slowly on and off so the wall reads as hardware, not a still frame.
  float own = fract(sin(index * 12.9898) * 43758.5453);
  float cycle = fract(uTime * 0.05 + own);
  float lit = smoothstep(drop - 0.04, drop + 0.04, cycle);

  return vec4(colour, bright * lit);
}

/**
 * Coverage of the WORKS title at this fragment.
 *
 * ONE word making a single, one-time pass, laid *over* whatever colour programme
 * is showing so the LED wall keeps glowing behind it. As the works window is
 * scrolled through (uWorksProgress 0->1, clamped so it never loops) the whole
 * word travels across the wall from up-and-left to down-and-right along its
 * tilted baseline, then holds at the end and fades. It moves a long way (not a
 * small nudge), but it plays exactly once.
 *
 * Worked in metres so the letters keep their true proportion around the curve,
 * and the u axis is flipped — as the code programme flips it — because the
 * cylinder is seen from inside, so without the flip the word reads mirrored.
 */
float worksInk(vec2 uv) {
  // A rightward, read-correct screen-x, and the point in metres on the wall.
  float sx = 1.0 - uv.x;
  vec2 m = vec2(sx * uArcLength, uv.y * uBandHeight);

  // The word's centre travels right-and-down across the wall over the pass.
  float d = (uWorksProgress - 0.5) * uWorksTravel;
  vec2 centre = vec2(
    (0.5 + d) * uArcLength,
    (uWorksCentreY - d * 0.55) * uBandHeight
  );
  vec2 rel = m - centre;

  // Rotate into the word's own frame: "along" runs down its tilted baseline,
  // "across" spans the word's height.
  float ca = cos(uWorksAngle);
  float sa = sin(uWorksAngle);
  float along = rel.x * ca + rel.y * sa;
  float across = -rel.x * sa + rel.y * ca;

  float wordHeight = uWorksHeight;
  float wordWidth = wordHeight * uWorksAspect;

  float tx = along / wordWidth + 0.5;
  float ty = across / wordHeight + 0.5;
  if (tx < 0.0 || tx > 1.0 || ty < 0.0 || ty > 1.0) return 0.0;

  return texture2D(uWorksTex, vec2(tx, ty)).r;
}

vec4 programAt(float id, vec2 uv, vec2 groupUv, float index) {
  if (id < 0.5) return programGradient(groupUv);
  if (id < 1.5) return programPanels(groupUv, index);
  if (id < 2.5) return programBands(uv, groupUv);
  if (id < 3.5) return programGlyphs(uv);
  if (id < 4.5) return programCode(uv);
  if (id < 5.5) return programAgents(uv);
  return programField(uv, index, id - 6.0);
}

void main() {
  // Where this pixel is on the wall, in metres. Everything below is in real
  // units, which is why the same numbers work on every display.
  vec2 metres = vec2(vUv.x * uArcLength, vUv.y * uBandHeight);

  // --- The lattice --------------------------------------------------------
  // One soft dot per cell, read from a tiled emitter texture in metre-space.
  // The GPU picks the mip level from how fast the coordinate changes across the
  // screen, so up close a dot is a soft dot and far away it averages into a
  // smooth tint — no aliasing, no fwidth, one texture read. Anisotropy on the
  // texture keeps it from smearing where the wall turns away at the sides.
  //
  // Named emitter, not dot: a local called dot shadows the GLSL built-in of the
  // same name and breaks every later dot() call, far from the real cause.
  //
  // The small positive LOD bias samples a slightly blurrier mip, which stops the
  // fine lattice crawling/shimmering when the camera drifts under the cursor
  // parallax — the "flicker on mouse move". Barely softer, far steadier.
  float emitter = texture2D(uDotTex, metres / uPitch, 0.6).r;

  // Dots stop short of the seams, so the architecture reads through the light
  // instead of being painted over by it. Two levels: the panel joints, and the
  // finer sub-panel divisions inside each one.
  vec2 panelSize = vec2(uPanelWidth, uPanelHeight);
  float seam =
      step(uSeamClearance, toLattice(metres.x, uPanelWidth))
    * step(uSeamClearance, toLattice(metres.y, uPanelHeight));

  vec2 panelCoord = metres / panelSize;
  vec2 panel = floor(panelCoord);
  vec2 grid = subPanelGrid(panel);
  vec2 subSize = panelSize / grid;
  vec2 withinPanel = fract(panelCoord) * panelSize;
  seam *=
      step(uSubClearance, toLattice(withinPanel.x, subSize.x))
    * step(uSubClearance, toLattice(withinPanel.y, subSize.y));

  // This sub-panel's address. Every panel reserves a fixed block of ten, so an
  // index never shifts because a neighbouring panel divides differently.
  vec2 tile = min(grid - 1.0, floor(fract(panelCoord) * grid));

  // --- Light groups -------------------------------------------------------
  // A panel divided into a few sub-panels lights each one on its own. Divided
  // into many, they pair up: five or ten narrow strips each showing a different
  // colour reads as confetti rather than as architecture, and pairing halves
  // that without touching the physical divisions, which stay visible as seams.
  //
  // An odd sub-panel out joins the last pair rather than standing alone, so a
  // row of five lights as two-and-three, never as two-and-two-and-a-runt.
  float groupWidth = grid.x >= 5.0 ? 2.0 : 1.0;
  float groupsAcross = max(1.0, floor(grid.x / groupWidth));
  float groupX = min(floor(tile.x / groupWidth), groupsAcross - 1.0);
  float anchorX = groupX * groupWidth;

  // The group is addressed by its anchor — the first sub-panel in it — so every
  // sub-panel of a group resolves to one address and lights as one unit.
  float index =
    (panel.y * uPanelGrid.x + panel.x) * 10.0 + tile.y * 5.0 + anchorX;

  // Where the group starts and ends across the panel, so its colour can be
  // sampled at its centre and come out flat across the whole group. The last
  // group runs to the panel edge, which is what absorbs the odd one out.
  float groupStart = anchorX / grid.x;
  float groupEnd =
    groupX == groupsAcross - 1.0 ? 1.0 : (anchorX + groupWidth) / grid.x;

  emitter *= seam;

  if (emitter <= 0.0) discard;

  // --- The picture --------------------------------------------------------
  // Sampled at the group's own centre, so a group is one flat colour it chose
  // for itself rather than a slice of a picture painted across the wall. Each
  // group is a screen; the wall is a set of screens, not one surface.
  vec2 groupCentre = vec2(
    (groupStart + groupEnd) * 0.5,
    (tile.y + 0.5) / grid.y
  );
  vec2 groupUv =
    (panel + groupCentre) * panelSize / vec2(uArcLength, uBandHeight);

  // What the wall is showing.
  //
  // The outgoing programme is only evaluated while a cut is actually running.
  // This used to sit in one mix() with both programmes always evaluated, on the
  // stated grounds that "both branches cost the same either way" — which was
  // simply wrong. Every fragment on the wall paid for two programmes at all
  // times, and the wall is the most expensive thing on screen, so the whole
  // scene ran at roughly half the framerate it needed to. uProgramMix is a
  // uniform, so this branch is taken the same way by every fragment in the draw
  // and costs nothing to decide.
  vec4 content = programAt(uProgramA, vUv, groupUv, index);
  // A brief dip in a group's brightness as the transition front crosses it, so
  // the slow sweep reads as panels turning over rather than a flat crossfade.
  float flipDim = 1.0;
  if (uProgramMix > 0.0) {
    // Reshape the global 0..1 cut into a per-group amount by transition style.
    float m = uProgramMix;
    if (uProgramSelectType < 0.5) {
      // Hard cut: the whole wall flips together at the midpoint.
      m = step(0.5, uProgramMix);
    } else if (uProgramSelectType < 1.5) {
      // Wipe across the arc, group by group, with a soft edge of width w. The
      // (1+w) scaling guarantees every group is fully switched by uProgramMix=1.
      float w = 0.25;
      m = clamp((uProgramMix * (1.0 + w) - groupUv.x) / w, 0.0, 1.0);
    } else {
      // Exponential sweep across the arc — alche's exponentialOut front. arg is
      // -gx at mix 0 (all off) and 2-gx at mix 1 (all on), so it fully covers.
      float f = clamp(uProgramMix * 2.0 - groupUv.x, 0.0, 1.0);
      f = 1.0 - pow(1.0 - f, 3.0);
      m = f;
      // Dim each group hardest as its front passes through the middle of the cut.
      flipDim = mix(1.0, 0.4, exp(-pow((f - 0.5) * 4.0, 2.0)));
    }
    content = mix(
      content,
      programAt(uProgramB, vUv, groupUv, index),
      m
    );
  }

  vec3 colour = content.rgb;
  float level = content.a * flipDim;

  // A sub-panel under manual control shows what it was told to and ignores the
  // programme entirely — including its level, so a commanded panel stays lit
  // through a dark passage. Alpha is the flag: zero hands it back.
  vec4 commanded = texture2D(uOverrides, overrideUv(index));
  colour = mix(colour, commanded.rgb, commanded.a);
  level = mix(level, 1.0, commanded.a);

  // Brighter in the middle of the room than at its edges, whatever is showing.
  // This is the room rather than the content: a wall lit evenly corner to corner
  // reads as a flat backdrop, while a centre that falls away gives it depth and
  // puts the light where the logo is.
  vec2 fromCentre = vec2(
    (vUv.x - 0.5) / uPoolWidth,
    (vUv.y - uPoolCentreY) / uPoolHeight
  );
  level *= mix(uPoolFloor, 1.0, exp(-dot(fromCentre, fromCentre)));

  // Through the works gallery the wall becomes each project's own colour. As the
  // featured project changes (uWorksBlend 0->1, scroll-driven) the next colour
  // sweeps in from the LEFT with a dark transition band riding the front — the
  // colour shifts pane by pane, left to right, as you scroll.
  if (uWorksWallFade > 0.0) {
    float band = 0.16;
    // sweepArg > band = fully new colour; < 0 = still old; the [0,band] slice is
    // the moving front. The (1+band) scaling makes the sweep fully cover 0->1.
    float sweepArg = uWorksBlend * (1.0 + band) - vScreenUv.x;
    float mixT = smoothstep(0.0, band, sweepArg);
    vec3 wallCol = mix(uWorksAccent1, uWorksAccent2, mixT);
    // The dark band at the sweep front (peaks mid-transition, gone once settled).
    float edge = mixT * (1.0 - mixT) * 4.0;
    wallCol *= 1.0 - 0.55 * edge;
    colour = mix(colour, wallCol, uWorksWallFade);
    // Lift to a solid-ish coloured background so the accent reads as the wall.
    level = mix(level, 0.7, uWorksWallFade);
  }

  // No type protection here, deliberately.
  //
  // There used to be one: each live word pulled the wall down behind its own
  // rectangle so the letters kept their contrast. It had to go. The marquee is
  // faint light grey to begin with and reads perfectly well against the lattice,
  // so the halo was solving a problem that no longer existed — and its cost was
  // ugly. A rectangle of dimming lands on a wall whose light groups are already
  // flat rectangles, so it lines up with the panel edges and reads as blocks of
  // the screen switching off. Softening it only smeared the blocks; the shape
  // was the fault, not the edge.

  // The WORKS title, laid over whatever colour programme is showing so the wall
  // keeps glowing behind it. Where the flowing word covers a dot, the dot is
  // pulled toward a bright cool grey and lit up, so the letters read as light
  // struck across the colour rather than as a hole cut in it. Gated by amount,
  // which is zero through the whole hero, so the hero pays nothing for this.
  if (uWorksAmount > 0.0) {
    float ink = worksInk(vUv) * uWorksAmount;
    colour = mix(colour, vec3(0.92, 0.95, 1.0), ink * 0.9);
    level = max(level, ink * uWorksDim);
  }

  vec3 outColour = colour * level * emitter * uIntensity;

  // The featured project's colour glowing on the wall behind the pane — alche's
  // background glow that follows whatever work is on screen. ADDITIVE, never a
  // dim: a dark project image (Satark) lights the dots in its own accent colour
  // instead of punching a black hole in the wall. Where the blurred image is
  // vivid its colour leads; elsewhere the accent carries the glow. Worked in
  // screen space and cross-faded, so it sits behind the pane and shifts as the
  // featured project changes. Multiplied by emitter so it rides the dot lattice.
  if (uWorksProjAmount > 0.0) {
    vec4 wc = worksProjection();
    vec3 accent = mix(uWorksAccent1, uWorksAccent2, uWorksBlend);
    vec3 glowCol = mix(accent, wc.rgb, wc.a * 0.7);
    float g = uWorksProjAmount * (0.55 + 0.9 * wc.a);
    outColour += glowCol * g * uWorksProjMix * emitter;
  }

  // The cursor's wake, read from the fluid field in screen space. Where the
  // pointer has stirred the field the dots on that trail flare — mostly the
  // wall's own colour intensified (so the trail stays vibrant, not white), with
  // a faint cool lift for the wet, lit look. Multiplied by emitter so it lands on
  // the dot lattice, not the dark substrate. Gated by amount (0 = off).
  if (uFluidsAmount > 0.0) {
    float flow = smoothstep(0.04, 0.7, length(texture2D(uFluidsTex, vScreenUv).xy));
    outColour += (colour * 1.4 + vec3(0.12, 0.30, 0.55))
      * flow * emitter * uFluidsAmount;
  }

  gl_FragColor = vec4(outColour, 1.0);
}
`
