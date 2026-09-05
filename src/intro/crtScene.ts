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

/** Tunables — overridable via query string while dialling in the shot. */
const YAW = num('yaw', 0.17) // ~10°: shows a sliver of the left casing
const FOV = num('fov', 26) // long-ish lens, keeps the box from splaying
const CAM_Y = num('camy', 0.16) // camera a touch above centre → slight look-down
const MARGIN = num('margin', 1.1) // padding around the model inside the canvas
const DEBUG = qs?.get('crtdebug') === '1'

// The CRT screen copy.
const SCREEN_LINES = [
  { t: 'ROHIT DIGGI', s: 40, c: '#eaf1ff', b: true, gap: 8 },
  { t: 'CHANNEL 06 · PERSONAL SIGNAL', s: 19, c: '#9dc0ff', gap: 44 },
  { t: 'WELCOME, VISITOR.', s: 23, c: '#dbe8ff', gap: 38 },
  { t: "YOU'RE ABOUT TO SEE WHAT HAPPENS", s: 21, c: '#c2d8ff', gap: 6 },
  { t: 'WHEN AN ENGINEER GETS BORED.', s: 21, c: '#c2d8ff', gap: 38 },
  { t: 'AI. SOFTWARE. SYSTEMS.', s: 21, c: '#c2d8ff', gap: 6 },
  { t: 'AND A QUESTIONABLE AMOUNT OF COFFEE.', s: 21, c: '#c2d8ff', gap: 44 },
  { t: '[ ENTER TO TRANSMIT ]', s: 22, c: '#ffffff', b: true, gap: 0 },
]

/**
 * Draws the CRT copy once into a canvas whose aspect matches the screen quad
 * (65534 x 49926 in the GLB → 1.313), so nothing is stretched.
 */
function makeTextTexture (): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 780
  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const totalH = SCREEN_LINES.reduce((a, l) => a + l.s + l.gap, 0)
  let y = (c.height - totalH) / 2 + 10
  for (const l of SCREEN_LINES) {
    y += l.s / 2
    g.font = `${l.b ? '700' : '500'} ${l.s * 1.55}px "Courier New", ui-monospace, monospace`
    g.fillStyle = l.c
    g.fillText(l.t, c.width / 2, y)
    y += l.s / 2 + l.gap
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = false
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping
  return tex
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

  const screenMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEnter: { value: 0 }, uText: { value: makeTextTexture() } },
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
  let projected = { w: 1.14, h: 1 } // model extents after normalising, filled on load

  const fitCamera = () => {
    const w = container.clientWidth
    const h = Math.max(1, container.clientHeight)
    camera.aspect = w / h
    const halfV = (camera.fov * Math.PI) / 360
    const distH = (projected.h * MARGIN) / 2 / Math.tan(halfV)
    const distW = (projected.w * MARGIN) / 2 / (Math.tan(halfV) * camera.aspect)
    const dist = num('dist', 0) || Math.max(distH, distW)
    camera.position.set(0, CAM_Y, dist)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  fitCamera()

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

    const norm = new Box3().setFromObject(root).getSize(new Vector3())
    // Silhouette width once yawed, so fitCamera can keep the whole box in frame.
    projected = {
      w: norm.x * Math.abs(Math.cos(YAW)) + norm.z * Math.abs(Math.sin(YAW)),
      h: norm.y,
    }

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
    const t = performance.now() * 0.001
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
    dispose: () => {
      if (disposed) return // idempotent — called at reveal and again at cleanup
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
