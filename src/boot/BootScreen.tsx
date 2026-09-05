import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  RepeatWrapping,
  ShaderMaterial,
  Vector3,
} from 'three'

const MODEL = '/crt/crt-opt.glb'

/* The screen: procedural snow + scanlines + a rolling tuning bar + the name
   ghosting through. uSurge (0→1) brightens/whitens it for the "power surge" as
   the camera is pulled through at reveal. */
function makeStaticMaterial (): ShaderMaterial {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 512, 512)
  g.fillStyle = '#fff'
  g.font = 'bold 30px monospace'
  g.textBaseline = 'middle'
  for (let r = 0; r < 15; r++) {
    g.globalAlpha = 0.45 + Math.random() * 0.55
    g.fillText('ROHIT  ROHIT  ROHIT  DIGGI', -((r * 37) % 120), r * 34 + 18)
  }
  const tex = new CanvasTexture(c)
  tex.wrapS = tex.wrapT = RepeatWrapping
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uName: { value: tex }, uSurge: { value: 0 } },
    side: DoubleSide,
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uName; uniform float uSurge; varying vec2 vUv;
      float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      void main(){
        vec2 uv=vUv;
        float snow=hash(uv*vec2(340.0,250.0)+uTime*55.0);
        vec2 nuv=uv; nuv.y=fract(nuv.y*3.2-uTime*0.06);
        nuv.x += (hash(vec2(floor(uv.y*90.0),floor(uTime*9.0)))-0.5)*0.05;
        float name=texture2D(uName,nuv).r;
        float roll=smoothstep(0.5,0.46,abs(fract(uv.y-uTime*0.11)-0.5));
        float sig=snow*0.5+name*0.65; sig=mix(sig,1.0,roll*0.25);
        sig*=0.82+0.18*sin(uv.y*680.0);
        vec2 cc=uv-0.5; sig*=smoothstep(0.62,0.2,dot(cc,cc)*2.3);
        vec3 col=vec3(sig)*vec3(0.82,0.9,1.0);
        // Surge toward white as we're pulled through the glass.
        col = mix(col, vec3(1.0), uSurge*uSurge);
        gl_FragColor=vec4(col, 1.0);
      }`,
  })
}

function Crt ({ reveal, onRevealDone }: { reveal: boolean; onRevealDone: () => void }) {
  const camera = useThree((s) => s.camera)
  const { scene } = useGLTF(MODEL)
  const material = useMemo(makeStaticMaterial, [])

  const model = useMemo(() => {
    const root = scene.clone(true)
    const box = new Box3().setFromObject(root)
    const size = box.getSize(new Vector3())
    const centre = box.getCenter(new Vector3())
    root.position.sub(centre)
    const fit = 1.7 / Math.max(size.x, size.y, size.z)
    const holder = new Group()
    holder.add(root)
    holder.scale.setScalar(fit)
    holder.rotation.y = Math.PI // face the screen toward the camera
    root.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) {
        const n = `${m.name} ${(m.material as { name?: string })?.name ?? ''}`.toLowerCase()
        if (/screen|glass|display|monitor|panel/.test(n)) m.material = material
      }
    })
    return holder
  }, [scene, material])

  const t0 = useRef(performance.now())
  const revealStart = useRef(0)
  const fired = useRef(false)

  useFrame(() => {
    const now = performance.now()
    material.uniforms.uTime.value = now * 0.001

    if (!reveal) {
      // Slow push-in while the site loads behind us.
      const idle = (now - t0.current) / 1000
      camera.position.set(0, 0.28, 4.0 - Math.min(idle * 0.05, 0.7))
      camera.lookAt(0, -0.04, 0.2)
    } else {
      if (!revealStart.current) revealStart.current = now
      const p = Math.min(1, (now - revealStart.current) / 1100)
      const e = p * p * (3 - 2 * p)
      // Dolly straight into the glass; the static fills the frame and whitens.
      camera.position.set(0, 0.28 - e * 0.24, 3.3 - e * 3.1)
      camera.lookAt(0, -0.04, 0.2)
      material.uniforms.uSurge.value = e
      if (p >= 1 && !fired.current) {
        fired.current = true
        onRevealDone()
      }
    }
  })

  return <primitive object={model} position={[0, -0.1, 0]} />
}

/**
 * The boot overlay: a full-screen CRT scene shown on load. It pushes slowly in
 * while the real site pre-warms behind it; when told to `reveal`, the camera is
 * pulled through the glass, the screen whitens, then the whole overlay fades to
 * reveal the site. Unmounts itself after the fade (frees its WebGL context).
 */
export function BootScreen ({ reveal, onFaded }: { reveal: boolean; onFaded: () => void }) {
  const [fading, setFading] = useState(false)

  // Safety: if the fade's transitionend never fires, finish anyway.
  useEffect(() => {
    if (!fading) return
    const id = setTimeout(onFaded, 900)
    return () => clearTimeout(id)
  }, [fading, onFaded])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: '#000',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
      onTransitionEnd={() => fading && onFaded()}
    >
      <Canvas
        flat
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        camera={{ fov: 42, near: 0.1, far: 100, position: [0, 0.28, 4.0] }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 1)}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={[0xcfe0ff, 0x40474f, 1.0]} />
        <directionalLight position={[3, 5, 6]} intensity={1.6} />
        <directionalLight position={[-4, 2, 3]} intensity={0.7} />
        <Suspense fallback={null}>
          <Crt reveal={reveal} onRevealDone={() => setFading(true)} />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL)
