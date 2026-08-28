import { Color } from 'three'

/**
 * The colour the wall is currently showing behind the logo.
 *
 * The LED wall writes it every frame from the same ramp it is drawing with; the
 * crystal reads it as its absorption and sheen colour, so the block is stained
 * by whatever is actually behind it and drifts as the wall drifts.
 *
 * A shared mutable Color rather than state: it changes every frame and no React
 * tree needs to re-render when it does.
 */
export const WALL_TINT = new Color('#8FA8FF')
