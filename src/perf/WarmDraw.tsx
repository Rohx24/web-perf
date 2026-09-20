import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { WebGLRenderTarget } from 'three'
import type { Mesh, Object3D } from 'three'

import { onRevealDone } from './introState'

/**
 * Draw everything once, before anyone is looking.
 *
 * `<Preload all/>` compiles every material at load, which removed the shader
 * stalls. It does not fix the other half: a geometry's buffers and its vertex
 * array are only sent to the GPU the first time that object is actually drawn.
 * At the hero about 154 objects are drawn; by the time the gallery is on screen
 * it is 166. Those dozen first draws all land in the same handful of frames --
 * the scroll off the hero -- which is the stutter people feel there, and why it
 * is only ever felt once per direction: the second pass is already warm.
 *
 * So this renders one frame with frustum culling switched off, into a 1x1
 * target. Every object is drawn, every buffer is uploaded, and the result is
 * thrown away. It costs a frame of setup at a moment when nothing is moving,
 * and it is visually lossless: nothing reaches the screen.
 *
 * It runs twice, because the scene is not complete at mount: once when this
 * mounts, and once at the end of the reveal, by which point the hero's model,
 * the project textures and the first typography have all arrived.
 */
export function WarmDraw() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const warm = () => {
      const target = new WebGLRenderTarget(1, 1)
      const unculled: Object3D[] = []
      scene.traverse((object) => {
        const mesh = object as Mesh
        if ((mesh.isMesh || (object as { isPoints?: boolean }).isPoints) && object.frustumCulled) {
          object.frustumCulled = false
          unculled.push(object)
        }
      })
      const previous = gl.getRenderTarget()
      // info.autoReset is off during a nested render elsewhere in the app; this
      // runs outside the frame loop, so the counters it touches do not matter.
      gl.setRenderTarget(target)
      gl.render(scene, camera)
      gl.setRenderTarget(previous)
      unculled.forEach((object) => {
        object.frustumCulled = true
      })
      target.dispose()
    }

    warm()
    const off = onRevealDone(() => warm())
    return off
  }, [gl, scene, camera])

  return null
}
