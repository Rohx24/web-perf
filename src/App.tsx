import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { QUALITY, IS_MOBILE } from './perf/quality'
import { AdaptiveQuality } from './perf/AdaptiveQuality'
import { INTRO_DPR, onRevealDone, revealDone } from './perf/introState'
import { StatsProbe } from './perf/Stats'
import { GridLayer } from './scene/GridLayer'
import { MarkerLayer } from './scene/MarkerLayer'
import { PanelLayer } from './scene/PanelLayer'
import { Room } from './scene/Room'
import { Viewer } from './scene/Viewer'
import { VIEWER } from './scene/roomConfig'
import { GlassLayer } from './systems/GlassLayer'
import { HeroSystem } from './systems/HeroSystem'
import { IntroReveal } from './systems/IntroReveal'
import { LedWall } from './systems/LedWall'
import { TypographySystem } from './systems/TypographySystem'
import { Wordmark } from './systems/Wordmark'
import { OutroWireframe } from './scroll/OutroWireframe'
import { ProjectFrames } from './scroll/ProjectFrames'
import { ProjectOverlay } from './scroll/ProjectOverlay'
import { ScrollController } from './scroll/ScrollController'
import { SCROLL } from './scroll/scrollConfig'

export default function App() {
  // Stop rendering entirely while the tab is hidden. This is visually lossless —
  // nothing is on screen to change — and spares the GPU/CPU (and, on a laptop,
  // the thermal budget that a background transmission pass would otherwise burn).
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always')
  useEffect(() => {
    const onVisibility = () =>
      setFrameloop(document.hidden ? 'never' : 'always')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Live render resolution. Starts at the device's tier ceiling, then
  // AdaptiveQuality raises/lowers it from the *measured* frame rate — so any
  // laptop self-tunes to a smooth framerate instead of relying on a guess.
  /* While the title screen is up the hero is only ever seen inside a
     television, so it renders at a fraction of the pixels — that is what makes
     mounting it up front affordable. It goes to the tier ceiling the moment the
     intro lets go, and AdaptiveQuality takes over from there. */
  const [dpr, setDpr] = useState(revealDone() ? QUALITY.dprMax : INTRO_DPR)
  useEffect(() => onRevealDone(() => setDpr(QUALITY.dprMax)), [])

  return (
    <>
    <Canvas
      className="rd-canvas"
      // Pin the renderer to the viewport with an inline style: R3F sets
      // position/size inline on its container, and inline wins over a class, so
      // the stylesheet alone was being ignored and the canvas collapsed short.
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }}
      // No tone mapping: the material renders at its literal value.
      flat
      // Pause the loop when the tab is backgrounded (see above).
      frameloop={frameloop}
      // Live, adaptive pixel density (see AdaptiveQuality). Starts at the tier
      // ceiling and is scaled to hit a smooth framerate on the actual device.
      dpr={dpr}
      camera={{
        fov: VIEWER.fov,
        near: VIEWER.near,
        far: VIEWER.far,
        position: VIEWER.position,
      }}
    >
      <Viewer />
      {/* Alche's finalCompositeFrag, on the page's own composite — the front
          that hands the title screen over to the hero. Unmounts when it is
          done, so the extra pass exists only while it runs. */}
      <IntroReveal />
      {/* Measures real FPS and scales DPR + transmission to keep it smooth on
          any device. The universal fix for "laggy on some laptop". */}
      <AdaptiveQuality setDpr={setDpr} />
      {/* Drives the camera down the corridor from scroll. Owns the camera at
          progress > 0; at 0 it reproduces the Viewer pose exactly. */}
      <ScrollController />
      {/* Plain key + fill, only so the curvature reads as a surface. No rigs, no effects. */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 8, 10]} intensity={1.4} />
      {/* Wall, panels, dots, grid, marks. See scene/layers.ts. */}
      <Room />
      {/* The wall's light: a procedural LED dot matrix on one cylinder. The
          project image echo is projected through these dots inside the shader. */}
      <LedWall />
      <PanelLayer />
      <TypographySystem />
      <GridLayer />
      <MarkerLayer />
      {/* The sheet over the display. Everything above is seen through it. */}
      <GlassLayer />
      {/* The name, in the gap between the wall and the crystal. */}
      <Wordmark />
      {/* Curved project frames orbiting the logo, in front of the glass. */}
      <ProjectFrames />
      {/* The transmission-glass hero GLB is dropped on phones/tablets: a mobile
          GPU can't afford the whole-scene transmission pass + ~245k-vert model,
          and the mobile layout doesn't need it. Desktop is untouched.
          (?glb=1 forces it back on for testing.) */}
      {!IS_MOBILE && <HeroSystem />}
      {/* Compile every material in the scene graph ONCE, at load — so a project
          frame scrolling into view never stalls the main thread on a first-time
          shader compile (was a ~200 ms spike as the first frame appeared).
          Visually lossless; does not touch the frame loop or timing.
          Skipped on mobile: compiling the whole graph at once is a multi-second
          stall on a weak phone GPU ("first launch incredibly laggy") — there we
          let shaders compile lazily so the hero paints fast. */}
      {!IS_MOBILE && <Preload all />}
      {/* FPS / draw-call HUD, only when ?stats=1. Costs nothing otherwise. */}
      {QUALITY.showStats && <StatsProbe />}
    </Canvas>
    {/* Gives the page its scroll length; the canvas above is fixed. */}
    <div className="rd-scroll-spacer" style={{ height: `${SCROLL.pages * 100}vh` }} />
    {/* Scroll-synced chrome. */}
    <ProjectOverlay />
    {/* The WORKS title is no longer a DOM overlay raking across the screen — it
        is an overlay on the LED wall itself, flowing over the colour behind the
        glass logo, driven by scroll from LedWall. See worksInk in ledWallShader. */}
    {/* Phase 4 — wireframe brand outro + about/contact. */}
    <OutroWireframe />
    </>
  )
}
