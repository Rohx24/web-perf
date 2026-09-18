import { Canvas } from '@react-three/fiber'

import { LedWall } from '../systems/LedWall'
import { VIEWER } from '../scene/roomConfig'

/**
 * A live miniature of the hero LED wall, played inside the contact-set CRT.
 *
 * It is the *same* `<LedWall/>` the hero runs — the real shader, not a 2D fake —
 * in its own small renderer, framed with the hero's own camera so the set shows
 * the genuine programme. The renderer is opaque black (alpha off) so the wall's
 * additive dots glow against black exactly as they do over the dark room; the
 * CRT's snow layer sits in front and dissolves away to reveal this.
 *
 * At finale scroll the shared scroll state is ~1, so the wall runs its colour-
 * field roster (the Alche hue programme) rather than the code/glyph programmes —
 * a clean, ever-shifting colour signal for the set to lock onto.
 *
 * Mounted only when the finale is near (see OutroWireframe) so the hero never
 * pays for a second renderer while it is on screen.
 */
export function CrtLedScreen() {
  return (
    <Canvas
      className="rd-crt-live"
      flat
      // It plays under a 40% snow veil and scanlines, so full retina resolution
      // and MSAA bought nothing visible for the cost of a second renderer.
      dpr={[1, 1.5]}
      gl={{ alpha: false, antialias: false }}
      camera={{
        fov: VIEWER.fov,
        near: VIEWER.near,
        far: VIEWER.far,
        position: VIEWER.position,
      }}
      onCreated={({ camera }) => {
        camera.lookAt(VIEWER.target[0], VIEWER.target[1], VIEWER.target[2])
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 8, 10]} intensity={1.4} />
      <LedWall />
    </Canvas>
  )
}
