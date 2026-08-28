import { useEffect, useRef } from 'react'

import { PROJECTS } from './projects'
import { SCROLL } from './scrollConfig'
import { scrollProgress } from './scrollProgress'
import { scrambleAll } from './scramble'

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

/**
 * The persistent chrome for the sequence: a brand tag, the rotated section
 * label that rides the gallery, and the scroll hint at the very top. The
 * per-project copy now lives on the card meshes; the outro owns its own corner
 * UI. Everything here fades out as the outro takes over.
 *
 * Ignores the pointer, and never re-renders — it just mutates refs from rAF.
 */
export function ProjectOverlay() {
  const brandRef = useRef<HTMLDivElement>(null)
  const worksRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const infoRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef<HTMLSpanElement>(null)
  const tagRef = useRef<HTMLSpanElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const techRef = useRef<HTMLDivElement>(null)
  const visitRef = useRef<HTMLAnchorElement>(null)
  const shown = useRef(-1)

  useEffect(() => {
    const { galleryStart, galleryEnd, outroStart } = SCROLL.phase
    let raf = 0
    const tick = () => {
      const s = scrollProgress()
      const beforeOutro = 1 - smoothstep(outroStart - 0.04, outroStart, s)

      if (brandRef.current) brandRef.current.style.opacity = String(beforeOutro)

      const inGallery =
        smoothstep(SCROLL.phase.diveEnd, galleryStart + 0.04, s) * beforeOutro
      if (worksRef.current) worksRef.current.style.opacity = String(inGallery * 0.5)

      if (hintRef.current) hintRef.current.style.opacity = String(1 - smoothstep(0, 0.05, s))

      // The active project's copy, big and legible on the main display — the
      // window itself carries only the mac chrome + preview. Which project is at
      // front follows the same phase the panes use.
      const galleryT = clamp((s - galleryStart) / (galleryEnd - galleryStart), 0, 1)
      const active = clamp(Math.round(galleryT * PROJECTS.length - 0.5), 0, PROJECTS.length - 1)
      if (active !== shown.current) {
        shown.current = active
        const p = PROJECTS[active]
        if (indexRef.current) indexRef.current.textContent = p.index
        if (tagRef.current) tagRef.current.textContent = p.categoryTag
        if (titleRef.current) titleRef.current.textContent = p.title
        if (techRef.current) techRef.current.textContent = p.tech.join('  ·  ')
        if (visitRef.current) {
          if (p.launchUrl) {
            visitRef.current.href = p.launchUrl
            visitRef.current.style.display = 'inline-flex'
          } else {
            visitRef.current.style.display = 'none'
          }
        }
      }
      if (infoRef.current) infoRef.current.style.opacity = String(inGallery)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // Scramble-on-hover for the nav and CTA (and anything else marked below).
    const detachScramble = scrambleAll(document)
    return () => {
      cancelAnimationFrame(raf)
      detachScramble()
    }
  }, [])

  return (
    <div className="rd-overlay">
      {/* Top bar, Alche-style: mark left, sections centre, a contact CTA right. */}
      <nav ref={brandRef} className="rd-nav">
        <div className="rd-nav-brand">ROHIT DIGGI</div>
        <div className="rd-nav-links">
          {/* Work → the separate works archive page (Alche-style, its own HTML). */}
          <a href="/works.html" data-scramble>Work</a>
          {/* About → smooth-scroll straight down to the Rohit Diggi about panel. */}
          <a
            href="#about"
            data-scramble
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth',
              })
            }}
          >
            About
          </a>
          <a href="#lab" data-scramble>Lab</a>
        </div>
        <a className="rd-nav-cta" href="mailto:rohitjd.btech23@rvu.edu.in" data-scramble>
          Contact ↗
        </a>
      </nav>
      <div ref={worksRef} className="rd-works">
        WORKS
      </div>
      {/* The active project, set large on the main display, outside the pane. */}
      <div ref={infoRef} className="rd-active" style={{ opacity: 0 }}>
        <div className="rd-active-meta">
          <span ref={indexRef} className="rd-active-index" />
          <span ref={tagRef} className="rd-active-tag" />
        </div>
        <div ref={titleRef} className="rd-active-title" />
        <div ref={techRef} className="rd-active-tech" />
        <a
          ref={visitRef}
          className="rd-active-visit"
          target="_blank"
          rel="noreferrer"
          data-scramble
        >
          Visit ↗
        </a>
      </div>
      <div ref={hintRef} className="rd-hint">
        SCROLL
      </div>
    </div>
  )
}
