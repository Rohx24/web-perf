import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CanvasTexture,
  ClampToEdgeWrapping,
  DirectionalLight,
  LinearFilter,
  Mesh,
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

// The CRT screen copy (spec-defined).
const SCREEN_LINES = [
  { t: 'ROHIT DIGGI', s: 34, c: '#dfe9ff', b: true, gap: 6 },
  { t: 'CHANNEL 06 · PERSONAL SIGNAL', s: 15, c: '#8fb7ff', gap: 34 },
  { t: 'WELCOME, VISITOR.', s: 18, c: '#cfe0ff', gap: 30 },
  { t: "YOU'RE ABOUT TO SEE WHAT HAPPENS", s: 16, c: '#a9c6ff', gap: 4 },
  { t: 'WHEN AN ENGINEER GETS BORED.', s: 16, c: '#a9c6ff', gap: 30 },
  { t: 'AI. SOFTWARE. SYSTEMS.', s: 16, c: '#a9c6ff', gap: 4 },
  { t: 'AND A QUESTIONABLE AMOUNT OF COFFEE.', s: 16, c: '#a9c6ff', gap: 34 },
  { t: '[ ENTER TO TRANSMIT ]', s: 17, c: '#eaf2ff', b: true, gap: 0 },
]

/** Draws the CRT text once into a modest 1024x512 canvas (spec: not 4K). */
function makeTextTexture (): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const totalH = SCREEN_LINES.reduce((a, l) => a + l.s + l.gap, 0)
  let y = (c.height - totalH) / 2 + 8
  for (const l of SCREEN_LINES) {
    y += l.s / 2
    g.font = `${l.b ? '700' : '500'} ${l.s * 1.7}px "Courier New", monospace`
    g.fillStyle = l.c
    g.fillText(l.t, c.width / 2, y)
    y += l.s / 2 + l.gap
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
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
  uniform float uEnter;      // 0..1 transition (breakup)
  uniform sampler2D uText;
  varying vec2 vUv;

  float hash (vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

  void main () {
    // Curved-glass barrel distortion.
    vec2 uv = vUv * 2.0 - 1.0;
    uv *= 1.0 + 0.06 * dot(uv, uv);
    vec2 suv = uv * 0.5 + 0.5;

    // Horizontal interference: an occasional rolling tear.
    float tear = smoothstep(0.4, 0.0, abs(fract(suv.y * 1.3 - uTime * 0.25) - 0.5) - 0.02);
    float roll = (hash(vec2(floor(uTime * 8.0), floor(suv.y * 120.0))) - 0.5);
    float shove = tear * roll * (0.02 + uEnter * 0.08);
    suv.x += shove;

    // RGB separation of the text.
    float sep = 0.0025 + uEnter * 0.01;
    float r = texture2D(uText, suv + vec2(sep, 0.0)).r;
    float g = texture2D(uText, suv).g;
    float b = texture2D(uText, suv - vec2(sep, 0.0)).b;
    float ta = texture2D(uText, suv).a;
    vec3 text = vec3(r, g, b);

    // Static snow — rises during ENTER until it swallows the signal.
    float snow = hash(suv * vec2(320.0, 240.0) + uTime * 55.0);
    float snowAmt = mix(0.14, 1.0, uEnter);

    // Compose: text over a faint blue-black tube, plus snow.
    vec3 tube = vec3(0.02, 0.03, 0.06);
    vec3 col = tube + text * ta * (1.0 - uEnter * 0.7);
    col += vec3(0.55, 0.7, 1.0) * snow * snowAmt * 0.5;

    // Scanlines.
    col *= 0.82 + 0.18 * sin(suv.y * 900.0);
    // Flicker + ENTER brightness surge.
    col *= 0.94 + 0.06 * sin(uTime * 24.0) + uEnter * 0.6;
    // Blue/purple wash + vignette (edge falloff of the glass).
    col *= vec3(0.86, 0.9, 1.08);
    vec2 e = suv - 0.5;
    col *= smoothstep(0.75, 0.28, dot(e, e) * 2.1);
    // Kill anything outside the curved bounds.
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col *= 0.0;

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
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0) // transparent → CSS room shows behind
  container.appendChild(renderer.domElement)
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'

  const scene = new Scene()
  const camera = new PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100)
  camera.position.set(0, 0.12, 4.0)
  camera.lookAt(0.75, -0.08, 0)

  // Lighting: minimal (spec). Ambient + one fill + the screen's own glow.
  scene.add(new AmbientLight(0x38304a, 0.55))
  const fill = new DirectionalLight(0xb9a9ff, 0.5)
  fill.position.set(-3, 3, 4)
  scene.add(fill)
  const screenGlow = new PointLight(0x6b8fff, 5, 6, 2)
  scene.add(screenGlow)

  const screenMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEnter: { value: 0 }, uText: { value: makeTextTexture() } },
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    toneMapped: false,
  })

  const readyCbs: (() => void)[] = []
  let disposed = false
  let screenWorld = new Vector3(0.55, 0, 0.4)

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.load(MODEL, (gltf) => {
    if (disposed) return
    const root = gltf.scene
    // Centre + fit.
    const box = new Box3().setFromObject(root)
    const size = box.getSize(new Vector3())
    const centre = box.getCenter(new Vector3())
    root.position.sub(centre)
    const fit = 1.95 / Math.max(size.x, size.y, size.z)
    root.scale.setScalar(fit)
    // Compose: pushed to the RIGHT, seated low, screen facing front but angled
    // toward the viewer/title (spec).
    root.position.x += 1.15
    root.position.y -= 0.18
    root.rotation.y = Math.PI + 0.4

    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.frustumCulled = true
      m.castShadow = false
      m.receiveShadow = false
      const n = `${m.name} ${(m.material as { name?: string })?.name ?? ''}`.toLowerCase()
      if (/screen|glass|display|monitor/.test(n)) {
        m.material = screenMat
        m.getWorldPosition(screenWorld)
      }
    })
    // Put the glow just in front of the screen.
    screenGlow.position.copy(screenWorld).add(new Vector3(0, 0, 0.6))
    scene.add(root)
    readyCbs.forEach((cb) => cb())
  })

  // ---- render loop (no per-frame allocations) ----
  let raf = 0
  const clock = { last: performance.now() }
  const tick = () => {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    const t = performance.now() * 0.001
    screenMat.uniforms.uTime.value = t
    screenGlow.intensity = 4.6 + Math.sin(t * 20.0) * 0.5 + screenMat.uniforms.uEnter.value * 6.0
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(tick)

  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return {
    setEnter: (v: number) => { screenMat.uniforms.uEnter.value = v },
    onReady: (cb) => { readyCbs.push(cb) },
    dispose: () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      renderer.domElement.remove()
      void clock
    },
  }
}
