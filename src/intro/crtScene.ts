import {
  ACESFilmicToneMapping,
  AmbientLight,
  AxesHelper,
  Box3,
  CanvasTexture,
  ClampToEdgeWrapping,
  DirectionalLight,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Texture,
  TextureLoader,
  Scene,
  WebGLRenderTarget,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const MODEL = '/crt/crt_tv.glb'
/* One pre-rendered frame of the hero, shown on the tube when the channel locks.
   Optional: if it is not there the tube simply keeps showing its copy. */
const STILL = '/crt/hero-still.webp'

/* ------------------------------------------------------------------ *
 * Orientation, established from the GLB itself (not guessed):
 *   node "TVScreen" mean normal, after its node quaternion, is (0,0,-1)
 *   node "TVback"   mean normal, after its node quaternion, is (0,0,+1)
 * The camera sits on +Z, so the model root needs a 180° Y turn to bring
 * the glass around to face it. YAW is the extra three-quarter angle.
 * ------------------------------------------------------------------ */
const SCREEN_FACES = Math.PI

const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
const num = (k: string, d: number) => {
  const v = qs?.get(k)
  return v === null || v === undefined || v === '' ? d : Number(v)
}

/** Tunables — framed with ?tune=1, overridable via query string. */
const YAW = num('yaw', -0.384) // -22°: three-quarter, showing the right casing
const FOV = num('fov', 30) // lens; longer keeps the box from splaying
const CAM_Y = num('camy', 0.15) // camera a touch above centre → slight look-down
const MARGIN = num('margin', 1.099) // padding around the model (Size 0.91)
const DEBUG = qs?.get('crtdebug') === '1'

// The CRT screen copy.
const SCREEN_LINES = [
  { t: 'ROHIT DIGGI', s: 40, c: '#eaf1ff', b: true, gap: 8 },
  { t: 'CHANNEL 06 · PERSONAL SIGNAL', s: 19, c: '#9dc0ff', gap: 44 },
  { t: 'WELCOME, VISITOR.', s: 23, c: '#dbe8ff', gap: 38 },
  { t: "YOU'RE ABOUT TO SEE WHAT HAPPENS", s: 21, c: '#c2d8ff', gap: 6 },
  { t: 'WHEN AN ENGINEER GETS BORED.', s: 21, c: '#c2d8ff', gap: 38 },
  { t: 'AI. SOFTWARE. SYSTEMS.', s: 21, c: '#c2d8ff', gap: 6 },
  { t: 'AND A QUESTIONABLE AMOUNT OF CHAI.', s: 21, c: '#c2d8ff', gap: 44 },
  { t: '[ ENTER TO TRANSMIT ]', s: 22, c: '#ffffff', b: true, gap: 0 },
]

export type ScreenLine = { t: string; s: number; c: string; b?: boolean; gap: number }

/** Camera pose, the unit the keyframe editor records and the path player lerps. */
export interface CamState {
  px: number; py: number; pz: number
  tx: number; ty: number; tz: number
  fov: number
  /** Off-axis frame shift in NDC (0 = subject on the camera axis). Lets the
      tube sit off-centre without turning the camera, so the flight can begin
      on exactly the title framing and glide to centre as a lens shift. */
  ox?: number
  oy?: number
}
export interface CamKey { t: number; cam: CamState }

/**
 * The CRT's screen texture. Aspect matches the screen quad (65534 x 49926 in
 * the GLB → 1.313) so nothing is stretched. Redrawable, so the transition can
 * put SIGNAL LOST on the tube itself rather than on an overlay.
 */
function makeScreenTexture () {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 780
  const g = c.getContext('2d')!
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = false
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping

  /* Copy only, on a transparent ground, redrawn ONLY when the words change.
     The lattice underneath is computed per fragment in the shader, the way the
     hero wall does it — so this canvas is uploaded a handful of times for the
     whole intro rather than twenty times a second. */
  const setLines = (lines: ScreenLine[]) => {
    g.clearRect(0, 0, c.width, c.height)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const totalH = lines.reduce((a, l) => a + l.s + l.gap, 0)
    let y = (c.height - totalH) / 2 + 10
    for (const l of lines) {
      y += l.s / 2
      g.font = `${l.b ? '700' : '500'} ${l.s * 1.55}px "Courier New", ui-monospace, monospace`
      g.fillStyle = l.c
      g.fillText(l.t, c.width / 2, y)
      y += l.s / 2 + l.gap
    }
    tex.needsUpdate = true
  }
  setLines(SCREEN_LINES)
  return { tex, setLines }
}

const screenVert = /* glsl */ `
  varying vec2 vUv;
  void main () { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const screenFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uEnter;      // 0..1 signal breakup
  uniform float uChaos;      // extra interference while the channel is hunted
  uniform float uContentMix; // 0 = copy on the tube, 1 = the model on the tube
  uniform float uFlash;      // tube blowing out — the channel-change pulses
  uniform float uDispAspect; // aspect of the surface being drawn on
  uniform float uLedPitch;   // lamps across the display
  uniform float uOverlay;    // 1 = draw only the tube's effects, over the live page
  uniform sampler2D uText;
  uniform sampler2D uContent;
  varying vec2 vUv;

  // the wall's ramp: violet / cyan / amber / pink, no green
  const vec3 VIOLET = vec3(0.545, 0.427, 1.0);
  const vec3 CYAN   = vec3(0.133, 0.827, 0.933);
  const vec3 AMBER  = vec3(0.961, 0.620, 0.043);
  const vec3 PINK   = vec3(0.925, 0.282, 0.600);

  float hash (vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

  void main () {
    // Curved glass.
    vec2 uv = vUv * 2.0 - 1.0;
    uv *= 1.0 + 0.045 * dot(uv, uv);
    vec2 suv = uv * 0.5 + 0.5;

    // Occasional rolling horizontal tear.
    float band = fract(suv.y * 1.1 - uTime * 0.16);
    float tear = smoothstep(0.022, 0.0, abs(band - 0.5) - 0.014);
    float jit = hash(vec2(floor(uTime * 10.0), floor(suv.y * 170.0))) - 0.5;
    suv.x += tear * jit * (0.028 + uEnter * 0.10);

    // Text, with RGB separation.
    float sep = 0.0022 + uEnter * 0.012 + uChaos * 0.02;
    float tr = texture2D(uText, suv + vec2(sep, 0.0)).r;
    float tg = texture2D(uText, suv).g;
    float tb = texture2D(uText, suv - vec2(sep, 0.0)).b;
    float ta = texture2D(uText, suv).a;

    /* The broadcast that locks on: the hero's own mark, rendered live into its
       own buffer. Sampled clean — no split, no snow, no scanline over it. It is
       meant to be the same object the page shows a moment later, so anything
       done to it here is a difference the reveal would have to undo. */
    /* Aspect-fit, not stretch. The content buffer is 1.3128 (the glass), but
       full screen the surface is the viewport — sampling it straight smeared
       the mark sideways into a blob. Widening the sample coordinate on the long
       axis letterboxes it instead, so the mark keeps its shape on any surface. */
    const float CONT_ASPECT = 1.3128;
    vec2 cuv = suv - 0.5;
    if (uDispAspect > CONT_ASPECT) cuv.x *= uDispAspect / CONT_ASPECT;
    else cuv.y *= CONT_ASPECT / uDispAspect;
    cuv += 0.5;
    vec4 cont = texture2D(uContent, cuv);
    if (cuv.x < 0.0 || cuv.x > 1.0 || cuv.y < 0.0 || cuv.y > 1.0) cont = vec4(0.0);
    float lock = cont.a * uContentMix;

    /* THE DISPLAY.

       The wall's own technique, ported: no dot geometry and no canvas arcs —
       work out which cell of the lattice this pixel is in, measure its distance
       from that cell's centre, and let fwidth antialias the edge. One shader,
       one draw, and the dots stay perfectly round at any resolution. Drawing
       ~1200 arcs onto a canvas twenty times a second, or a per-pixel noise
       field sixty times a second, were both far more work than this.

       uLedPitch scales the lattice down without touching anything else. */
    vec2 cells = vec2(uLedPitch, uLedPitch / max(0.2, uDispAspect));
    vec2 cellUv = fract(suv * cells) - 0.5;
    vec2 cellCentre = (floor(suv * cells) + 0.5) / cells;

    // the wall's colour programme, sampled once per cell so a lamp is one colour
    float u2 = cellCentre.x;
    float v2 = cellCentre.y;
    float f =
      (sin(u2 * 5.0 + uTime * 1.6) +
       sin(v2 * 3.5 - uTime * 1.1) +
       sin((u2 + v2) * 4.0 + uTime * 0.7)) / 3.0;
    float ramp = (f * 0.5 + 0.5) * 4.0;
    int i0 = int(mod(floor(ramp), 4.0));
    vec3 c0 = i0 == 0 ? VIOLET : i0 == 1 ? CYAN : i0 == 2 ? AMBER : PINK;
    int i1 = int(mod(floor(ramp) + 1.0, 4.0));
    vec3 c1 = i1 == 0 ? VIOLET : i1 == 1 ? CYAN : i1 == 2 ? AMBER : PINK;
    float lampBright = 0.35 + 0.65 * (sin(u2 * 11.0 + v2 * 9.0 + uTime * 3.0) * 0.5 + 0.5);
    vec3 lamp = mix(c0, c1, fract(ramp)) * lampBright;

    // the lamp itself — round, antialiased by the pixel's own footprint
    float d = length(cellUv);
    float fw = max(fwidth(d), 0.0008);
    float lampMask = 1.0 - smoothstep(0.30 - fw, 0.30 + fw, d);

    float grain = hash(suv * 620.0 + uTime * 60.0);
    float interference = clamp(uChaos * (0.4 + 0.6 * grain), 0.0, 0.95);

    // the display: the lattice, torn by interference
    vec3 col = lamp * lampMask * (1.0 - interference * 0.75);
    col += vec3(0.62, 0.78, 1.0) * grain * interference * 0.55;

    // the copy and the mark sit ON the display, crisp, the way the contact
    // screen holds "Contact me" over the wall
    col = mix(col, vec3(tr, tg, tb), ta * (1.0 - uContentMix));
    col = mix(col, cont.rgb, lock);

    /* WINDOW MODE.

       The hero is a real, running scene on its own canvas directly beneath this
       one. Rather than copy it into a texture — which would mean a second
       render of it every frame, the exact cost this screen exists to avoid —
       the tube stops painting a picture and paints only its own artefacts, with
       alpha. The page shows through the gaps, so what you are watching IS the
       live hero, seen through a television. */
    if (uOverlay > 0.5) {
      vec2 ev = suv - 0.5;
      float scan = 0.22 * (0.5 - 0.5 * sin(suv.y * 820.0));
      float vig = smoothstep(0.28, 1.05, dot(ev, ev) * 2.2);
      float lat = lampMask * 0.18;
      float noise = interference * 0.6;
      float a = clamp(scan + vig * 0.92 + lat + ta + noise, 0.0, 1.0);
      float inv = 1.0 / max(a, 0.001);
      vec3 c = vec3(0.0);
      c = mix(c, lamp, clamp(lat * inv, 0.0, 1.0));
      c = mix(c, vec3(0.62, 0.78, 1.0), clamp(noise * inv, 0.0, 1.0));
      c = mix(c, vec3(tr, tg, tb), clamp(ta * inv, 0.0, 1.0));
      c += vec3(0.66, 0.80, 1.0) * uFlash;
      // outside the curved glass is the bezel: solid, not see-through
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) { c = vec3(0.0); a = 1.0; }
      gl_FragColor = vec4(c, a);
      return;
    }

    // the tube's own artefacts back off wherever the mark is
    col *= mix(0.80 + 0.20 * sin(suv.y * 820.0), 1.0, lock * 0.85);   // scanlines
    col *= mix(0.95 + 0.05 * sin(uTime * 31.0) + uEnter * 0.2, 1.0, lock * 0.85);
    col *= vec3(0.84, 0.94, 1.12);                               // cold tube cast

    // Glass falloff. Written as 1.0 - smoothstep(lo, hi, d): smoothstep with
    // edge0 > edge1 is undefined in GLSL and misbehaves on some Intel iGPUs.
    vec2 e = suv - 0.5;
    col *= 1.0 - smoothstep(0.34, 1.05, dot(e, e) * 2.2);

    /* The channel-change pulse. Added after the vignette so the whole tube
       lifts, including its dark edges — a CRT surging does not respect the
       falloff. Clamped inside the glass bounds below. */
    col += vec3(0.66, 0.80, 1.0) * uFlash;

    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col = vec3(0.0);
    gl_FragColor = vec4(col, 1.0);
  }
`

const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main () { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

/* The sign-off warp. Alche do this as a glass mesh refracting a screen-space
   capture of the page; the giveaway in their mainLogoFrag is that R, G and B
   are sampled at 1x, 2x and 4x the SAME offset rather than a symmetric split,
   which is what gives the edges that rainbow smear. This is the same idea run
   as one full-screen pass over the intro's own render, which costs a single
   quad instead of a refracting mesh and a cube map. */
const warpFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uProg;
  uniform vec2 uRes;
  uniform vec2 uCenter;   // where the glass is on screen, in uv
  varying vec2 vUv;

  #define PI 3.14159265359

  /* Alche's finalCompositeFrag, ported.

     Theirs is four lines and no chromatic aberration at all — the rainbow on
     their site is mainLogoFrag, a glass material on the logo MESH, which is a
     different effect entirely. Copying it into a full-screen pass is what
     turned this into a purple smear.

       r        = one circular front, its edge softening as it travels
       sin(r*PI)= a single radial push, zero at both ends, peaking at the front
       alpha    = the same front, wiping this layer off the page beneath

     They crossfade to the destination as a texture. We cannot sample the hero
     (separate context), so the front drives ALPHA instead and the page shows
     through — same wipe, same wave, no second texture. The destination's 2x-to-
     1:1 settle is done as a CSS transform on the page itself. */
  void main () {
    float asp = uRes.x / max(1.0, uRes.y);
    vec2 cuv = vUv - uCenter;
    cuv.x *= asp;

    float p = clamp(uProg, 0.0, 1.0);
    float r = smoothstep(0.0, 0.2 + p * 0.7, -length(cuv) + p * 1.4);

    vec2 push = sin(r * PI) * normalize(cuv + 1e-6) * 0.1;
    push.x /= asp;
    vec2 uv = vUv - push;

    vec4 col = texture2D(uTex, uv);
    // the outgoing layer is wiped off on the same front that carries the wave
    float a = col.a * (1.0 - smoothstep(0.0, 0.5, r));
    gl_FragColor = vec4(col.rgb, a);
  }
`

export interface CrtHandle {
  setEnter: (v: number) => void
  dispose: () => void
  onReady: (cb: () => void) => void
  /** replace the copy on the tube */
  setScreenText: (lines: ScreenLine[]) => void
  /** interference while the channel is being hunted, 0..1 */
  setChaos: (v: number) => void
  /** cut to the tube's picture filling the viewport (no camera, no geometry) */
  setProjection: (on: boolean) => void
  /** paint only the tube's artefacts, so the live page shows through */
  setOverlay: (on: boolean) => void
  /** blow the tube out — drives the channel-change pulses */
  setFlash: (v: number) => void
  /** crossfade the tube from type to the live model, 0..1 */
  setContentMix: (v: number) => void
  /** the spherical sign-off warp, 0..1 */
  setWarp: (v: number) => void
  /** pull the hero's model in for the tube (also warms it for the page) */
  loadContent: () => Promise<boolean>
  /** camera rig — used by the ?cam=1 keyframe editor and the ENTER flight */
  getCam: () => CamState
  /** the full-frame pose that matches how the set is framed in its CSS box */
  matchBox: () => CamState
  /** square on the glass; coverage = how much of the frame the picture fills */
  screenPose: (coverage?: number, fov?: number) => CamState
  setCam: (c: CamState) => void
  /** back to the automatic framing that fits the set into its CSS box */
  clearCam: () => void
  /** fly the camera through the keys; `t` is ms from the start of the path */
  playPath: (keys: CamKey[], onDone?: () => void) => void
  stopPath: () => void
}

export function createCrtScene (container: HTMLElement): CrtHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)) // spec: cap DPR
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = num('exp', 0.7)
  /* The mark is transmissive, and a transmissive material makes three render
     the scene again into a transmission buffer every frame. Alche sidestep that
     cost entirely by hand-rolling the refraction in mainLogoFrag rather than
     using a physical transmission pass. Three's equivalent lever is the
     resolution of that buffer — on a mark this size inside a 448px tube buffer,
     a third of full res is indistinguishable and roughly a tenth of the work. */
  renderer.transmissionResolutionScale = num('trans', 0.34)
  renderer.setClearColor(0x000000, 0) // transparent → the room plate shows through
  container.appendChild(renderer.domElement)
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'

  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 100)

  /* Lighting matched to the room plate: a warm pink desk lamp off to the left,
     a cold city-window wash from the left/behind, near-black ambient, and the
     screen's own glow doing the close work on the bezel. No shadows (spec). */
  scene.add(new AmbientLight(0x241f36, num('amb', 0.5)))
  // warm pink key from the desk lamp, hard off to the left
  const lamp = new DirectionalLight(0xff7fb4, num('key', 1.15))
  lamp.position.set(-5, 1.8, 2.4)
  scene.add(lamp)
  // cold window rim from the left/behind, catching the top edge of the case
  const window_ = new DirectionalLight(0x6f8cff, num('rim', 0.8))
  window_.position.set(-3, 2.6, -2.6)
  scene.add(window_)
  const screenGlow = new PointLight(0x74a0ff, 2.0, 4, 2)
  scene.add(screenGlow)

  /* ---- what the tube shows when it locks on -------------------------
     A STILL. Not a live scene.

     This was a second three.js scene rendering the hero's mark every frame
     with a transmissive material — which makes three render the scene AGAIN
     into a transmission buffer, every frame — plus a 2.5MB GLB fetched before
     the page it belongs to, plus a PMREM environment built at run time.

     All of that was inside a loading screen. The intro exists to keep the first
     paint cheap enough to open on a weak machine; paying for a second live 3D
     scene to decorate it is the opposite of the point. A pre-rendered frame
     costs one texture upload and nothing per frame after that. */
  const stillTex = { value: null as Texture | null }
  let stillLoaded = false

  const screen = makeScreenTexture()
  const screenMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnter: { value: 0 },
      uChaos: { value: 0 },
      uContentMix: { value: 0 },
      uFlash: { value: 0 },
      uDispAspect: { value: 1.3128 },
      uLedPitch: { value: num('leds', 74) },
      uOverlay: { value: 0 },
      uText: { value: screen.tex },
      uContent: { value: null },
    },
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    toneMapped: false,
  })

  // The sign-off pass: the scene is captured here and warped by warpFrag.
  const sceneRT = new WebGLRenderTarget(2, 2)
  const postScene = new Scene()
  const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const postMat = new ShaderMaterial({
    uniforms: {
      uTex: { value: null },
      uProg: { value: 0 },
      uRes: { value: [2, 2] },
      uCenter: { value: [0.5, 0.5] },
    },
    vertexShader: quadVert,
    fragmentShader: warpFrag,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  })
  postScene.add(new Mesh(new PlaneGeometry(2, 2), postMat))
  let warp = 0

  /* The projection: the tube's picture drawn straight onto the viewport, with
     no model and no camera involved at all. Pressing ENTER cuts to this rather
     than flying a camera at the set — there is no geometry to rotate, shear or
     resize, so none of that can go wrong. It shares the screen material's
     uniform objects by reference, so the two surfaces are always the same
     broadcast; only the vertex stage differs. */
  const projScene = new Scene()
  const projMat = new ShaderMaterial({
    uniforms: screenMat.uniforms,
    vertexShader: quadVert,
    fragmentShader: screenFrag,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  projScene.add(new Mesh(new PlaneGeometry(2, 2), projMat))
  let projection = false

  // rig: yaw lives on the pivot, the model is re-centred inside it, so the box
  // always spins about its own middle no matter how the GLB was authored.
  const pivot = new Group()
  pivot.rotation.y = SCREEN_FACES + YAW
  scene.add(pivot)

  const readyCbs: (() => void)[] = []
  let disposed = false
  let ready = false
  let norm = new Vector3(1.04, 1, 0.86) // model extents after normalising, filled on load
  // the glass, in world space — filled once the model loads
  const screenCentre = new Vector3(0, 0, 0.4)
  const screenNormal = new Vector3(0, 0, 1)
  const screenSize = { x: 0.9, y: 0.68, set (a: number, b: number) { this.x = a; this.y = b } }
  let projected = { w: 1.14, h: 1 }

  const PUSH = num('push', 1.05) // camera distance multiplier — dollies the set back

  /** Silhouette width at the yaw, so framing keeps the whole box in view. */
  const reproject = () => {
    projected = {
      w: norm.x * Math.abs(Math.cos(YAW)) + norm.z * Math.abs(Math.sin(YAW)),
      h: norm.y,
    }
  }

  // When set, the camera is being driven by hand (the keyframe editor) or by
  // the ENTER flight, and the automatic framing stands down.
  let manual: CamState | null = null

  const applyManual = (c: CamState) => {
    camera.fov = c.fov
    camera.position.set(c.px, c.py, c.pz)
    camera.lookAt(c.tx, c.ty, c.tz)
    const ox = c.ox ?? 0
    const oy = c.oy ?? 0
    // setViewOffset skews the frustum instead of moving the camera, so the
    // subject shifts in frame with no change of viewing angle. Trucking the
    // camera sideways to do the same job would swing us ~17 degrees round the
    // tube and show a visibly different face of it.
    if (ox !== 0 || oy !== 0) camera.setViewOffset(1000, 1000, -ox * 500, oy * 500, 1000, 1000)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }

  const fitCamera = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    if (manual) {
      applyManual(manual)
    } else {
      camera.fov = FOV
      const halfV = (FOV * Math.PI) / 360
      const distH = (projected.h * MARGIN) / 2 / Math.tan(halfV)
      const distW = (projected.w * MARGIN) / 2 / (Math.tan(halfV) * camera.aspect)
      camera.position.set(0, CAM_Y, Math.max(distH, distW) * PUSH)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
    }
    // updateStyle=false: the element's size is CSS's job, we only own the buffer
    renderer.setSize(w, h, false)
    const pr = renderer.getPixelRatio()
    sceneRT.setSize(Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr)))
    postMat.uniforms.uRes.value = [w, h]
  }
  fitCamera()

  /* ---- keyframe path player ------------------------------------------
     Keys hold absolute times in ms. Each segment is eased in and out on its
     own, so a hold (two keys with the same pose) reads as a deliberate beat
     rather than a stall. */
  let path: CamKey[] | null = null
  let pathT0 = 0
  let pathDone: (() => void) | null = null
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k

  const stepPath = (now: number) => {
    if (!path || path.length === 0) return
    const t = now - pathT0
    const last = path[path.length - 1]
    if (t >= last.t) {
      manual = { ...last.cam }
      applyManual(manual)
      path = null
      const cb = pathDone
      pathDone = null
      cb?.()
      return
    }
    /* One ease across the WHOLE flight, then straight interpolation between
       keys. Easing each segment separately made the camera decelerate into
       every keyframe and pull away again — three stutters in a 2.6s move. */
    const total = last.t
    const gt = ease(t / total) * total
    let i = 0
    while (i < path.length - 1 && path[i + 1].t <= gt) i++
    const a = path[i]
    const b = path[Math.min(i + 1, path.length - 1)]
    const span = Math.max(1, b.t - a.t)
    const k = Math.min(1, Math.max(0, (gt - a.t) / span))
    manual = {
      px: lerp(a.cam.px, b.cam.px, k), py: lerp(a.cam.py, b.cam.py, k), pz: lerp(a.cam.pz, b.cam.pz, k),
      tx: lerp(a.cam.tx, b.cam.tx, k), ty: lerp(a.cam.ty, b.cam.ty, k), tz: lerp(a.cam.tz, b.cam.tz, k),
      fov: lerp(a.cam.fov, b.cam.fov, k),
      ox: lerp(a.cam.ox ?? 0, b.cam.ox ?? 0, k),
      oy: lerp(a.cam.oy ?? 0, b.cam.oy ?? 0, k),
    }
    applyManual(manual)
  }

  // The canvas box is sized by CSS custom properties, which can change without
  // any window resize (a media query, a container query, a font swap). Watching
  // the element directly is the only way to keep the drawing buffer in step —
  // when it drifts, CSS stretches the canvas and the model gets clipped.
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fitCamera()) : null
  ro?.observe(container)

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.load(MODEL, (gltf) => {
    if (disposed) return
    const root = gltf.scene

    // Normalise: unit height, geometric centre on the pivot origin. Scale first,
    // then re-measure — measuring once and reusing the pre-scale centre is what
    // threw the model off-frame before.
    const pre = new Box3().setFromObject(root)
    const size = pre.getSize(new Vector3())
    root.scale.setScalar(1 / size.y)
    root.updateMatrixWorld(true)
    const post = new Box3().setFromObject(root)
    root.position.sub(post.getCenter(new Vector3()))
    root.updateMatrixWorld(true)

    norm = new Box3().setFromObject(root).getSize(new Vector3())
    reproject()

    let screenPos = new Vector3(0, 0, 0.4)
    let screenMesh: Mesh | null = null
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.frustumCulled = true
      m.castShadow = false
      m.receiveShadow = false
      const n = `${m.name} ${(m.material as { name?: string })?.name ?? ''}`.toLowerCase()
      const isScreen = /screen|glass|display|monitor/.test(n)
      if (isScreen) {
        m.material = screenMat
        m.getWorldPosition(screenPos)
        screenMesh = m
      } else if (DEBUG) {
        // Debug: flat white casing so the silhouette (and which face we're on)
        // is unmistakable at a glance.
        m.material = new MeshBasicMaterial({ color: 0x9aa4c0 })
      }
    })

    pivot.add(root)
    // Glow sits just in front of the glass, in pivot space.
    screenGlow.position.set(screenPos.x, screenPos.y, screenPos.z + 0.35)
    pivot.add(screenGlow)

    /* Measure the glass in world space, AFTER the pivot's yaw is in the matrix.
       The flight used to aim at (0,0,0) — the bounding-box centre, which is
       buried inside the tube body — and push straight down -Z, while the screen
       is yawed 22 degrees away from that axis. So the camera drove into the
       casing instead of squaring up on the picture. */
    const sm = screenMesh as Mesh | null
    if (sm) {
      pivot.updateMatrixWorld(true)
      sm.getWorldPosition(screenCentre)
      // the screen quad's own normal is local +Z (decoded from the GLB)
      screenNormal.set(0, 0, 1).applyQuaternion(sm.getWorldQuaternion(new Quaternion())).normalize()
      sm.geometry.computeBoundingBox()
      const bb = sm.geometry.boundingBox
      if (bb) {
        const size = bb.getSize(new Vector3())
        const ws = sm.getWorldScale(new Vector3())
        screenSize.set(size.x * ws.x, size.y * ws.y)
      }
    }

    if (DEBUG) scene.add(new AxesHelper(1.2)) // red=+X green=+Y blue=+Z

    fitCamera()
    ready = true
    readyCbs.forEach((cb) => cb())
  })

  // ---- render loop (no per-frame allocations) ----
  let raf = 0
  const tick = () => {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    const now = performance.now()
    if (path) stepPath(now)
    const t = now * 0.001

    screenMat.uniforms.uTime.value = t
    // the tube's own light, so a pulse throws itself across the room too
    screenGlow.intensity =
      2.2 +
      Math.sin(t * 19.0) * 0.25 +
      screenMat.uniforms.uEnter.value * 4.0 +
      screenMat.uniforms.uFlash.value * 9.0

    // once we have cut to the projection, the room is no longer drawn at all
    const source = projection ? projScene : scene
    const sourceCam = projection ? postCam : camera
    // on the tube the surface is the glass; full screen it is the viewport
    screenMat.uniforms.uDispAspect.value = projection
      ? container.clientWidth / Math.max(1, container.clientHeight)
      : 1.3128

    if (warp > 0.0005) {
      renderer.setRenderTarget(sceneRT)
      renderer.clear()
      renderer.render(source, sourceCam)
      renderer.setRenderTarget(null)
      // the bubble is born at the glass, wherever the glass happens to be
      const sp = screenCentre.clone().project(camera)
      postMat.uniforms.uCenter.value = [sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5]
      postMat.uniforms.uTex.value = sceneRT.texture
      postMat.uniforms.uProg.value = warp
      renderer.render(postScene, postCam)
    } else {
      renderer.render(source, sourceCam)
    }
  }
  raf = requestAnimationFrame(tick)

  const onResize = () => fitCamera()
  window.addEventListener('resize', onResize)

  return {
    setEnter: (v: number) => { screenMat.uniforms.uEnter.value = v },
    onReady: (cb) => { if (ready) cb(); else readyCbs.push(cb) },
    setScreenText: (lines: ScreenLine[]) => screen.setLines(lines),
    setChaos: (v: number) => { screenMat.uniforms.uChaos.value = v },
    setProjection: (on: boolean) => { projection = on },
    setOverlay: (on: boolean) => { screenMat.uniforms.uOverlay.value = on ? 1 : 0 },
    setFlash: (v: number) => { screenMat.uniforms.uFlash.value = v },
    setContentMix: (v: number) => { screenMat.uniforms.uContentMix.value = v },
    setWarp: (v: number) => { warp = v },
    loadContent: () => {
      if (stillLoaded) return Promise.resolve(true)
      return new Promise<boolean>((resolve) => {
        new TextureLoader().load(
          STILL,
          (t) => {
            if (disposed) return resolve(false)
            t.colorSpace = SRGBColorSpace
            t.minFilter = LinearFilter
            t.magFilter = LinearFilter
            t.generateMipmaps = false
            t.wrapS = t.wrapT = ClampToEdgeWrapping
            stillTex.value = t
            screenMat.uniforms.uContent.value = t
            stillLoaded = true
            resolve(true)
          },
          undefined,
          // no still shipped yet: the tube just keeps showing its copy
          () => resolve(false),
        )
      })
    },
    getCam: () => ({
      px: +camera.position.x.toFixed(3),
      py: +camera.position.y.toFixed(3),
      pz: +camera.position.z.toFixed(3),
      tx: manual?.tx ?? 0, ty: manual?.ty ?? 0, tz: manual?.tz ?? 0,
      fov: camera.fov,
      ox: manual?.ox ?? 0, oy: manual?.oy ?? 0,
    }),
    screenPose: (coverage = 1.2, fov = FOV) => {
      /* Sit on the screen's own normal, looking at the screen's centre, far
         enough back that the glass covers `coverage` of the frame. Derived from
         the mesh, so it stays correct whatever the yaw is set to — and every
         key on this axis means the camera approaches square to the picture
         instead of swinging past a tube that is yawed away from it. */
      const w = container.clientWidth || window.innerWidth
      const h = container.clientHeight || window.innerHeight
      const aspect = w / Math.max(1, h)
      const tan = Math.tan((fov * Math.PI) / 360)
      const dH = screenSize.y / (2 * coverage * tan)
      const dW = screenSize.x / (2 * coverage * tan * aspect)
      const d = Math.max(dH, dW)
      const p = screenCentre.clone().addScaledVector(screenNormal, d)
      return {
        px: +p.x.toFixed(4), py: +p.y.toFixed(4), pz: +p.z.toFixed(4),
        tx: +screenCentre.x.toFixed(4), ty: +screenCentre.y.toFixed(4), tz: +screenCentre.z.toFixed(4),
        fov, ox: 0, oy: 0,
      }
    },
    matchBox: () => {
      /* The pose that reproduces the current framing once the canvas goes
         full-frame. Derived from the box's real rect rather than hard-coded,
         so the flight starts on precisely what the visitor is looking at, at
         any window shape. Pulling back by vh/boxHeight keeps the tube the same
         on-screen size; the shift puts it back where the box had it. */
      const r = container.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const d0 = camera.position.z
      if (!r.height || !vh) return { px: 0, py: CAM_Y, pz: d0, tx: 0, ty: 0, tz: 0, fov: camera.fov, ox: 0, oy: 0 }
      const k = vh / r.height
      return {
        px: 0,
        py: CAM_Y * k, // scaled with the distance so the tilt angle is preserved
        pz: d0 * k,
        tx: 0, ty: 0, tz: 0,
        fov: camera.fov,
        ox: (2 * (r.left + r.width / 2)) / vw - 1,
        oy: 1 - (2 * (r.top + r.height / 2)) / vh,
      }
    },
    setCam: (c: CamState) => { path = null; manual = { ...c }; applyManual(manual) },
    clearCam: () => { path = null; manual = null; fitCamera() },
    playPath: (keys: CamKey[], onDone?: () => void) => {
      if (!keys.length) return
      path = [...keys].sort((a, b) => a.t - b.t)
      pathT0 = performance.now()
      pathDone = onDone ?? null
    },
    stopPath: () => { path = null; pathDone = null },
    dispose: () => {
      if (disposed) return // idempotent — called at reveal and again at cleanup
      disposed = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
      sceneRT.dispose()
      stillTex.value?.dispose()
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
