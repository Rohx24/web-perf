/**
 * The front glass of the display — a gloss-black mirror.
 *
 * The first version of this painted soft bars across the surface, on the theory
 * that a highlight is what reads as glass. It is not, and it looked like exactly
 * what it was: streaks drawn on the picture. A polished screen has no marks on
 * it at all. What you see in one is *the room*, and the reason a switched-off
 * OLED looks like black glass rather than black plastic is that it reflects the
 * room sharply while giving back almost nothing of its own.
 *
 * So this reflects. The view direction is mirrored about the surface and used to
 * look up what lies in that direction — dark floor below, dimly lit ceiling
 * above, a soft horizon between them. There is no environment map: the room is
 * a gradient evaluated per fragment, which is enough, because a gradient is
 * genuinely all that a dark room reflected in a screen amounts to.
 *
 * The strength comes from Schlick's approximation rather than a hand-tuned
 * curve. A polished dielectric returns a few percent head-on and almost
 * everything at a grazing angle, and because this wall wraps 212 degrees around
 * the viewer that whole range is on screen at once: the middle is nearly clear
 * and the far sides go properly mirror-like. That sweep across the curve is the
 * effect. Nothing is painted anywhere.
 *
 * Additive, so it can only add light. The wall underneath is discrete emitters
 * on black substrate, and the one thing this layer must never do is wash grey
 * over that and flatten it into a tint.
 */

export const glassVertexShader = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;

  // Negated: the cylinder is drawn from the inside, so its own normals point
  // away from the viewer. Left unflipped, both the Fresnel term and the mirror
  // direction would be computed against the back of the surface — the
  // reflection would come out brightest dead ahead and absent at the edges,
  // which is precisely backwards.
  vNormal = normalize(mat3(modelMatrix) * -normal);

  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const glassFragmentShader = /* glsl */ `
uniform vec3 uCeiling;
uniform vec3 uFloorTone;
uniform float uRoomLevel;
uniform float uHorizon;
uniform float uHorizonSoft;
uniform float uBaseReflect;
uniform float uFresnelPower;
uniform float uAmount;

varying vec3 vWorld;
varying vec3 vNormal;

/**
 * What lies in a given direction, for a mirror to return.
 *
 * Only the vertical component matters. A dark room has no detail worth
 * reflecting — what it has is a floor, a ceiling and the division between them,
 * and that division sweeping across a curved screen is the whole read.
 */
vec3 room(vec3 dir) {
  float up = dir.y * 0.5 + 0.5;
  float above = smoothstep(uHorizon - uHorizonSoft, uHorizon + uHorizonSoft, up);
  return mix(uFloorTone, uCeiling, above) * uRoomLevel;
}

void main() {
  vec3 toEye = normalize(cameraPosition - vWorld);

  // How squarely this patch faces the viewer: 1 head-on, 0 edge-on.
  float facing = clamp(dot(toEye, vNormal), 0.0, 1.0);

  // Schlick. uBaseReflect is the head-on reflectance — about 0.04 for real
  // glass, which is why a screen viewed straight on shows you almost nothing
  // and the same screen viewed along its surface shows you the whole room.
  float reflectance =
    uBaseReflect + (1.0 - uBaseReflect) * pow(1.0 - facing, uFresnelPower);

  gl_FragColor = vec4(room(reflect(-toEye, vNormal)) * reflectance * uAmount, 1.0);
}
`
