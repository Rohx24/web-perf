import { MathUtils } from 'three'

/**
 * Single source of truth for the room's architecture.
 * All dimensions are in metres so the space stays humanly proportioned.
 */
export const ROOM = {
  /** Distance from the room's axis to the display wall. */
  radius: 9,
  /**
   * The wall is one continuous band with no floor and no ceiling. Both edges
   * sit well outside the frustum — the camera's rays reach roughly +9.4m and
   * -3.2m up and down the far wall — so the surface, and the grid on it, run
   * unbroken from the top of the viewport to the bottom at any window shape.
   */
  bottom: -10,
  top: 14,
  /**
   * How far the wall wraps around the axis. 360deg would be a closed drum;
   * this leaves the segment behind the viewer open, like a curved display wall.
   *
   * Trimmed from 212 to 160: at fov 35 only ~110-120deg of arc is ever on
   * screen, so the far edges were pure waste — panels, grid, markers and dots
   * rendered for nothing. Everything (panel addressing, arc length) derives from
   * this, so the visible centre is unchanged; only the never-seen edges go.
   */
  wrapAngle: MathUtils.degToRad(160),
  /**
   * Radial subdivisions across the full 360deg.
   *
   * Four cylinders are built from this — the room, the panels, the emitters and
   * the glass — so it is paid for several times over. At 512 the visible arc got
   * roughly a segment every three screen pixels, which is far finer than a
   * silhouette needs; 192 leaves about eight, and the curve still reads as
   * perfectly smooth because nothing here is lit by a normal that would show the
   * faceting.
   */
  radialSegments: 192,
} as const

/** Total vertical extent of the wall band. */
export const ROOM_HEIGHT = ROOM.top - ROOM.bottom
/** Y of the band's midpoint, where the cylinder mesh is centred. */
export const ROOM_CENTRE_Y = (ROOM.top + ROOM.bottom) / 2

/**
 * One matte charcoal surface for the whole room. Untextured, near-black,
 * and rough enough that it absorbs light instead of returning it.
 */
export const SURFACE = {
  /**
   * Albedo, not the on-screen value. Shading scales it by ~0.475 in linear
   * space, so #2a2a2a here renders as ~#1a1a1a on the lit face of the wall:
   * dark grey, almost black.
   */
  color: '#2a2a2a',
  roughness: 0.97,
  metalness: 0,
} as const

/**
 * Where a person would naturally stand: slightly back of centre,
 * eye height, facing into the curve.
 */
export const VIEWER = {
  position: [0, 1.62, 6] as [number, number, number],
  target: [0, 2.9, -ROOM.radius] as [number, number, number],
  // Pulled in to 35: a tighter lens shows less of the wall and reads the logo
  // larger. The scene is optimised around this framing.
  fov: 35,
  near: 0.1,
  far: 200,
} as const
