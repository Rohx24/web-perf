/**
 * A screen-space optical lens that trails the cursor.
 *
 * The pass samples the already-rendered scene and only ever changes *where* it
 * samples from — never the colour. Nothing is added, tinted or lit, so the
 * effect cannot introduce a cast, a glow or a rim: at worst it is invisible.
 *
 * The lens is not a disc but a capsule: the distance field is measured to the
 * *segment* running from the cursor back to where it recently was. Standing
 * still the segment has no length and the capsule is a circle; moving fast it
 * stretches out behind, so the glass appears to be dragged along after the
 * pointer rather than teleporting with it.
 *
 * Two displacements are combined, both driven by the same radial mask:
 *
 *   magnification — pulls the sample toward the lens, so the content behind it
 *                   reads slightly larger, like the centre of a thin convex
 *                   lens.
 *
 *   refraction    — pushes the sample outward, away from the segment. Its
 *                   weight is `mask * (1 - mask)`, which is zero at the core
 *                   *and* zero at the rim and peaks in between — the way a real
 *                   lens bends light hardest through its shoulder.
 *
 * The mask is `1 - smoothstep(0, 1, t)`, whose derivative is zero at both ends.
 * That is what keeps the boundary invisible: the distortion does not merely
 * reach zero at the rim, it arrives there with zero slope, so there is no edge
 * for the eye to find.
 */
export const cursorLensVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const cursorLensFragmentShader = /* glsl */ `
uniform sampler2D uScene;
/** Head of the trail — where the cursor is now, in UV space. */
uniform vec2 uCursor;
/** Tail of the trail. Equal to uCursor when the cursor is at rest. */
uniform vec2 uTrail;
/** Drawing-buffer size in device pixels. */
uniform vec2 uResolution;
/** Lens radius in device pixels. */
uniform float uRadius;
/** Peak displacement in device pixels. */
uniform float uStrength;
/** Sample pull toward the lens; the magnification is 1 / (1 - uMagnify). */
uniform float uMagnify;
/** Shapes the mask. Higher concentrates the effect toward the core. */
uniform float uFalloff;
/** How much weaker the tail is than the head, 0 = even, 1 = tail vanishes. */
uniform float uTaper;
/** Overall gain, 0 when the cursor is away. */
uniform float uAmount;

varying vec2 vUv;

/**
 * Three forces linear output whenever it renders into a plain render target,
 * regardless of that target's declared colour space — so the scene arrives here
 * un-encoded and this pass has to do the sRGB transfer the canvas would
 * normally have received. Without it the whole image renders too dark.
 */
vec3 linearToSRGB(vec3 value) {
  vec3 safe = max(value, vec3(0.0));
  return mix(
    safe * 12.92,
    1.055 * pow(safe, vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), safe)
  );
}

void main() {
  vec2 pixel = vUv * uResolution;
  vec2 head = uCursor * uResolution;
  vec2 tail = uTrail * uResolution;

  // Closest point on the head-to-tail segment, and how far along it that is:
  // 1 at the head, 0 at the tail.
  vec2 axis = head - tail;
  float lengthSquared = max(dot(axis, axis), 0.0001);
  float along = clamp(dot(pixel - tail, axis) / lengthSquared, 0.0, 1.0);
  vec2 nearest = tail + axis * along;

  // Named reach, not distance: distance() is a GLSL built-in, and a local of
  // that name shadows it for the rest of the function. Harmless until someone
  // calls distance() below, at which point the compile fails on *that* line
  // with nothing wrong on it. Not worth leaving armed.
  vec2 offset = pixel - nearest;
  float reach = length(offset);
  float t = clamp(reach / max(uRadius, 1.0), 0.0, 1.0);

  // 1 at the core, 0 at the rim, flat at both ends.
  float mask = pow(1.0 - smoothstep(0.0, 1.0, t), uFalloff);
  // The trail thins out behind the cursor instead of ending abruptly.
  mask *= mix(1.0 - uTaper, 1.0, along) * uAmount;

  vec2 uv = mix(vUv, nearest / uResolution, uMagnify * mask);

  // Peaks mid-radius, vanishes at core and rim.
  float shoulder = mask * (1.0 - mask) * 4.0;
  vec2 direction = reach > 0.5 ? offset / reach : vec2(0.0);
  uv += direction * (uStrength * shoulder) / uResolution;

  vec4 scene = texture2D(uScene, uv);
  gl_FragColor = vec4(linearToSRGB(scene.rgb), scene.a);
}
`
