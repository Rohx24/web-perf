import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  NearestFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three'

import { FLUID } from './fluidCursorState'

/**
 * A pointer-driven fluid, ported straight from alche.studio's `StableFluids`.
 *
 * The mouse stirs a velocity field that swirls and slowly dissipates, and the
 * LED wall reads that field to light its dots along the cursor's trail — alche's
 * `vEmitSide = length(fluids.xy)`, adapted to our single-cylinder wall (we light
 * the dots, not tile side-faces). This replaces the old lens-distortion cursor.
 *
 * The whole thing is Jos Stam's stable fluids on the GPU: six fragment kernels
 * (curl, velocity, divergence, pressure ×N, gradient-subtract, advect) run over a
 * small RGBA half-float field — xy = velocity, z = pressure, w = divergence —
 * ping-ponged between two targets. The kernel GLSL below is alche's own, with the
 * unused element-list uniforms dropped and the sampler helpers left intact.
 */

/**
 * StableFluids parameters, trimmed for a light cursor. Alche runs the full
 * incompressibility projection (divergence + pressure Jacobi + gradient
 * subtract); we skip it — splat + curl + advect alone give a soft wake at a
 * fraction of the cost. A lower attenuation makes the trail fade quickly so the
 * cursor feels light rather than dragging a heavy, lingering wake.
 */
const PARAM = {
  curl: 0.05,
  velocityAttenuation: 0.92,
  pressureAttenuation: 0,
}

// A fullscreen-quad vertex shader: the kernels address the field by gl_FragCoord,
// so the vertex stage only has to cover the target.
const passVert = /* glsl */ `
void main() { gl_Position = vec4(position, 1.0); }
`

const curlFrag = /* glsl */ `
uniform sampler2D dataTex; uniform vec2 dataSize; uniform float curl;
vec2 sampleData(sampler2D tex, vec2 uv, vec2 res){ return texture2D(tex, uv).xy; }
void main(){
  vec2 offsetX = vec2(1.0, 0.0); vec2 offsetY = vec2(0.0, 1.0);
  float l = sampleData(dataTex, (gl_FragCoord.xy - offsetX) / dataSize, dataSize).y;
  float r = sampleData(dataTex, (gl_FragCoord.xy + offsetX) / dataSize, dataSize).y;
  float t = sampleData(dataTex, (gl_FragCoord.xy - offsetY) / dataSize, dataSize).x;
  float b = sampleData(dataTex, (gl_FragCoord.xy + offsetY) / dataSize, dataSize).x;
  float c = (r - l - b + t);
  gl_FragColor = vec4(curl * c, 0.0, 0.0, 1.0);
}
`

const velocityFrag = /* glsl */ `
uniform vec2 dataSize; uniform sampler2D dataTex; uniform sampler2D curlTex;
uniform vec2 pointerPos; uniform vec2 pointerVec; uniform float screenAspect;
vec2 smapleVelocity(sampler2D tex, vec2 uv, vec2 resolution){ return texture2D(tex, uv).xy; }
void main(){
  vec2 uv = gl_FragCoord.xy / dataSize;
  vec2 offsetX = vec2(1.0, 0.0); vec2 offsetY = vec2(0.0, 1.0);
  float l = smapleVelocity(curlTex, (gl_FragCoord.xy - offsetX) / dataSize, dataSize).x;
  float r = smapleVelocity(curlTex, (gl_FragCoord.xy + offsetX) / dataSize, dataSize).x;
  float t = smapleVelocity(curlTex, (gl_FragCoord.xy - offsetY) / dataSize, dataSize).x;
  float b = smapleVelocity(curlTex, (gl_FragCoord.xy + offsetY) / dataSize, dataSize).x;
  float c = texture2D(curlTex, uv).x;
  vec2 force = 0.5 * vec2(abs(b) - abs(t), abs(r) - abs(l));
  force /= length(force) + 0.0001;
  force *= 1.0 * c; force.y *= -1.0;
  vec4 data = texture2D(dataTex, uv);
  vec2 pointerUv = uv; pointerUv -= pointerPos;
  if (screenAspect < 1.0) { pointerUv.x *= screenAspect; } else { pointerUv.y /= screenAspect; }
  float pv = length(pointerVec); pv = smoothstep(0.01, 1.0, pv);
  float pointerW = smoothstep(0.01 + 0.1 * min(0.5, pv), 0.0, length(pointerUv));
  vec2 vel = vec2(0.0);
  vec2 velPower = pointerVec * 30.0;
  if (screenAspect < 1.0) { velPower.x /= screenAspect; } else { velPower.y *= screenAspect; }
  velPower = min(abs(velPower), vec2(2.0)) * sign(velPower);
  vel += pointerW * velPower;
  gl_FragColor = vec4(data.xy + vel + force, data.zw);
}
`

const divergenceFrag = /* glsl */ `
uniform vec2 dataSize; uniform sampler2D dataTex;
vec2 sampleData(sampler2D tex, vec2 uv, vec2 resolution){ return texture2D(tex, uv).xy; }
void main(){
  vec4 data = texture2D(dataTex, gl_FragCoord.xy / dataSize);
  vec2 offsetX = vec2(1.0, 0.0); vec2 offsetY = vec2(0.0, 1.0);
  vec2 l = sampleData(dataTex, (gl_FragCoord.xy - offsetX) / dataSize, dataSize);
  vec2 r = sampleData(dataTex, (gl_FragCoord.xy + offsetX) / dataSize, dataSize);
  vec2 t = sampleData(dataTex, (gl_FragCoord.xy - offsetY) / dataSize, dataSize);
  vec2 b = sampleData(dataTex, (gl_FragCoord.xy + offsetY) / dataSize, dataSize);
  float divergence = ((r.x - l.x) + (b.y - t.y)) * 0.5;
  gl_FragColor = vec4(data.xyz, divergence);
}
`

const pressureFrag = /* glsl */ `
uniform vec2 dataSize; uniform sampler2D dataTex;
float sampleData(sampler2D tex, vec2 uv, vec2 resolution){ return texture2D(tex, uv).z; }
void main(){
  vec4 data = texture2D(dataTex, gl_FragCoord.xy / dataSize);
  float l = sampleData(dataTex, (gl_FragCoord.xy - vec2(1.0, 0.0)) / dataSize, dataSize);
  float r = sampleData(dataTex, (gl_FragCoord.xy + vec2(1.0, 0.0)) / dataSize, dataSize);
  float t = sampleData(dataTex, (gl_FragCoord.xy - vec2(0.0, 1.0)) / dataSize, dataSize);
  float b = sampleData(dataTex, (gl_FragCoord.xy + vec2(0.0, 1.0)) / dataSize, dataSize);
  float divergence = data.w;
  float pressure = ((l + r + t + b) - divergence) * 0.25;
  gl_FragColor = vec4(data.xy, pressure, divergence);
}
`

const gradientSubtractFrag = /* glsl */ `
uniform vec2 dataSize; uniform sampler2D dataTex;
float sampleData(sampler2D tex, vec2 uv, vec2 resolution){ return texture2D(tex, uv).z; }
void main(){
  vec2 uv = gl_FragCoord.xy / dataSize;
  float l = sampleData(dataTex, (gl_FragCoord.xy - vec2(1.0, 0.0)) / dataSize, dataSize);
  float r = sampleData(dataTex, (gl_FragCoord.xy + vec2(1.0, 0.0)) / dataSize, dataSize);
  float t = sampleData(dataTex, (gl_FragCoord.xy - vec2(0.0, 1.0)) / dataSize, dataSize);
  float b = sampleData(dataTex, (gl_FragCoord.xy + vec2(0.0, 1.0)) / dataSize, dataSize);
  vec4 data = texture2D(dataTex, uv);
  data.xy -= vec2(r - l, b - t);
  gl_FragColor = data;
}
`

const advectFrag = /* glsl */ `
uniform vec2 dataSize; uniform sampler2D dataTex;
uniform float velocityAttenuation; uniform float pressureAttenuation;
vec2 sampleVelocity(sampler2D tex, vec2 uv, vec2 resolution){ return texture2D(tex, uv).xy; }
float samplePressure(sampler2D tex, vec2 uv, vec2 resolution){
  vec2 offset = vec2(0.0);
  if (uv.x < 0.0) { offset.x = 1.0; } else if (uv.x > 1.0) { offset.x = -1.0; }
  if (uv.y < 0.0) { offset.y = 1.0; } else if (uv.y > 1.0) { offset.y = -1.0; }
  return texture2D(tex, uv + offset / resolution).z;
}
void main(){
  vec2 uv = gl_FragCoord.xy / dataSize;
  vec2 p = gl_FragCoord.xy - sampleVelocity(dataTex, uv, dataSize);
  gl_FragColor = vec4(
    sampleVelocity(dataTex, p / dataSize, dataSize) * velocityAttenuation,
    samplePressure(dataTex, uv, dataSize) * pressureAttenuation,
    0.0
  );
}
`

function makeTarget(w: number, h: number): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(w, h, {
    type: HalfFloatType,
    format: RGBAFormat,
    // Nearest, not linear: many GPUs (e.g. Intel Iris Xe) lack
    // OES_texture_half_float_linear, and linear-filtering a half-float target
    // there renders it incomplete (black). Nearest works everywhere; at this low
    // resolution the trail stays soft enough regardless.
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  })
  return rt
}

export function FluidCursor() {
  const size = useThree((state) => state.size)

  // Sim resolution — a coarse field is plenty for a soft trail and keeps the six
  // passes cheap. Height tracks the aspect so cells stay roughly square.
  const res = useMemo(() => {
    // Coarse on purpose — a soft wake needs no detail, and a small field keeps the
    // three passes cheap so the cursor stays light.
    const w = 128
    const aspect = size.width / Math.max(1, size.height)
    return new Vector2(w, Math.max(2, Math.round(w / aspect)))
  }, [size.width, size.height])

  const targets = useMemo(
    () => ({
      data: [makeTarget(res.x, res.y), makeTarget(res.x, res.y)] as [
        WebGLRenderTarget,
        WebGLRenderTarget,
      ],
      curl: makeTarget(res.x, res.y),
    }),
    [res],
  )

  const sim = useMemo(() => {
    const dataSize = { value: new Vector2(res.x, res.y) }
    const mk = (fragmentShader: string, extra: Record<string, { value: unknown }>) =>
      new ShaderMaterial({
        vertexShader: passVert,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: { dataTex: { value: null }, dataSize, ...extra },
      })

    const curl = mk(curlFrag, { curl: { value: PARAM.curl } })
    const velocity = mk(velocityFrag, {
      curlTex: { value: null },
      pointerPos: { value: new Vector2(0.5, 0.5) },
      pointerVec: { value: new Vector2(0, 0) },
      screenAspect: { value: res.x / res.y },
    })
    const divergence = mk(divergenceFrag, {})
    const pressure = mk(pressureFrag, {})
    const gradientSubtract = mk(gradientSubtractFrag, {})
    const advect = mk(advectFrag, {
      velocityAttenuation: { value: PARAM.velocityAttenuation },
      pressureAttenuation: { value: PARAM.pressureAttenuation },
    })

    const scene = new Scene()
    const quad = new Mesh(new PlaneGeometry(2, 2))
    quad.frustumCulled = false
    scene.add(quad)
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

    return {
      mats: { curl, velocity, divergence, pressure, gradientSubtract, advect },
      scene,
      quad,
      camera,
      dataSize,
    }
  }, [res])

  /** Which of the two data targets currently holds the field. */
  const front = useRef(0)
  const cleared = useRef(false)

  // Pointer: NDC position and an accumulating, decaying velocity — alche's
  // setPointer, with its pow(1.6) shaping so a flick punches and a drift barely
  // stirs. y is subtracted to match his sign convention.
  const pointerPos = useRef(new Vector2(0.5, 0.5))
  const pointerVec = useRef(new Vector2(0, 0))
  const lastNdc = useRef(new Vector2(0.5, 0.5))
  const moved = useRef(false)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = -((e.clientY / window.innerHeight) * 2 - 1)
      let dx = (nx - lastNdc.current.x) * 6.0
      let dy = (ny - lastNdc.current.y) * 6.0
      dx = Math.sign(dx) * Math.pow(Math.abs(dx), 1.6)
      dy = Math.sign(dy) * Math.pow(Math.abs(dy), 1.6)
      pointerVec.current.x += dx
      pointerVec.current.y -= dy
      pointerVec.current.x = Math.min(1, Math.max(-1, pointerVec.current.x))
      pointerVec.current.y = Math.min(1, Math.max(-1, pointerVec.current.y))
      lastNdc.current.set(nx, ny)
      pointerPos.current.set(nx * 0.5 + 0.5, ny * 0.5 + 0.5)
      moved.current = true
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    return () => {
      targets.data[0].dispose()
      targets.data[1].dispose()
      targets.curl.dispose()
      Object.values(sim.mats).forEach((m) => m.dispose())
      sim.quad.geometry.dispose()
      if (FLUID.texture === targets.data[0].texture || FLUID.texture === targets.data[1].texture) {
        FLUID.texture = null
      }
    }
  }, [targets, sim])

  // Keep the field pointing somewhere valid from the first frame.
  useEffect(() => {
    FLUID.texture = targets.data[front.current].texture
    cleared.current = false
  }, [targets])

  useFrame((state) => {
    const gl = state.gl
    sim.dataSize.value.set(res.x, res.y)
    sim.mats.velocity.uniforms.screenAspect.value = res.x / res.y

    // Zero both fields once, so we start from still fluid rather than GPU garbage.
    if (!cleared.current) {
      const prev = gl.getRenderTarget()
      for (const rt of [targets.data[0], targets.data[1], targets.curl]) {
        gl.setRenderTarget(rt)
        gl.clear()
      }
      gl.setRenderTarget(prev)
      cleared.current = true
    }

    let src = targets.data[front.current]
    let dst = targets.data[1 - front.current]

    const renderTo = (rt: WebGLRenderTarget, mat: ShaderMaterial) => {
      sim.quad.material = mat
      gl.setRenderTarget(rt)
      gl.render(sim.scene, sim.camera)
    }
    // Read src, write dst, then make dst the new src.
    const step = (mat: ShaderMaterial) => {
      mat.uniforms.dataTex.value = src.texture
      renderTo(dst, mat)
      const tmp = src
      src = dst
      dst = tmp
    }

    const m = sim.mats
    const prev = gl.getRenderTarget()

    // 1) curl of the current velocity (into its own buffer, no swap).
    m.curl.uniforms.dataTex.value = src.texture
    renderTo(targets.curl, m.curl)

    // 2) add the vorticity force and the pointer splat.
    m.velocity.uniforms.curlTex.value = targets.curl.texture
    m.velocity.uniforms.pointerPos.value.copy(pointerPos.current)
    m.velocity.uniforms.pointerVec.value.copy(pointerVec.current)
    step(m.velocity)

    // (The incompressibility projection — divergence / pressure / gradient
    // subtract — is deliberately skipped for a light cursor; see PARAM.)

    // 3) advect the field along its own velocity and dissipate.
    step(m.advect)

    gl.setRenderTarget(prev)

    // src now holds the latest field; publish it and remember the buffer.
    front.current = src === targets.data[0] ? 0 : 1
    FLUID.texture = src.texture

    // Bleed the injected velocity away each frame (alche multiplies by 0.5), so
    // the splat is a kick, not a held push.
    pointerVec.current.multiplyScalar(0.5)
  })

  return null
}
