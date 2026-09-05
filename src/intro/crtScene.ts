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
  PointLight,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const MODEL = '/crt/crt_tv.glb'

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

  const draw = (lines: ScreenLine[]) => {
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
  draw(SCREEN_LINES)
  return { tex, draw }
}

const screenVert = /* glsl */ `
  varying vec2 vUv;
  void main () { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const screenFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uEnter;      // 0..1 signal breakup
  uniform sampler2D uText;
  varying vec2 vUv;

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
    float sep = 0.0022 + uEnter * 0.012;
    float tr = texture2D(uText, suv + vec2(sep, 0.0)).r;
    float tg = texture2D(uText, suv).g;
    float tb = texture2D(uText, suv - vec2(sep, 0.0)).b;
    float ta = texture2D(uText, suv).a;

    // Dense two-scale snow, swelling during ENTER until it eats the signal.
    // Gamma'd so it speckles instead of laying down a flat blue veil that
    // would drown the copy.
    float s1 = hash(suv * vec2(540.0, 400.0) + uTime * 61.0);
    float s2 = hash(suv * vec2(160.0, 690.0) - uTime * 37.0);
    float snow = pow(mix(s1, s2, 0.35), 2.0);
    // whole scan rows brighten and dim together → horizontal streaking
    float row = hash(vec2(floor(suv.y * 240.0), floor(uTime * 22.0)));
    snow *= 0.62 + 0.6 * row;

    vec3 tube = vec3(0.022, 0.038, 0.085);
    vec3 snowCol = mix(vec3(0.20, 0.50, 0.95), vec3(0.82, 0.92, 1.0), snow);
    // The signal burns through the snow where the copy is, so the text stays
    // readable instead of being chewed up by the streaking.
    vec3 col = tube + snowCol * snow * (0.78 + uEnter * 2.4) * (1.0 - ta * 0.6);
    col += vec3(tr, tg, tb) * ta * (1.9 - uEnter * 1.4);

    col *= 0.80 + 0.20 * sin(suv.y * 820.0);                     // scanlines
    col *= 0.95 + 0.05 * sin(uTime * 31.0) + uEnter * 0.85;      // flicker + surge
    col *= vec3(0.84, 0.94, 1.12);                               // cold tube cast

    // Glass falloff. Written as 1.0 - smoothstep(lo, hi, d): smoothstep with
    // edge0 > edge1 is undefined in GLSL and misbehaves on some Intel iGPUs.
    vec2 e = suv - 0.5;
    col *= 1.0 - smoothstep(0.34, 1.05, dot(e, e) * 2.2);

    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col = vec3(0.0);
    gl_FragColor = vec4(col, 1.0);
  }
`

export interface CrtHandle {
  setEnter: (v: number) => void
  dispose: () => void
  onReady: (cb: () => void) => void
  /** replace the copy on the tube (SIGNAL LOST, SYSTEM ONLINE, …) */
  setScreenText: (lines: ScreenLine[]) => void
  /** camera rig — used by the ?cam=1 keyframe editor and the ENTER flight */
  getCam: () => CamState
  /** the full-frame pose that matches how the set is framed in its CSS box */
  matchBox: () => CamState
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

  const screen = makeScreenTexture()
  const screenMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEnter: { value: 0 }, uText: { value: screen.tex } },
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    toneMapped: false,
  })

  // rig: yaw lives on the pivot, the model is re-centred inside it, so the box
  // always spins about its own middle no matter how the GLB was authored.
  const pivot = new Group()
  pivot.rotation.y = SCREEN_FACES + YAW
  scene.add(pivot)

  const readyCbs: (() => void)[] = []
  let disposed = false
  let ready = false
  let norm = new Vector3(1.04, 1, 0.86) // model extents after normalising, filled on load
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
    let i = 0
    while (i < path.length - 1 && path[i + 1].t <= t) i++
    const a = path[i]
    const b = path[Math.min(i + 1, path.length - 1)]
    const span = Math.max(1, b.t - a.t)
    const k = ease(Math.min(1, Math.max(0, (t - a.t) / span)))
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
    screenGlow.intensity = 2.2 + Math.sin(t * 19.0) * 0.25 + screenMat.uniforms.uEnter.value * 4.0
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(tick)

  const onResize = () => fitCamera()
  window.addEventListener('resize', onResize)

  return {
    setEnter: (v: number) => { screenMat.uniforms.uEnter.value = v },
    onReady: (cb) => { if (ready) cb(); else readyCbs.push(cb) },
    setScreenText: (lines: ScreenLine[]) => screen.draw(lines),
    getCam: () => ({
      px: +camera.position.x.toFixed(3),
      py: +camera.position.y.toFixed(3),
      pz: +camera.position.z.toFixed(3),
      tx: manual?.tx ?? 0, ty: manual?.ty ?? 0, tz: manual?.tz ?? 0,
      fov: camera.fov,
      ox: manual?.ox ?? 0, oy: manual?.oy ?? 0,
    }),
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
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
