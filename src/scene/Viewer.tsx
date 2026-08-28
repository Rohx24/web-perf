import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { VIEWER } from './roomConfig'

/**
 * Puts the camera where a person would stand inside the room: eye height,
 * a little back of centre, aimed into the curve.
 */
export function Viewer() {
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    camera.position.set(...VIEWER.position)
    camera.lookAt(...VIEWER.target)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}
