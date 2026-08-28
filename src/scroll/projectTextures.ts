import { SRGBColorSpace, Texture, TextureLoader, type WebGLRenderer } from 'three'

/**
 * Shared, pre-warmed cache for the project preview textures.
 *
 * Each preview is 1920×1080 → ~8 MB of VRAM. Loaded the old way (one
 * `TextureLoader().load()` per frame, lazily), the decode + GPU upload happened
 * the first time each frame scrolled into view — a 100–290 ms main-thread stall
 * landing exactly on a project transition (measured worst: 288 ms as "AI
 * Boardroom" appeared).
 *
 * Here every preview is loaded ONCE into a shared cache and force-uploaded to the
 * GPU up front via `renderer.initTexture`, so by the time the gallery is reached
 * nothing has to decode or upload mid-scroll. The pixels are untouched — same
 * image, same colour space, same anisotropy — so it is visually identical; only
 * *when* the upload happens changes.
 */

const cache = new Map<string, Texture>()
const loader = new TextureLoader()

/** The shared texture for a preview URL, created (but not necessarily uploaded
 *  yet) on first request. */
export function getProjectTexture(url: string): Texture {
  const existing = cache.get(url)
  if (existing) return existing

  const texture = loader.load(url)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  cache.set(url, texture)
  return texture
}

/**
 * Kick off loading of every preview and, as each finishes decoding, push it to
 * the GPU immediately — so the stall is spent here, during the initial load,
 * instead of mid-scroll. Safe to call more than once; already-cached textures
 * are only re-uploaded if they have not been yet.
 */
export function prewarmProjectTextures(gl: WebGLRenderer, urls: string[]): void {
  for (const url of urls) {
    const cached = cache.get(url)
    if (cached) {
      if (cached.image && (cached.image as { width?: number }).width) {
        try {
          gl.initTexture(cached)
        } catch {
          /* upload will happen on first draw as before */
        }
      }
      continue
    }
    const texture = loader.load(url, (loaded) => {
      try {
        gl.initTexture(loaded)
      } catch {
        /* upload will happen on first draw as before */
      }
    })
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    cache.set(url, texture)
  }
}
