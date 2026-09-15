import { useEffect, useRef, useState } from 'react'

import { scrollProgress } from './scrollProgress'
import { LIVE } from '../dev/live'
import { scrambleAll } from './scramble'
import { CrtLedScreen } from './CrtLedScreen'
import { IS_MOBILE } from '../perf/quality'
import { drawLedPanel } from '../systems/ledPanel'

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}
function invlerp(a: number, b: number, x: number): number {
  return clamp01((x - a) / (b - a))
}

/** Stable per-cell value in [0,1], so a cell's fill order never changes. */
function cellHash(i: number, j: number): number {
  const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const CELL = 24 // px

// --- Content (Rohit's real data; edit here, not in layout) -----------------

const STATS: [string, string][] = [
  ['8.06', 'CGPA / 10'],
  ['Top 8', 'of 15,000+ teams · national hackathon'],
  ['01', 'Springer-associated research paper'],
  ['6+', 'AI projects shipped'],
]

const SKILLS: [string, number][] = [
  ['Python', 92],
  ['Generative AI · LLMs', 90],
  ['Machine Learning', 88],
  ['RAG Systems', 87],
  ['Agentic AI', 85],
  ['Full-Stack Development', 84],
  ['React', 82],
  ['Node.js', 80],
]

const SKILL_CHIPS = [
  'Prompt Engineering', 'LangGraph', 'ChromaDB', 'Hugging Face', 'Whisper',
  'Supabase', 'Express', 'Tailwind CSS', 'Streamlit', 'Edge AI · Raspberry Pi',
  'Network Security',
]

const ACHIEVEMENTS: [string, string, string][] = [
  [
    'Top 8 Nationwide — HCL GUVI AI Impact Summit 2026',
    '2026 · Team n0l0ck',
    'Scored 88/100 among 15,000+ teams at Bharat Mandapam with Satark.ai, an agentic honeypot API for real-time scam detection.',
  ],
  [
    'Research Paper — SWSIoT-2025, with Springer',
    'September 2025',
    'Co-authored and presented “Hybrid AI-Powered Framework for Real-Time DDoS Detection Using ML and Entropy-Based Analysis” at the Int’l Conference on Smart Wireless Systems and IoT.',
  ],
  [
    '1st Prize — Avishkar Project Exhibition',
    'Vemana Institute of Technology · ISTE & IEEE',
    'First prize (INR 3,000) for a Traffic Management System at the inter-college exhibition.',
  ],
]

const CERTS: [string, string, string][] = [
  ['Affective Computing', 'NPTEL · 91/100', 'AI × psychology × design — machines that recognise and respond to human emotion.'],
  ['Software Testing', 'NPTEL', '12-week course — test design, black/white-box techniques, automation, QA across the SDLC.'],
  ['Transformer Models & BERT', 'Simplilearn × Google Cloud', 'Attention mechanisms, transformer language modelling, and BERT in NLP tasks.'],
  ['Open Source Models with Hugging Face', 'Simplilearn SkillUp', 'The HF ecosystem, open-source model selection, and practical NLP usage.'],
  ['Introduction to LangGraph', 'Simplilearn SkillUp', 'Agentic workflow orchestration, stateful multi-step LLM pipelines, graph-based agents.'],
]

/**
 * The finale / about-me.
 *
 * White squares dissolve in from the bottom; once that grid is ~75% up the white
 * "about me" panel pulls up behind it for a seamless hand-off. The panel is a
 * scroll-through profile — about + stats, skills, achievements, certifications,
 * beyond-scope projects, contact — each section fading up as it enters view.
 */
export function OutroWireframe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const outRef = useRef<HTMLCanvasElement>(null)
  const whiteRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const crtRef = useRef<HTMLCanvasElement>(null)
  const ledRef = useRef<HTMLCanvasElement>(null)
  const abyssRef = useRef<HTMLDivElement>(null)
  const lastFill = useRef(-1)
  const lastOutFill = useRef(-1)
  // Mount the live LED mini-scene in the CRT only once the finale is near, so the
  // hero never carries a second renderer. `liveRef` mirrors it to keep the RAF
  // from calling setState on every frame.
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)

  // iOS scroll-trap fix: the About panel scrolls inside itself, and on desktop a
  // mouse wheel chains back to the page at the panel's top so you return to the
  // 3D scene. iOS touch does NOT chain that way, so a finger-drag gets trapped in
  // the panel and you can't scroll back up. Here, while the panel is at its top,
  // a downward drag is carried to the window scroll manually — which drives the
  // scene back toward the works section.
  useEffect(() => {
    if (!IS_MOBILE) return
    const panel = scrollRef.current
    if (!panel) return

    let lastY = 0
    const onStart = (e: TouchEvent) => {
      lastY = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY
      const dy = y - lastY
      lastY = y
      // At (or above) the top of the panel and dragging DOWN → pull the page up.
      if (panel.scrollTop <= 0 && dy > 0) {
        window.scrollBy(0, -dy)
      }
    }
    panel.addEventListener('touchstart', onStart, { passive: true })
    panel.addEventListener('touchmove', onMove, { passive: true })
    return () => {
      panel.removeEventListener('touchstart', onStart)
      panel.removeEventListener('touchmove', onMove)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null
    // The second dissolve canvas — the dark grid that closes the white profile.
    const out = outRef.current
    const octx = out?.getContext('2d') ?? null
    // Declared up here so the first resize() (which sizes it) runs after init.
    const led = ledRef.current
    const lctx = led?.getContext('2d') ?? null

    function resize() {
      sizeLed()
      if (out) {
        out.width = Math.floor(window.innerWidth)
        out.height = Math.floor(window.innerHeight)
        lastOutFill.current = -1
      }
      if (!canvas) return
      canvas.width = Math.floor(window.innerWidth)
      canvas.height = Math.floor(window.innerHeight)
      lastFill.current = -1
    }
    resize()
    window.addEventListener('resize', resize)

    function drawPixels(fill: number) {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (fill <= 0) return
      ctx.fillStyle = '#f4f5f7'
      const cols = Math.ceil(canvas.width / CELL)
      const rows = Math.ceil(canvas.height / CELL)
      for (let j = 0; j < rows; j++) {
        const fromBottom = (rows - 1 - j) / rows
        for (let i = 0; i < cols; i++) {
          const edge = (cellHash(i, j) - 0.5) * 0.2
          if (fromBottom < fill + edge) ctx.fillRect(i * CELL, j * CELL, CELL - 1, CELL - 1)
        }
      }
    }

    // The closing dissolve. Near-black cells rise UP (bottom rows first) over the
    // white profile as the contact page rises with them, so the white world
    // pixel-fades straight into the black CRT abyss — matching the way the opening
    // white dissolve climbs from the bottom.
    function drawPixelsOut(fill: number) {
      if (!octx || !out) return
      octx.clearRect(0, 0, out.width, out.height)
      if (fill <= 0) return
      octx.fillStyle = '#0a0b0d'
      const cols = Math.ceil(out.width / CELL)
      const rows = Math.ceil(out.height / CELL)
      for (let j = 0; j < rows; j++) {
        const fromBottom = (rows - 1 - j) / rows
        for (let i = 0; i < cols; i++) {
          const edge = (cellHash(i, j) - 0.5) * 0.2
          if (fromBottom < fill + edge) octx.fillRect(i * CELL, j * CELL, CELL - 1, CELL - 1)
        }
      }
    }

    // The CRT screen — low-res, scaled up by CSS to read as chunky analogue. Most
    // of the time it's greyscale snow; every few seconds it locks onto the hero
    // LED programme so the set reads as alive and glitching, not dead static.
    const crt = crtRef.current
    const cctx = crt?.getContext('2d') ?? null
    if (crt) {
      crt.width = 220
      crt.height = 150
    }
    function drawCrtNoise() {
      if (!crt || !cctx) return
      const img = cctx.createImageData(crt.width, crt.height)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        // Grey-black snow, not bright white: a dark range so the static reads as
        // an old dead channel and the contact text stays legible over it. A rare
        // brighter fleck keeps it from looking flat.
        const v = Math.random() < 0.04 ? 120 + ((Math.random() * 60) | 0) : (Math.random() * 60) | 0
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
        d[i + 3] = 255
      }
      cctx.putImageData(img, 0, 0)
    }

    // A constant veil of grey-black snow over the live LED wall: the grain
    // redraws every frame, but the layer never lifts — it sits at a fixed,
    // semi-transparent opacity (set in CSS) so the wall's colour programme always
    // shows through the interference, the way an old TV displays a channel under
    // a haze of static.
    function drawCrt() {
      drawCrtNoise()
    }

    /* The LED wall behind the CRT. The drawing itself now lives in
       systems/ledPanel so the intro's tube runs the identical wall instead of a
       lookalike — same pitch, same ramp, same sines. Nothing about how this
       looks has changed; it just has one definition now. */
    function sizeLed() {
      if (!led) return
      led.width = Math.max(1, led.offsetWidth)
      led.height = Math.max(1, led.offsetHeight)
    }
    function drawLed(time: number) {
      if (!led || !lctx) return
      drawLedPanel(lctx, led.width, led.height, time)
    }
    sizeLed()
    let ledTick = 0

    let raf = 0
    const tick = () => {
      const s = scrollProgress()

      // Mount / unmount the live LED mini-scene as the finale comes and goes.
      const nearEnd = s > 0.72
      if (nearEnd !== liveRef.current) {
        liveRef.current = nearEnd
        setLive(nearEnd)
      }

      // Animate the CRT + LED wall only when the abyss is near view. The snow
      // redraws every frame (fast grain); its slow tune-in envelope lives in
      // drawCrt. The abyss backdrop dot-matrix stays throttled to ~20fps.
      if (s > 0.82) drawCrt()
      if (s > 0.8 && ++ledTick % 3 === 0) drawLed(performance.now())

      // Pixel dissolve, held back (LIVE.outro) so the last pane leaves first.
      const fill = invlerp(LIVE.outro.gridStart, LIVE.outro.gridEnd, s)
      if (fill !== lastFill.current) {
        drawPixels(fill)
        lastFill.current = fill
      }

      // Seamless hand-off: the white panel pulls up once the grid is 45% filled,
      // over the same quarter of the fill it always took to arrive.
      const slide = invlerp(0.45, 0.7, fill)
      if (whiteRef.current) {
        whiteRef.current.style.transform = `translateY(${(1 - slide) * 100}%)`
        whiteRef.current.style.pointerEvents = slide > 0.5 ? 'auto' : 'none'
      }
      if (canvasRef.current) canvasRef.current.style.opacity = String(1 - slide)

      // The closing dark dissolve, driven by the profile panel's OWN scroll (not
      // the page scroll — the panel scrolls internally once it has slotted up).
      // Near-black cells rise UP over the white profile across the gap stretch;
      // once the grid passes the halfway mark the contact page is PULLED UP from
      // the bottom, rising in front of the pixels until it locks in.
      const panel = scrollRef.current
      if (panel && outRef.current && abyssRef.current) {
        const maxScroll = panel.scrollHeight - panel.clientHeight
        const gap = panel.querySelector('.rd-grid-gap') as HTMLElement | null
        const gapH = gap ? gap.getBoundingClientRect().height : panel.clientHeight
        // Grid fill: held at 0 until the profile is scrolled ~35% into the gap, so
        // the dissolve starts later; 1 when the gap is fully scrolled through.
        const f = invlerp(maxScroll - gapH * 0.65, maxScroll, panel.scrollTop)
        if (f !== lastOutFill.current) {
          drawPixelsOut(f)
          lastOutFill.current = f
        }
        // Contact page rises up from the bottom, starting at 50% grid coverage.
        const up = invlerp(0.5, 1.0, f)
        abyssRef.current.style.transform = `translateY(${(1 - up) * 100}%)`
        // A whisper of fade at the very end so no seam shows behind the contact.
        outRef.current.style.opacity = String(1 - invlerp(0.9, 1.0, f))
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // Each section fades up as it scrolls into view (as the panel arrives, and as
    // the profile is scrolled through).
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('rd-in')
            observer.unobserve(e.target)
          }
        }
      },
      { threshold: 0.18 },
    )
    scrollRef.current
      ?.querySelectorAll('.rd-reveal')
      .forEach((el) => observer.observe(el))

    // Scramble-on-hover across the nav, links and section titles.
    const detachScramble = scrambleAll(document)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      observer.disconnect()
      detachScramble()
    }
  }, [])

  return (
    <div className="rd-finale">
      <canvas ref={canvasRef} className="rd-pixels" />

      <div ref={whiteRef} className="rd-white" style={{ transform: 'translateY(100%)' }}>
        <div ref={scrollRef} className="rd-white-scroll">
          <div className="rd-white-inner">
            <div className="rd-w-top rd-reveal">
              <span className="rd-mono">RD</span>
              <span className="rd-w-avail">◍ Open to opportunities · 2026</span>
            </div>

            {/* ---------------------------------------------------------------
                The profile as a spec sheet rather than a stacked résumé: an
                asymmetric tile grid, so the eye moves around the page instead
                of straight down a column. Every tile keeps .rd-reveal so the
                existing IntersectionObserver still staggers them in.
               --------------------------------------------------------------- */}
            <div className="rd-bento">
              {/* identity */}
              <section className="rd-tile rd-tile--id rd-reveal">
                <span className="rd-w-label" data-scramble>01 — About</span>
                <h1 className="rd-w-name">Rohit Diggi</h1>
                <p className="rd-w-bio">
                  AI/ML engineer and full-stack developer, pursuing a B.Tech (Hons.)
                  in CSE at RV University, Bengaluru, specialising in AI/ML. I build
                  real-world AI systems: RAG pipelines, agentic AI, and
                  network-security research. That includes <b>Satark.ai</b>, an
                  agentic honeypot API that placed Top 8 nationwide at the HCL GUVI
                  AI Impact Summit 2026, and a co-authored paper on hybrid AI-powered
                  DDoS detection presented at SWSIoT-2025 in association with
                  Springer. I care about clean UI, scalable systems, and AI that
                  actually ships.
                </p>
              </section>

              {/* the dossier card — facts already stated in the bio, pulled out
                  as a scannable index card */}
              <aside className="rd-tile rd-tile--spec rd-reveal">
                <span className="rd-tile-cap" data-scramble>Specification</span>
                <div className="rd-spec-mark" aria-hidden="true">RD</div>
                <dl className="rd-spec">
                  <div><dt>Model</dt><dd>RD · 2026</dd></div>
                  <div><dt>Based</dt><dd>Bengaluru, IN</dd></div>
                  <div><dt>Field</dt><dd>AI/ML · Full-stack</dd></div>
                  <div><dt>Institute</dt><dd>RV University</dd></div>
                  <div><dt>Status</dt><dd><i className="rd-spec-dot" />Available</dd></div>
                </dl>
              </aside>

              {/* the numbers, as their own row of small tiles */}
              {STATS.map(([n, l]) => (
                <div key={l} className="rd-tile rd-tile--stat rd-reveal">
                  <span className="rd-w-stat-n">{n}</span>
                  <span className="rd-w-stat-l">{l}</span>
                </div>
              ))}

              {/* skills */}
              <section className="rd-tile rd-tile--skills rd-reveal">
                <span className="rd-w-label" data-scramble>02 — Skills</span>
                <div className="rd-w-bars">
                  {SKILLS.map(([name, lvl]) => (
                    <div key={name} className="rd-w-bar">
                      <div className="rd-w-bar-head">
                        <span>{name}</span>
                        <span className="rd-w-bar-lvl">LVL {lvl}</span>
                      </div>
                      <div className="rd-w-bar-track">
                        <div className="rd-w-bar-fill" style={{ width: `${lvl}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* stack */}
              <section className="rd-tile rd-tile--chips rd-reveal">
                <span className="rd-tile-cap" data-scramble>Stack</span>
                <div className="rd-w-skills">
                  {SKILL_CHIPS.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </section>

              {/* achievements */}
              <section className="rd-tile rd-tile--rec rd-reveal">
                <span className="rd-w-label" data-scramble>03 — Achievements</span>
                <ul className="rd-w-list">
                  {ACHIEVEMENTS.map(([t, m, d]) => (
                    <li key={t}>
                      <h3 data-scramble>{t}</h3>
                      <span className="rd-w-list-meta">{m}</span>
                      <p>{d}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {/* certifications */}
              <section className="rd-tile rd-tile--rec rd-reveal">
                <span className="rd-w-label" data-scramble>04 — Certifications</span>
                <ul className="rd-w-list">
                  {CERTS.map(([t, m, d]) => (
                    <li key={t}>
                      <h3 data-scramble>{t}</h3>
                      <span className="rd-w-list-meta">{m}</span>
                      <p>{d}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

          </div>

          {/* The closing dissolve plays across this empty stretch: scrolling it by
              rains the dark grid (rd-pixels-out) down over the white profile, and
              past the halfway mark pulls the contact page down from the top. */}
          <div className="rd-grid-gap" aria-hidden="true" />
        </div>
      </div>

      {/* The closing dark dissolve — above the white panel, behind the contact —
          so it wipes over the profile while the contact page descends in front. */}
      <canvas ref={outRef} className="rd-pixels-out" />

      {/* The contact page — an old CRT set in a black abyss. Sits as a full-screen
          overlay that is PULLED UP from the bottom (translateY 100% → 0) as the
          grid fills, so it rises in with the pixels rather than dropping from above.
          The container ignores the pointer so wheel scrolls the panel behind it
          (you can scroll back up); only the links themselves stay clickable. */}
      <div className="rd-crt-abyss" ref={abyssRef}>
        <canvas ref={ledRef} className="rd-led-wall" />
        <div className="rd-crt-glow" />
        <div className="rd-crt">
          <div className="rd-crt-screen">
            {/* The live hero LED wall, playing behind the snow (mounted only near
                the finale). The snow layer above it tunes in and out to reveal it. */}
            {live && <CrtLedScreen />}
            <canvas ref={crtRef} className="rd-crt-static" />
            <div className="rd-crt-scan" />
            <div className="rd-crt-content">
              <span className="rd-crt-ch" data-scramble>CH 06 — CONTACT</span>
              <h2 className="rd-crt-head" data-scramble>Contact me</h2>
              <a
                className="rd-crt-mail"
                href="mailto:rohitdiggi@outlook.com"
                data-scramble
              >
                rohitdiggi@outlook.com
              </a>
              <div className="rd-crt-links">
                <a href="https://github.com/Rohx24" target="_blank" rel="noreferrer" data-scramble>
                  GitHub ↗
                </a>
                {/* TODO: real LinkedIn URL */}
                <a href="https://linkedin.com/in/rohit-j-d-b38069302" target="_blank" rel="noreferrer" data-scramble>
                  LinkedIn ↗
                </a>
                {/* TODO: real WhatsApp number → https://wa.me/9198XXXXXXXX */}
                <a href="https://wa.me/8861502347" target="_blank" rel="noreferrer" data-scramble>
                  WhatsApp ↗
                </a>
              </div>
              {/* Download only. The readable version lives on the title screen;
                  by the time anyone is down here they want the file. */}
              <a className="rd-crt-cv" href="/resume/Rohit-Diggi-Resume.pdf" download>
                Download résumé ↓
              </a>
            </div>
          </div>
          <div className="rd-crt-badge">RD · 2026</div>
        </div>
      </div>
    </div>
  )
}
