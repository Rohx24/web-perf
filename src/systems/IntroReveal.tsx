import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three'

import { introActive, onIntroChange, setRevealDone } from '../perf/introState'

/**
 * The reveal, run on the page's own composite — which is where Alche run
 * theirs.
 *
 * This is finalCompositeFrag from their bundle, transcribed. The body is their
 * code, not an approximation of it:
 *
 *   r        = smoothstep(0.0, 0.2 + uLoaded*0.7, -length(cuv) + uLoaded*1.4)
 *   sceneUv *= (0.5 + uLoaded*0.5)
 *   sceneUv -= sin(r*PI) * normalize(cuv) * 0.1
 *   col.rgb  = mix(<before>, col.rgb, smoothstep(0.0, 0.5, r))
 *
 * Which is: one circular front whose edge softens as it travels, the scene
 * arriving at half scale and settling to 1:1, a single radial push that is zero
 * at both ends and peaks at the front, and a crossfade on that same front.
 * There is no chromatic aberration in it — the rainbow on their site belongs to
 * mainLogoFrag, the glass material on their logo mesh, which is a different
 * effect on different geometry.
 *
 * Their "before" layer is the loading logo. Ours is black: by the time this
 * runs the television has gone.
 *
 * It costs one render target and one extra full-screen draw, and only while it
 * is running — the component unmounts when the front clears the frame, which
 * hands rendering back to R3F and leaves nothing behind.
 */

const vert = /* glsl */ `
  varying vec2 vUv;
  void main () { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const frag = /* glsl */ `
  precision highp float;
  uniform sampler2D uBackBuffer;
  uniform float uLoaded;
  uniform float uScreenAspectRatio;
  varying vec2 vUv;

  #define PI 3.14159265359

  void main (void) {
    vec2 uv = vUv;
    vec2 cuv = vUv - 0.5;
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);

    if (uLoaded < 0.999) {
      if (uScreenAspectRatio > 1.0) { cuv.y /= uScreenAspectRatio; }
      else { cuv.x *= uScreenAspectRatio; }

      float r = smoothstep(0.0, 0.2 + uLoaded * 0.7, -length(cuv) + uLoaded * 1.4);

      vec2 sceneUv = uv;
      sceneUv -= 0.5;
      sceneUv *= (0.5 + uLoaded * 0.5);
      sceneUv += 0.5;
      sceneUv -= (sin(r * PI)) * normalize(cuv) * 0.1;

      vec4 backbufferCol = texture2D(uBackBuffer, sceneUv);
      col = backbufferCol;
      col.rgb = mix(vec3(0.0), col.rgb, smoothstep(0.0, 0.5, r));
    } else {
      col = texture2D(uBackBuffer, uv);
    }

    gl_FragColor = vec4(col.xyz, 1.0);
  }
`

/** Their tween: animate("loaded", 1, 3) with Easings.easeOutCubic. */
const DURATION = 3000
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)

export function IntroReveal() {
  const { size, viewport, gl, scene, camera } = useThree()
  // Nothing to reveal if the visitor never saw a title screen (?noboot=1).
  const [running, setRunning] = useState(() => introActive())
  // ?noboot=1 never runs a reveal, so nothing would otherwise release the
  // resolution it is holding down
  useEffect(() => { if (!introActive()) setRevealDone() }, [])
  const startedAt = useRef<number | null>(null)

  useEffect(() => onIntroChange((stillUp) => {
    if (!stillUp) startedAt.current = performance.now()
  }), [])

  const { rt, quad, cam, mat } = useMemo(() => {
    const material = new ShaderMaterial({
      uniforms: {
        uBackBuffer: { value: null },
        uLoaded: { value: 0 },
        uScreenAspectRatio: { value: 1 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
    })
    const s = new Scene()
    s.add(new Mesh(new PlaneGeometry(2, 2), material))
    return {
      rt: new WebGLRenderTarget(2, 2),
      quad: s,
      cam: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      mat: material,
    }
  }, [])

  useEffect(() => () => { rt.dispose(); mat.dispose() }, [rt, mat])

  /* Compile the render-target path while the title screen still covers the
     screen.

     three keys shader programs on more than the material — rendering into a
     render target is not the same pipeline as rendering to the canvas, so the
     first frame that goes through this pass recompiles every material in the
     scene. That compile landed exactly on the first frame of the reveal, which
     is why the reveal stalled for about a second and then ran smoothly.

     Doing one throwaway render through the same path up front moves that
     compile under the intro, where there is nothing to stutter. The composite
     material gets a frame too, so its own program is built here rather than
     there. gl.compile is repeated on a delay to catch anything whose material
     was still being set up on the first pass. */
  useEffect(() => {
    let cancelled = false
    const warm = () => {
      if (cancelled) return
      /* Everything visible for the duration of the warm renders.

         gl.compile covers the canvas path, but not every path a material can
         end up on. The hero's mark is transmissive, so three renders a
         transmission pass every frame — and an object entering that pass for
         the first time compiles there too. Nothing off-screen is in it, so the
         works panes were compiling on the frame they first appeared, which is
         the stall on the first scroll off the hero. Rendering them for real,
         once, while they are hidden behind the title screen, is what actually
         exercises those paths; compiling alone does not. */
      const hidden: { o: { visible: boolean } }[] = []
      scene.traverse((o) => {
        if (o.visible === false) { hidden.push({ o }); o.visible = true }
      })
      try {
        // the canvas path, and with it the transmission pass
        gl.render(scene, camera)
        // and the render-target path the reveal itself runs on
        gl.setRenderTarget(rt)
        gl.render(scene, camera)
        gl.setRenderTarget(null)
        mat.uniforms.uBackBuffer.value = rt.texture
        mat.uniforms.uLoaded.value = 0
        gl.render(quad, cam)
        gl.compile(scene, camera)
      } catch {
        /* best-effort: if it throws, the compile just happens later, where it
           always used to */
      } finally {
        for (const h of hidden) h.o.visible = false
      }
    }
    warm()
    // a compile-only second pass: the first one did the expensive part, this
    // just catches anything whose material was still being built
    const again = window.setTimeout(() => {
      if (!cancelled) { try { gl.compile(scene, camera) } catch { /* best effort */ } }
    }, 1200)
    return () => { cancelled = true; window.clearTimeout(again) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mat.uniforms.uScreenAspectRatio.value = size.width / Math.max(1, size.height)
    /* Once the reveal is over this target is dead weight — and the resolution
       it was holding down goes up at the same moment, so without this guard it
       would reallocate at full size purely to never be read again. */
    if (!running) { rt.setSize(2, 2); return }
    const pr = Math.min(viewport.dpr, 2)
    rt.setSize(Math.max(2, Math.round(size.width * pr)), Math.max(2, Math.round(size.height * pr)))
  }, [size, viewport.dpr, rt, mat, running])

  /* Priority > 0 takes the render loop off R3F, so the scene can be captured
     first and composited second. When this unmounts, R3F resumes its own
     rendering and the extra pass is gone entirely. */
  useFrame(({ gl, scene, camera }) => {
    if (!running) { gl.render(scene, camera); return }

    const began = startedAt.current
    // the title screen is still up: render straight through, no pass
    if (began === null) { gl.render(scene, camera); return }

    const p = Math.min(1, (performance.now() - began) / DURATION)
    mat.uniforms.uLoaded.value = easeOutCubic(p)

    gl.setRenderTarget(rt)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    mat.uniforms.uBackBuffer.value = rt.texture
    gl.render(quad, cam)

    if (p >= 1) {
      setRunning(false)
      /* Raising resolution resizes the drawing buffer, which is itself a hitch.
         Landing it on the reveal's last frame would put a stutter exactly where
         the eye is still following the wipe. A beat later, nothing is moving. */
      window.setTimeout(setRevealDone, 250)
    }
  }, 1)

  return null
}
