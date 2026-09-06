/**
 * Hero mark density comparison.
 *
 * Loads the source mark alongside each decimated build and renders them with
 * the real glass material, the real lighting and the real camera, so the
 * question "can you see the difference?" is answered on the thing itself rather
 * than in a model viewer.
 *
 * `preserveDrawingBuffer` and on-demand rendering, deliberately: this page has
 * to be screenshottable and has to work in a backgrounded tab, which a normal
 * rAF loop does not.
 *
 *   /compare.html
 */

import {
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

import { createGlassMaterial } from '../systems/GlassMaterial'
import { HERO } from '../systems/heroConfig'
import { VIEWER } from '../scene/roomConfig'
import { LIVE } from './live'

interface Build { label: string; url: string }

const BUILDS: Build[] = [
  { label: 'source', url: '/models/metal-letter-opt.glb' },
  { label: '50%', url: '/models/metal-letter-50.glb' },
  { label: '30%', url: '/models/metal-letter-30.glb' },
  { label: '20%', url: '/models/metal-letter-20.glb' },
  { label: '12%', url: '/models/metal-letter-12.glb' },
  { label: '6%', url: '/models/metal-letter-06.glb' },
]

const BUST = Date.now()
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const material = createGlassMaterial()

/** HeroSystem's fit, reproduced exactly, so framing is identical everywhere. */
function fit(source: Group): { group: Group; tris: number; verts: number; draws: number } {
  const wrapper = new Group()
  const instance = source.clone(true)
  instance.rotation.set(...HERO.rotation)
  wrapper.add(instance)
  wrapper.updateMatrixWorld(true)

  const bounds = new Box3().setFromObject(wrapper)
  const size = bounds.getSize(new Vector3())
  const centre = bounds.getCenter(new Vector3())
  instance.position.sub(centre)
  const scale = size.y > 0 ? HERO.height / size.y : 1
  wrapper.scale.set(scale * HERO.widthScale, scale, scale)

  let tris = 0
  let verts = 0
  let draws = 0
  instance.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.material = material
    draws += 1
    const g = mesh.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    verts += g.attributes.position.count
  })

  /* The rig, as HeroController builds it: root carries position and the live
     size, orient carries the model's base orientation. Without these the mark
     is seen from an angle the site never shows it at, which is no basis for
     judging anything. Idle breathing and the scroll spin are left at rest. */
  const orient = new Group()
  orient.rotation.set(LIVE.hero.rotX, LIVE.hero.rotY, LIVE.hero.rotZ)
  orient.add(wrapper)

  const root = new Group()
  root.position.set(...HERO.position)
  root.scale.setScalar(LIVE.hero.size)
  root.add(orient)

  return { group: root, tris, verts, draws }
}

/** Something behind the glass, or there is no refraction to judge. */
function backdrop(): Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const palette = ['#8b6dff', '#22d3ee', '#f59e0b', '#ec4899']
  ctx.fillStyle = '#07070a'
  ctx.fillRect(0, 0, 512, 512)
  for (let y = 13; y < 512; y += 26) {
    for (let x = 13; x < 512; x += 26) {
      const u = x / 512
      const v = y / 512
      const f = (Math.sin(u * 5) + Math.sin(v * 3.5) + Math.sin((u + v) * 4)) / 3
      ctx.fillStyle = palette[Math.floor((f * 0.5 + 0.5) * palette.length) % palette.length]
      ctx.globalAlpha = 0.35 + 0.65 * (Math.sin(u * 11 + v * 9) * 0.5 + 0.5)
      ctx.beginPath()
      ctx.arc(x, y, 3.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = new CanvasTexture(canvas)
  const plane = new Mesh(new PlaneGeometry(26, 15), new MeshBasicMaterial({ map: tex }))
  plane.position.set(0, 2.1, -7)
  return plane
}
async function main() {
  const stage = document.getElementById('stage') as HTMLCanvasElement
  const strip = document.getElementById('strip')!
  const readout = document.getElementById('readout')!

  const renderer = new WebGLRenderer({
    canvas: stage,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const scene = new Scene()
  scene.background = new Color('#0a0a0c')
  scene.add(new AmbientLight(0xffffff, 0.45))
  const key = new DirectionalLight(0xffffff, 1.4)
  key.position.set(4, 8, 10)
  scene.add(key)
  scene.add(backdrop())

  const camera = new PerspectiveCamera(VIEWER.fov, 1, VIEWER.near, VIEWER.far)
  camera.position.set(...VIEWER.position)
  camera.lookAt(0, 2.1, -2.2)
  resize()
  window.addEventListener('resize', () => { resize(); draw() })

  const loaded: {
    build: Build; group: Group; tris: number; verts: number; draws: number; bytes: number
  }[] = []

  for (const build of BUILDS) {
    // cache-bust: these files are regenerated between reloads
    const bust = `${build.url}?v=${BUST}`
    const [gltf, head] = await Promise.all([
      loader.loadAsync(bust),
      fetch(bust, { method: 'HEAD' }),
    ])
    const f = fit(gltf.scene as unknown as Group)
    f.group.visible = false
    scene.add(f.group)
    loaded.push({
      build, ...f,
      bytes: Number(head.headers.get('content-length') ?? 0),
    })
  }

  let current = 0
  const draw = () => {
    for (let i = 0; i < loaded.length; i++) loaded[i].group.visible = i === current
    renderer.render(scene, camera)
    const l = loaded[current]
    const src = loaded[0]
    readout.innerHTML =
      `<b>${l.build.label}</b>` +
      `<span>${l.tris.toLocaleString()} tris</span>` +
      `<span>${l.verts.toLocaleString()} verts</span>` +
      `<span>${l.draws} draw call${l.draws === 1 ? '' : 's'}</span>` +
      `<span>${(l.bytes / 1e6).toFixed(2)} MB</span>` +
      (current === 0
        ? '<span class="base">baseline</span>'
        : `<span class="win">${(100 - (l.tris / src.tris) * 100).toFixed(0)}% fewer triangles · ` +
          `${(100 - (l.bytes / src.bytes) * 100).toFixed(0)}% smaller</span>`)
    ;[...strip.children].forEach((el, i) => el.classList.toggle('on', i === current))
  }

  loaded.forEach((l, i) => {
    const b = document.createElement('button')
    b.innerHTML = `<b>${l.build.label}</b><span>${Math.round(l.tris / 1000)}k tris</span>`
    b.onclick = () => { current = i; draw() }
    strip.appendChild(b)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { current = (current + 1) % loaded.length; draw() }
    if (e.key === 'ArrowLeft') { current = (current - 1 + loaded.length) % loaded.length; draw() }
  })

  // for screenshotting from outside
  ;(window as unknown as Record<string, unknown>).__compare = {
    show: (i: number) => { current = i; draw() },
    count: loaded.length,
    loaded,
    scene,
    camera,
    renderer,
    Box3,
    Vector3,
    stats: loaded.map((l) => ({ label: l.build.label, tris: l.tris, verts: l.verts, draws: l.draws, bytes: l.bytes })),
  }

  draw()
}

main()
