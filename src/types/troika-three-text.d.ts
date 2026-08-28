// troika-three-text ships no type declarations, and there is no @types package
// for it. This covers only the surface the app actually touches: `preloadFont`,
// used to build every glyph's SDF up front so the first word never hitches.
declare module 'troika-three-text' {
  interface PreloadFontOptions {
    font?: string
    characters?: string | string[]
    sdfGlyphSize?: number
  }

  export function preloadFont(
    options: PreloadFontOptions,
    callback: () => void,
  ): void
}
