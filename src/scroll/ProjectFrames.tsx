import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color,
  FrontSide,
  Group,
  MathUtils,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'

import { PROJECTS, type Project } from './projects'
import { SCROLL, galleryActive } from './scrollConfig'
import { scrollProgress, scrollVelocity } from './scrollProgress'
import { getProjectTexture, prewarmProjectTextures } from './projectTextures'
import { LIVE } from '../dev/live'
import { registerControls } from '../dev/controls'

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * The frame's shader — ported from alche's worksThumbnailVert / worksThumbnailFrag.
 *
 * Vertex: bends the plane into a concave section (edges recede toward the viewer,
 * like a card mounted on the curved wall) — alche's baked `cos(x)` curve, always
 * on, normalised here so it is independent of the frame's metric size. Also
 * carries a fake reflection direction (vRefDir) so the fragment can add a thin
 * chrome sheen with no cube map.
 *
 * Fragment: alche's 4-tap chromatic-aberration read (R/G/B sampled at slightly
 * different lens distortions, so the edges fringe), a soft radial vignette so the
 * frame fades at its rim instead of hard-cutting, the sheen mix, then a
 * linearise at the end (our renderer re-encodes to sRGB on output).
 */
const frameVertex = /* glsl */ `
uniform float uScrollVelocity;
uniform float uBend;
varying vec2 vUv;
varying vec2 vMeshUv;
varying vec3 vRefDir;
mat2 rot(float a){ return mat2(cos(a), sin(a), -sin(a), cos(a)); }
void main() {
  vUv = uv;
  vMeshUv = uv;
  vec3 pos = position;
  // Concave bend: centre stays put, edges pull toward the viewer (+z in local
  // space). uBend is the depth as a fraction of width; the cos gives alche's
  // smooth section curve. A little scroll-velocity funya on top.
  float t = (uv.x - 0.5);
  pos.z += (cos(t * 3.14159265) - 1.0) * uBend * 4.0;
  pos.z += abs(uScrollVelocity) * 0.0;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec3 nrm = normalize(normalMatrix * normal);
  vRefDir = reflect(-mvPosition.xyz, nrm);
  vRefDir.yz *= rot(0.2);
  vRefDir.xy *= rot(-0.9);
  vRefDir.xz *= rot(0.3);
}
`

const frameFragment = /* glsl */ `
uniform sampler2D uTex;
uniform float uOpacity;
uniform float uAspect;      // pane width / height (16:9)
uniform float uCorner;      // corner radius, in height-half units
uniform float uBorder;      // border thickness
uniform vec3  uBorderColor; // rim colour
varying vec2 vUv;
varying vec2 vMeshUv;
varying vec3 vRefDir;
vec2 lens(vec2 r, float a){ return r * (1.0 - a * dot(r, r)); }
// Signed distance to a rounded rectangle — negative inside.
float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 d = abs(p) - b + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}
void main() {
  vec4 col = vec4(0.0);
  // 4-tap chromatic aberration — alche's read. Each channel is sampled at a
  // slightly stronger lens distortion so the frame fringes at its edges.
  for (int i = 0; i < 4; i++) {
    float fi = float(i) / 4.0;
    // Show (almost) the whole screenshot at its true aspect — his 1.3 zoom and
    // 0.9 x-squish cropped and stretched our readable web-page previews.
    vec2 cuv = vUv - 0.5;
    cuv *= 1.02;
    float d = 0.02 + fi * 0.01;
    col.x += texture2D(uTex, lens(cuv, d + 0.000) + 0.5).x;
    col.y += texture2D(uTex, lens(cuv, d + 0.015) + 0.5).y;
    col.z += texture2D(uTex, lens(cuv, d + 0.030) + 0.5).z;
  }
  col.xyz /= 4.0;

  // A rounded-rectangle card, measured in aspect-corrected space so the corners
  // are actually round (not ovalised by the 16:9 shape). dist < 0 = inside.
  vec2 q = (vMeshUv - 0.5) * vec2(uAspect, 1.0);
  vec2 halfExt = vec2(0.5 * uAspect, 0.5) - 0.003;
  float dist = sdRoundBox(q, halfExt, uCorner);
  float aa = fwidth(dist) + 1e-4;
  float inside = smoothstep(aa, -aa, dist);

  // A bright rim hugging the rounded edge — the border.
  float rim = (1.0 - smoothstep(0.0, uBorder, -dist)) * inside;
  vec3 rgb = mix(col.xyz, uBorderColor, rim * 0.85);

  // A thin faked sheen (alche), from the reflection direction, no cube map.
  rgb = mix(rgb, vec3(smoothstep(0.0, 0.2, vRefDir.x)), 0.05);

  float alpha = inside * uOpacity;
  if (alpha < 0.003) discard;
  // The screenshots read as sRGB straight to the (flat, un-tonemapped) canvas —
  // no pow() linearise, which was darkening them into unreadability.
  gl_FragColor = vec4(rgb, alpha);
}
`

/**
 * One project frame on alche's rising carousel.
 *
 * `xa = index − active` is this frame's signed slot offset: xa>0 entering from
 * the right and low, 0 at the centred/featured moment, xa<0 exiting to the left
 * and high — a shallow diagonal climb, exactly alche's WorksThumbnails.update.
 */
function Frame({
  project,
  index,
  geometry,
}: {
  project: Project
  index: number
  geometry: PlaneGeometry
}) {
  const groupRef = useRef<Group>(null)
  const camera = useThree((state) => state.camera)

  // Shared, pre-uploaded texture (see projectTextures). Not created or disposed
  // here — the cache owns it — so scrolling a frame into view never triggers a
  // decode/upload stall.
  const texture = useMemo(
    () => (project.image ? getProjectTexture(project.image) : null),
    [project.image],
  )

  const material = useMemo(() => {
    const g = SCROLL.gallery
    return new ShaderMaterial({
      vertexShader: frameVertex,
      fragmentShader: frameFragment,
      transparent: true,
      side: FrontSide,
      depthWrite: false,
      uniforms: {
        uTex: { value: texture },
        uOpacity: { value: 0 },
        uBend: { value: LIVE.works.bend },
        uScrollVelocity: { value: 0 },
        uAspect: { value: g.size[0] / g.size[1] },
        uCorner: { value: LIVE.works.corner },
        uBorder: { value: LIVE.works.border },
        uBorderColor: { value: new Color(g.borderColor) },
      },
    })
  }, [texture])

  useEffect(() => {
    // The texture is shared and owned by the cache — only the per-frame material
    // is disposed here.
    return () => {
      material.dispose()
    }
  }, [material])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const s = scrollProgress()
    const g = SCROLL.gallery
    const w = LIVE.works // live-tunable (control_works panel)
    const { galleryStart, galleryEnd, outroStart } = SCROLL.phase
    const outro = smoothstep(outroStart, outroStart + 0.08, s)

    const active = galleryActive(s)
    // alche's signed slot offset. xa>0 → entering right/low; xa<0 → exiting left/high.
    let xa = index - active
    /* The first pane has nothing arriving ahead of it: galleryActive starts at
       -0.5, so it began only half a slot out and seemed to materialise near
       centre while the rest slide in from the right. Give it a run-up from
       xa ≈ 1.25 -- where sin() puts a pane furthest right on screen, so it only
       ever moves inward -- easing away by the moment it parks. */
    if (index === 0) {
      const parkS = galleryStart + ((0.5 - w.dwell) / g.count) * (galleryEnd - galleryStart)
      xa += 0.75 * (1 - smoothstep(galleryStart, parkS, s))
    }
    const axa = Math.abs(xa)

    const galleryFade =
      smoothstep(galleryStart - 0.03, galleryStart + 0.03, s) * (1 - outro)
    // alche's visibility: (1 − smoothstep(|xa|, visStart, visEnd)).
    const vis = (1 - smoothstep(g.visStart, g.visEnd, axa)) * galleryFade
    if (vis <= 0.001) {
      group.visible = false
      return
    }
    group.visible = true

    // alche's WorksThumbnails.update, placed in camera space so the orbit holds
    // in front of the camera. Elliptical sweep, linear diagonal climb, inward yaw
    // (the off-centre angle), plus an optional off-centre tilt.
    const x = Math.sin(xa) * w.xRadius
    const z = -w.frontDist - (1 - Math.cos(xa)) * w.zRadius - outro * 22
    const y = -xa * w.rise

    group.position.copy(camera.position)
    group.quaternion.copy(camera.quaternion)
    group.translateX(x)
    group.translateY(y)
    group.translateZ(z)
    group.rotateY(xa * w.yaw)
    if (w.tilt !== 0) group.rotateX(xa * w.tilt)

    // Contain-fit the FEATURED frame at frontDist so it fills a comfortable share
    // of the viewport whatever the aspect; neighbours shrink from there by
    // perspective (their greater z) plus alche's subtle scale growth at centre.
    const cam = camera as { fov: number; aspect: number }
    const visH = 2 * w.frontDist * Math.tan((cam.fov * Math.PI) / 360)
    const visW = visH * cam.aspect
    const fit = Math.min(
      (w.fillFracW * visW) / g.size[0],
      (w.fillFracH * visH) / g.size[1],
    )
    const grow = 1 + w.growth * (1 - Math.min(1, axa))
    const scale = fit * grow * (1 - 0.4 * outro)
    group.scale.setScalar(Math.max(0.01, scale))

    material.uniforms.uOpacity.value = vis
    material.uniforms.uScrollVelocity.value = scrollVelocity()
    // Live border/corner from the control_works panel.
    material.uniforms.uCorner.value = w.corner
    material.uniforms.uBorder.value = w.border
    material.uniforms.uBend.value = w.bend
  })

  return (
    <group ref={groupRef}>
      {/* renderOrder above every wall layer (grid/dots/markers/glass ≤ 4) so the
          far wall lines never draw over the frame in the transparent pass. Each
          pane is a link to its live site: click opens it, hover shows a pointer.
          Invisible panes are skipped by the raycaster, so only frames on screen
          are clickable. */}
      <mesh
        geometry={geometry}
        material={material}
        renderOrder={12}
        onClick={(e) => {
          if (!project.launchUrl) return
          e.stopPropagation()
          window.open(project.launchUrl, '_blank', 'noopener,noreferrer')
        }}
        onPointerOver={() => {
          if (project.launchUrl) document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      />
    </group>
  )
}

/**
 * The project frames: curved 16:9 images orbiting the logo on alche's rising arc
 * — entering from the right/low, slotting head-on and largest at centre, exiting
 * to the left/high. Copy is on the DOM (ProjectOverlay); the featured project's
 * colour is projected, blurred, onto the wall behind by LedWall.
 */
/** A live-value range control on the control_works panel. */
function worksRange(
  group: string,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
) {
  return { panel: 'works', group, label, min, max, step, get, set }
}

export function ProjectFrames() {
  const g = SCROLL.gallery
  const gl = useThree((state) => state.gl)
  const geometry = useMemo(
    // Enough width segments for the baked cos bend to read smooth.
    () => new PlaneGeometry(g.size[0], g.size[1], 40, 1),
    [g.size],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  // Decode + upload every preview to the GPU up front (during the initial load),
  // so a project scrolling into view never stalls on a texture upload. Measured
  // to remove the ~100–290 ms hitches at the project transitions.
  useEffect(() => {
    prewarmProjectTextures(
      gl,
      PROJECTS.map((p) => p.image).filter((u): u is string => !!u),
    )
  }, [gl])

  // Every works knob, on its own panel (control_works, right side) so it never
  // gets muddled with the wall/hero controls. All write straight to LIVE, read
  // each frame — no rebuilds.
  useEffect(() => {
    const w = LIVE.works
    return registerControls([
      worksRange('works · panes', 'width', 0.2, 1, 0.01, () => w.fillFracW, (v) => { w.fillFracW = v }),
      worksRange('works · panes', 'height', 0.2, 1, 0.01, () => w.fillFracH, (v) => { w.fillFracH = v }),
      worksRange('works · panes', 'corner', 0, 0.5, 0.005, () => w.corner, (v) => { w.corner = v }),
      worksRange('works · panes', 'border', 0, 0.1, 0.002, () => w.border, (v) => { w.border = v }),
      worksRange('works · panes', 'bend', 0, 0.6, 0.01, () => w.bend, (v) => { w.bend = v }),
      worksRange('works · orbit', 'x radius', 2, 12, 0.1, () => w.xRadius, (v) => { w.xRadius = v }),
      worksRange('works · orbit', 'z radius', 0, 8, 0.1, () => w.zRadius, (v) => { w.zRadius = v }),
      worksRange('works · orbit', 'front dist', 3, 12, 0.1, () => w.frontDist, (v) => { w.frontDist = v }),
      worksRange('works · orbit', 'rise', 0, 3, 0.05, () => w.rise, (v) => { w.rise = v }),
      worksRange('works · orbit', 'angle (yaw)', 0, 1.5, 0.01, () => w.yaw, (v) => { w.yaw = v }),
      worksRange('works · orbit', 'tilt', -1, 1, 0.01, () => w.tilt, (v) => { w.tilt = v }),
      worksRange('works · orbit', 'grow centre', 0, 1, 0.01, () => w.growth, (v) => { w.growth = v }),
      worksRange('works · scroll', 'dwell', 0, 0.49, 0.01, () => w.dwell, (v) => { w.dwell = v }),
      worksRange('works · marquee', 'brightness', 0, 3, 0.05, () => LIVE.marquee.bright, (v) => { LIVE.marquee.bright = v }),
      worksRange('works · outro', 'grid start', 0.7, 1, 0.005, () => LIVE.outro.gridStart, (v) => { LIVE.outro.gridStart = v }),
      worksRange('works · outro', 'grid end', 0.75, 1, 0.005, () => LIVE.outro.gridEnd, (v) => { LIVE.outro.gridEnd = v }),
    ])
  }, [])

  return (
    <group>
      {PROJECTS.map((project, i) => (
        <Frame key={project.title} project={project} index={i} geometry={geometry} />
      ))}
    </group>
  )
}
