import type { Texture } from 'three'

/**
 * The live pointer-fluid velocity field, written by FluidCursor each frame and
 * read by the LED wall shader.
 *
 * It lives in its own module (not in FluidCursor.tsx) so that the component file
 * exports only a component — mixing a value export into a component module breaks
 * React Fast Refresh, which cascades into the dev control registry being wiped.
 *
 * The texture object alternates between the sim's two ping-pong targets, so
 * consumers must re-read `FLUID.texture` every frame rather than caching it.
 */
export const FLUID: { texture: Texture | null } = { texture: null }
