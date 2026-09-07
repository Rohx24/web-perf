/**
 * Screen-space refraction for the hero mark — Alche's method, on our material.
 *
 * `MeshPhysicalMaterial`'s `transmission` is honest refraction, and it pays for
 * it by rendering the WHOLE SCENE a second time into its own target, every
 * frame, before it can draw the glass. Measured here that is ~67 of our 142
 * draw calls — 48% of them — and 2.5ms of a 7.1ms frame.
 *
 * Alche never do that. Their bundle contains no MeshPhysicalMaterial at all.
 * A zero-size sentinel mesh sits at renderOrder 100 and, in onBeforeRender,
 * copies whatever has been drawn so far into a small buffer; the glass then
 * samples that buffer, offset along the surface normal, to fake the bend. One
 * cheap blit instead of a second scene.
 *
 * What that costs in accuracy: the refraction can only show what was already on
 * screen behind the mark. It cannot bend light around the silhouette, and
 * anything hidden behind the mark is not in the buffer to be refracted. For a
 * mark this size against a flat LED wall, that is a difference you have to go
 * looking for.
 *
 * The sampling loop below is theirs — 1x/2x/4x slide per channel is what
 * separates R, G and B, and it is the whole reason this reads as glass rather
 * than as a smear. Our own look is kept on top of it: the body colour still
 * comes from the wall's ramp, the waviness still rides on the same normal map,
 * and the rim still catches the sheen colour.
 */

export const screenGlassVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;

  void main () {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // view space: x/y line up with the screen, which is what makes the normal
    // usable as a screen-space offset below
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

export const screenGlassFrag = /* glsl */ `
  precision highp float;

  uniform sampler2D uSceneTex;
  uniform vec2 uResolution;
  uniform sampler2D uWaviness;
  uniform float uWavinessScale;
  uniform float uWavinessAmount;
  uniform float uRoughness;
  /** Driven from material.thickness — how far the refraction reaches. */
  uniform float uRefractPower;
  /** Driven from material.ior — how far apart R, G and B land. */
  uniform float uDispersion;
  uniform float uEnvIntensity;
  /** The wall's ramp, written every frame, exactly as attenuationColor was. */
  uniform vec3 uBodyColor;
  uniform vec3 uSheenColor;
  uniform float uIridescence;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;

  #define PI 3.14159265359
  #define SAMPLES 6

  float random (vec2 p) {
    return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float ggx (float dNH, float roughness) {
    float a2 = roughness * roughness;
    a2 = a2 * a2;
    float dNH2 = dNH * dNH;
    if (dNH2 <= 0.0) return 0.0;
    return a2 / (PI * pow(dNH2 * (a2 - 1.0) + 1.0, 2.0));
  }

  float fresnel (float d) {
    float f0 = 0.1;
    return f0 + (1.0 - f0) * pow(1.0 - d, 5.0);
  }

  void main (void) {
    vec2 sUv = gl_FragCoord.xy / uResolution;

    /* The same waviness field the physical material carried on normalMap: a few
       low-frequency sines, no high-frequency content, so it reads as cast
       optical glass rather than as scratches. */
    vec3 wav = texture2D(uWaviness, vUv * uWavinessScale).xyz * 2.0 - 1.0;
    vec3 normal = normalize(vNormalV + wav * uWavinessAmount);

    float rough = uRoughness;

    // the screen-space direction to bend along: strongest at grazing angles,
    // vanishing where the surface faces the camera
    vec2 refractNormal = normal.xy * (1.0 - normal.z * 0.7);

    vec3 refracted = vec3(0.0);
    for (int i = 0; i < SAMPLES; i++) {
      float fi = float(i);
      float slide = (0.005 + random(sUv + fi * 0.2) * 0.007) * uDispersion;
      /* Alche jitter by rough*0.3, but they refract a smooth scene. Ours is a
         lattice of hard dots, and a per-pixel random offset across it is
         salt-and-pepper rather than roughness -- so this stays small. */
      vec2 jitter = vec2(
        random(sUv + fi * 0.1) - 0.5,
        random(sUv + fi * 0.2) - 0.5
      ) * rough * 0.06;
      vec2 base = jitter + sUv;
      // 1x / 2x / 4x is what splits the channels — this is the dispersion
      vec2 uvR = base - refractNormal * (uRefractPower + slide * 1.0);
      vec2 uvG = base - refractNormal * (uRefractPower + slide * 2.0);
      vec2 uvB = base - refractNormal * (uRefractPower + slide * 4.0);
      refracted += vec3(
        texture2D(uSceneTex, uvR).x,
        texture2D(uSceneTex, uvG).y,
        texture2D(uSceneTex, uvB).z
      ) * 0.9;
    }
    refracted /= float(SAMPLES);

    /* Stain it the way Beer-Lambert absorption did: the tint survives, its
       complement is absorbed, and deeper through the body means more of both. */
    float depth = 1.0 - abs(normal.z);
    vec3 absorb = mix(vec3(1.0), uBodyColor, 0.35 + depth * 0.2);
    vec3 c = refracted * absorb * 3.2;

    /* The block is LIT by the room, not merely a window onto it. The physical
       material got this from scatter across a rough interior plus sheen; both
       are gone here, so it has to be stated.

       Kept low on purpose: this term is flat, so every unit of it is contrast
       removed from the refraction. Too much and the wall's dots stop reading
       through the glass, which is most of what makes it look like glass. */
    c += uBodyColor * 0.06 * (0.6 + depth);

    /* One key light, view space, matching the scene's directional.

       GGX is a distribution, not a colour: at roughness 0.1 its peak is around
       93,000, and adding that raw is what turned the whole mark white. It needs
       an intensity and a ceiling -- the ceiling is what keeps a near-mirror
       highlight from swallowing the refraction underneath it. */
    vec3 L = normalize(vec3(-1.0, 0.8, -1.0));
    vec3 H = normalize(vViewDir + L);
    float spec = ggx(max(dot(normal, H), 0.0), 0.02 + rough * 0.35);
    c += vec3(min(spec * 0.012, 0.9));

    /* Thin-film: the bands of unrelated colour across the block. A cheap
       angle-driven hue rather than a real interference model — at this size the
       difference does not survive the dot lattice behind it. */
    float ang = max(dot(vViewDir, normal), 0.0);
    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (ang * 2.4 + vec3(0.0, 0.33, 0.67)));
    c += irid * uIridescence * 0.12 * (1.0 - ang);

    // fresnel rim, carrying the sheen colour — this is the clearcoat's edge
    float F = fresnel(ang);
    c += uSheenColor * F * uEnvIntensity * 0.28;

    gl_FragColor = vec4(c, uOpacity);
  }
`
