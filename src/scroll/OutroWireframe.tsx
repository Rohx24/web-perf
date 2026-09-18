import { useEffect, useRef, useState } from 'react'

import { scrollProgress } from './scrollProgress'
import { LIVE } from '../dev/live'
import { scrambleAll } from './scramble'
import { countUp } from './countUp'
import { ContactSet } from './CrtChannels'
import { setSceneCovered } from '../perf/sceneCover'
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

/** [number, label, the story on the back of the tile] */
const STATS: [string, string, string][] = [
  ['8.06', 'CGPA / 10', 'B.Tech (Hons.) CSE, specialising in AI/ML · RV University, Bengaluru'],
  ['Top 8', 'of 15,000+ teams · national hackathon', 'HCL GUVI AI Impact Summit 2026 · Satark.ai scored 88/100 at Bharat Mandapam'],
  ['01', 'Springer-associated research paper', 'SWSIoT-2025 with Springer · hybrid AI-powered real-time DDoS detection'],
  ['6+', 'AI projects shipped', 'Including Satark.ai, BhashaBuddy, AI Boardroom and Parallel Risk-Assessment Agents'],
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

/** Which stack tools light up when a skill is hovered. A categorisation, not a
 *  claim about any single project. Names must match SKILLS and SKILL_CHIPS. */
const SKILL_LINKS: Record<string, string[]> = {
  'Python': ['Hugging Face', 'Streamlit', 'Whisper'],
  'Generative AI · LLMs': ['Prompt Engineering', 'Hugging Face', 'Whisper'],
  'Machine Learning': ['Hugging Face', 'Streamlit', 'Edge AI · Raspberry Pi', 'Network Security'],
  'RAG Systems': ['ChromaDB', 'LangGraph', 'Prompt Engineering'],
  'Agentic AI': ['LangGraph', 'Prompt Engineering'],
  'Full-Stack Development': ['Supabase', 'Express', 'Tailwind CSS'],
  'React': ['Tailwind CSS', 'Supabase'],
  'Node.js': ['Express', 'Supabase'],
}

const ACHIEVEMENTS: [string, string, string][] = [
  [
    'Top 8 Nationwide · India AI Impact Buildathon',
    'HCL GUVI · AI Impact Summit 2026 · Team N0Lock',
    'Scored 88/100 among 15,000+ teams at Bharat Mandapam with Satark.ai, an agentic honeypot API for real-time scam detection.',
  ],
  [
    'Research Paper · SWSIoT-2025, with Springer',
    'September 2025',
    'Co-authored and presented “Hybrid AI-Powered Framework for Real-Time DDoS Detection Using ML and Entropy-Based Analysis” at the Int’l Conference on Smart Wireless Systems and IoT.',
  ],
  [
    '1st Prize · IEEE Smart City Project Exhibition',
    'Avishkar · Vemana Institute of Technology · ISTE & IEEE',
    'First prize (INR 3,000) for Vimana ResQ, an emergency vehicle preemption system for traffic signals.',
  ],
  [
    'Best Project · Structured Innovation',
    'RV University',
    'Conceived, designed and built an entirely new board game from scratch, original enough that it has been sent for patent filing.',
  ],
]

const CERTS: [string, string, string][] = [
  ['Affective Computing', 'NPTEL · 91/100', 'AI × psychology × design: machines that recognise and respond to human emotion.'],
  ['Software Testing', 'NPTEL', '12-week course on test design, black/white-box techniques, automation and QA across the SDLC.'],
  ['Transformer Models & BERT', 'Simplilearn × Google Cloud', 'Attention mechanisms, transformer language modelling, and BERT in NLP tasks.'],
  ['Open Source Models with Hugging Face', 'Simplilearn SkillUp', 'The HF ecosystem, open-source model selection, and practical NLP usage.'],
  ['Introduction to LangGraph', 'Simplilearn SkillUp', 'Agentic workflow orchestration, stateful multi-step LLM pipelines, graph-based agents.'],
]

/**
 * A stat that counts up as it arrives and turns over to the story behind it.
 *
 * The flip is a data attribute, never a class: the reveal observer adds .rd-in
 * to this element by hand, and a React className update would wipe it and drop
 * the tile back to opacity 0 the moment it was clicked.
 */
function StatTile({ n, label, story }: { n: string; label: string; story: string }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <button
      type="button"
      className="rd-tile rd-tile--stat rd-reveal"
      data-flipped={flipped ? '' : undefined}
      aria-pressed={flipped}
      aria-label={`${n} ${label}. ${story}`}
      onClick={() => setFlipped((f) => !f)}
    >
      <span className="rd-stat-inner" aria-hidden="true">
        <span className="rd-stat-face">
          <span className="rd-w-stat-n" data-count="">{n}</span>
          <span className="rd-w-stat-l">{label}</span>
        </span>
        <span className="rd-stat-face rd-stat-back">
          <span className="rd-stat-story">{story}</span>
        </span>
      </span>
    </button>
  )
}

/**
 * Skill bars whose levels count up with their fill, and a stack that lights up
 * the tools a hovered skill goes with.
 *
 * Its own component so a hover re-renders these two tiles, not the whole finale.
 * Highlight state rides data attributes on inner elements, for the same reason
 * as StatTile: the .rd-reveal tiles themselves are never re-classed.
 */
function SkillsAndStack() {
  const [active, setActive] = useState<string | null>(null)
  const lit = active ? (SKILL_LINKS[active] ?? []) : []
  return (
    <>
      <section className="rd-tile rd-tile--skills rd-reveal">
        <span className="rd-w-label" data-scramble>02 / Skills</span>
        <div className="rd-w-bars" data-focus={active ? '' : undefined}>
          {SKILLS.map(([name, lvl]) => (
            <div
              key={name}
              className="rd-w-bar"
              tabIndex={0}
              data-active={active === name ? '' : undefined}
              onMouseEnter={() => setActive(name)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(name)}
              onBlur={() => setActive(null)}
            >
              <div className="rd-w-bar-head">
                <span>{name}</span>
                <span className="rd-w-bar-lvl">
                  LVL <span data-count="" data-count-delay="150" data-count-dur="1200">{lvl}</span>
                </span>
              </div>
              <div className="rd-w-bar-track">
                <div className="rd-w-bar-fill" style={{ width: `${lvl}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rd-tile rd-tile--chips rd-reveal">
        <span className="rd-tile-cap" data-scramble>Stack</span>
        <div className="rd-w-skills" data-focus={active ? '' : undefined}>
          {SKILL_CHIPS.map((c) => (
            <span key={c} data-lit={lit.includes(c) ? '' : undefined}>{c}</span>
          ))}
        </div>
      </section>
    </>
  )
}

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
      // Each cell's edge jitters ±0.1 around the front, so a front that stops at 1
      // leaves the top tenth of the screen ragged and unfilled for good. Stretched
      // to −0.1..1.1: nothing at 0, every cell by 1, and the front's centre still on
      // `fill`, so half-filled is half the screen.
      const front = fill * 1.2 - 0.1
      for (let j = 0; j < rows; j++) {
        const fromBottom = (rows - 1 - j) / rows
        for (let i = 0; i < cols; i++) {
          const edge = (cellHash(i, j) - 0.5) * 0.2
          if (fromBottom < front + edge) ctx.fillRect(i * CELL, j * CELL, CELL - 1, CELL - 1)
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
    // Lamps near the pointer swell and brighten, so the wall answers the cursor.
    const pointer = { x: -1e4, y: -1e4 }
    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    function drawLed(time: number) {
      if (!led || !lctx) return
      drawLedPanel(lctx, led.width, led.height, time, {
        spot: { x: pointer.x, y: pointer.y, r: 170 },
      })
    }
    sizeLed()
    let ledTick = 0

    let raf = 0
    const tick = () => {
      const s = scrollProgress()


      // Pixel dissolve, held back (LIVE.outro) so the last pane leaves first.
      const fill = invlerp(LIVE.outro.gridStart, LIVE.outro.gridEnd, s)
      if (fill !== lastFill.current) {
        drawPixels(fill)
        lastFill.current = fill
      }

      // The white panel follows the grid up from halfway and arrives exactly as the
      // grid completes. Its top sits at 2·fill − 1, never above the fill front, so
      // there is always grid above it until both reach the top together.
      const slide = invlerp(0.5, 1.0, fill)
      if (whiteRef.current) {
        whiteRef.current.style.transform = `translateY(${(1 - slide) * 100}%)`
        // Docked, the panel is opaque edge to edge: the 3D scene can stop (perf/sceneCover).
        setSceneCovered(slide >= 1)
        /* The panel only takes the wheel once it has fully arrived. Interactive from
           halfway, a wheel over the centre scrolled the profile while it was still
           rising; now the page keeps the wheel, and keeps driving the rise, until it
           is up. Nothing inside opts back into pointer events, so this gate holds. */
        const docked = slide >= 1
        whiteRef.current.style.pointerEvents = docked ? 'auto' : 'none'
        // ...and it always arrives at its top, however the page was left
        if (!docked && scrollRef.current && scrollRef.current.scrollTop !== 0) {
          scrollRef.current.scrollTop = 0
        }
      }
      /* No crossfade. The panel stacks above this canvas and its base is the same
         #f4f5f7 the cells are painted in, so solid cells above a rising panel read
         as the same paper. Fading them with the slide only ever showed a half-built
         grid as grey blocks with the scene through them -- and with the panel now
         arriving at 45% fill, that was most of the rise. Hidden only once the panel
         covers the screen exactly; any earlier and a strip of scene shows above it. */
      if (canvasRef.current) canvasRef.current.style.opacity = slide >= 1 ? '0' : '1'

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

        /* The live LED picture is a second WebGL renderer. It used to mount at the
           last project card and run through the whole About section unseen; now it
           mounts once the closing dissolve is a quarter in -- early enough to be up
           before the set arrives -- and goes when the dissolve is scrolled back out. */
        const want = liveRef.current ? f > 0.05 : f > 0.25
        if (want !== liveRef.current) {
          liveRef.current = want
          setLive(want)
        }
        // The snow and the backdrop dot matrix only draw while the page is showing.
        if (up > 0) {
          drawCrt()
          if (++ledTick % 2 === 0) drawLed(performance.now())
        }
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
            // any numbers in the tile count up as it arrives, once
            e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp)
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
      window.removeEventListener('pointermove', onPointer)
      observer.disconnect()
      detachScramble()
      setSceneCovered(false)
    }
  }, [])

  /* About: scroll the profile back to its top, which lowers the contact page with it.
     Rewind: scroll the document to the top. The scene's eased, speed-capped scroll
     then plays the whole site back in reverse on the way there. */
  const toAbout = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  const rewind = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
                <span className="rd-w-label" data-scramble>01 / About</span>
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

              {/* the numbers: they count up as they arrive and turn over to the story */}
              {STATS.map(([n, l, story]) => (
                <StatTile key={l} n={n} label={l} story={story} />
              ))}

              {/* skills + stack: hovering a skill lights up its tools */}
              <SkillsAndStack />

              {/* achievements */}
              <section className="rd-tile rd-tile--rec rd-reveal">
                <span className="rd-w-label" data-scramble>03 / Achievements</span>
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
                <span className="rd-w-label" data-scramble>04 / Certifications</span>
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
        {/* The site header, back for the last page so there is a way out that
            is not scrolling eleven screens up. */}
        <header className="rd-fin-nav">
          <button type="button" className="rd-fin-brand" onClick={rewind} data-scramble>
            ROHIT DIGGI
          </button>
          <nav className="rd-fin-links">
            <a href="/works.html" data-scramble>Work</a>
            <button type="button" onClick={toAbout} data-scramble>About</button>
            <a href="/lab.html" data-scramble>Lab</a>
            <a href="/resume.html" target="_blank" rel="noopener" data-scramble>Résumé</a>
          </nav>
          <button type="button" className="rd-fin-rewind" onClick={rewind} aria-label="Rewind to the start">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.85" />
              <path d="M2.6 2.4v3.3h3.3" />
            </svg>
            Rewind
          </button>
        </header>
        <ContactSet live={live} staticRef={crtRef} />
        <footer className="rd-fin-foot">
          <span>© 2026 Rohit Diggi · Bengaluru, IN</span>
          <span className="rd-fin-hint">‹ › to change channel</span>
        </footer>
      </div>
    </div>
  )
}
