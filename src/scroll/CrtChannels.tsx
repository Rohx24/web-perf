import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'

import { CrtLedScreen } from './CrtLedScreen'
import { PROJECTS } from './projects'
import { lastPush } from './releaseDownloads'
import { drawTicker, layoutTicker } from './ledTicker'

/**
 * The contact set as a working television.
 *
 * The screen carries four channels — contact, now, work, credits — flipped with
 * the knob on the bezel or the arrow keys, each change covered by a burst of the
 * snow that is already running and the channel number flashed in the corner the
 * way a set's on-screen display does. Every channel is in the DOM from the start
 * and only its visibility changes, so the hover scramble (attached once, at
 * mount) reaches all of them.
 */

const MAIL = 'rohitdiggi@outlook.com'
const CHANNELS = ['06', '07', '08', '09'] as const
const NAMES = ['Contact', 'Now', 'Work', 'Credits'] as const

const TICKER =
  "Let's build something * Open to opportunities * rohitdiggi@outlook.com * " +
  'Bengaluru, IN * Thanks for scrolling all the way down * '

function bengaluruTime(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date())
}

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

/** True while the contact page is fully up (it is translated off-screen otherwise). */
function onScreen(el: HTMLElement | null): boolean {
  const abyss = el?.closest('.rd-crt-abyss')
  return !!abyss && Math.abs(abyss.getBoundingClientRect().top) < 2
}

export function ContactSet({
  live,
  staticRef,
}: {
  /** mount the live LED picture (OutroWireframe decides when it is worth it) */
  live: boolean
  /** the snow canvas, which OutroWireframe draws into every frame */
  staticRef: RefObject<HTMLCanvasElement | null>
}) {
  const [ch, setCh] = useState(0)
  const [touched, setTouched] = useState(false)
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)
  const [clock, setClock] = useState(bengaluruTime)
  const [push, setPush] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const tune = (next: number) => {
    setCh(((next % CHANNELS.length) + CHANNELS.length) % CHANNELS.length)
    setTouched(true)
    // the snow already running under the picture flares up to cover the change
    staticRef.current?.animate([{ opacity: 1 }, { opacity: 0.4 }], {
      duration: 420,
      easing: 'ease-out',
    })
  }
  const tuneRef = useRef(tune)
  tuneRef.current = tune
  const chRef = useRef(ch)
  chRef.current = ch

  // Arrow keys flip channels while the set is up (not while typing a message).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return
      if (!onScreen(rootRef.current)) return
      tuneRef.current(chRef.current + (e.key === 'ArrowRight' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // "Now": a live Bengaluru clock, and the last public push, fetched once when
  // the channel is first tuned rather than for everyone who loads the page.
  useEffect(() => {
    if (ch !== 1) return
    setClock(bengaluruTime())
    const id = window.setInterval(() => setClock(bengaluruTime()), 15000)
    if (push === null) {
      lastPush('Rohx24').then((iso) => setPush(iso ? ago(iso) : ''))
    }
    return () => window.clearInterval(id)
  }, [ch, push])

  const send = (e: FormEvent) => {
    e.preventDefault()
    const body = msg.trim()
    if (!body) return
    window.location.href = `mailto:${MAIL}?subject=${encodeURIComponent('Hi Rohit')}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <div ref={rootRef} className="rd-crt-stage">
      <div className="rd-crt">
        <div className="rd-crt-screen">
          {/* The live hero LED wall, playing behind the snow. */}
          {live && <CrtLedScreen />}
          <canvas ref={staticRef} className="rd-crt-static" />
          <div className="rd-crt-scan" />
          {/* CH 06 · contact */}
          <div className="rd-crt-content" data-on={ch === 0 ? '' : undefined}>
            <span className="rd-crt-ch" data-scramble>
              CH 06 · CONTACT
            </span>
            <h2 className="rd-crt-head" data-scramble>
              Contact me
            </h2>
            <a className="rd-crt-mail" href={`mailto:${MAIL}`} data-scramble>
              {MAIL}
            </a>
            <div className="rd-crt-links">
              <a href="https://github.com/Rohx24" target="_blank" rel="noreferrer" data-scramble>
                GitHub ↗
              </a>
              <a
                href="https://linkedin.com/in/rohit-j-d-b38069302"
                target="_blank"
                rel="noreferrer"
                data-scramble
              >
                LinkedIn ↗
              </a>
              <a href="https://wa.me/918861502347" target="_blank" rel="noreferrer" data-scramble>
                WhatsApp ↗
              </a>
            </div>
            {/* Say hi without leaving: whatever is typed here becomes the body of
              an email, opened in the visitor's own mail app on Enter. */}
            <form className="rd-crt-say" onSubmit={send}>
              <span aria-hidden="true">&gt;</span>
              <input
                value={msg}
                onChange={(e) => {
                  setMsg(e.target.value)
                  setSent(false)
                }}
                maxLength={600}
                placeholder={sent ? 'opening your mail app…' : 'type a message, press enter'}
                aria-label="Message to Rohit, sent by email"
                spellCheck={false}
              />
            </form>
            <a className="rd-crt-cv" href="/resume/Rohit-Diggi-Resume.pdf" download>
              Download résumé ↓
            </a>
          </div>

          {/* CH 07 · now */}
          <div className="rd-crt-content" data-on={ch === 1 ? '' : undefined}>
            <span className="rd-crt-ch" data-scramble>
              CH 07 · NOW
            </span>
            <div className="rd-crt-clock">{clock}</div>
            <span className="rd-crt-sub">in Bengaluru, IN</span>
            <ul className="rd-crt-list">
              <li>Final-year B.Tech (Hons.) CSE, AI/ML · RV University</li>
              <li>Research Assistant · Rochester Institute of Technology</li>
              <li>Open to opportunities · 2026</li>
            </ul>
            <a
              className="rd-crt-sub rd-crt-live-link"
              href="https://github.com/Rohx24"
              target="_blank"
              rel="noreferrer"
            >
              {push ? `last push to GitHub ${push} ↗` : 'GitHub ↗'}
            </a>
          </div>

          {/* CH 08 · work */}
          <div className="rd-crt-content" data-on={ch === 2 ? '' : undefined}>
            <span className="rd-crt-ch" data-scramble>
              CH 08 · WORK
            </span>
            <ol className="rd-crt-work">
              {PROJECTS.map((p) => (
                <li key={p.index}>
                  <span>{p.index}</span>
                  <a
                    href={p.launchUrl ?? '/works.html'}
                    target="_blank"
                    rel="noreferrer"
                    data-scramble
                  >
                    {p.title}
                  </a>
                </li>
              ))}
              <li>
                <span>06</span>
                <a href="https://github.com/Rohx24/Drivedash" target="_blank" rel="noreferrer" data-scramble>
                  DriveDash
                </a>
              </li>
            </ol>
            <div className="rd-crt-links">
              <a href="/works.html" data-scramble>
                All work ↗
              </a>
              <a href="/lab.html" data-scramble>
                Lab ↗
              </a>
            </div>
          </div>

          {/* CH 09 · credits */}
          <div className="rd-crt-content" data-on={ch === 3 ? '' : undefined}>
            <span className="rd-crt-ch" data-scramble>
              CH 09 · CREDITS
            </span>
            <dl className="rd-crt-credits">
              <div>
                <dt>Design &amp; code</dt>
                <dd>Rohit Diggi</dd>
              </div>
              <div>
                <dt>Rendering</dt>
                <dd>three.js · React Three Fiber</dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>Vite · TypeScript</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>Space Grotesk · Russo One</dd>
              </div>
              <div>
                <dt>Hero mark</dt>
                <dd>55,884 triangles · 0.48 MB</dd>
              </div>
            </dl>
            <span className="rd-crt-sub">Thanks for watching.</span>
          </div>

          {/* the set's on-screen display, flashed on every change */}
          <div key={ch} className="rd-crt-osd" aria-hidden="true">
            CH {CHANNELS[ch]}
          </div>
        </div>
        <CrtBar ch={ch} onTune={tune} touched={touched} />
      </div>
      <LedTicker />
    </div>
  )
}

/** The knob strip under the screen: power lamp, badge, channel stepper. */
function CrtBar({
  ch,
  onTune,
  touched,
}: {
  ch: number
  onTune: (n: number) => void
  touched: boolean
}) {
  return (
    <div className="rd-crt-bar">
      <span className="rd-crt-power" aria-hidden="true" />
      <span className="rd-crt-badge">RD · 2026</span>
      <div className="rd-crt-knob" role="group" aria-label="Channel">
        <button type="button" aria-label="Previous channel" onClick={() => onTune(ch - 1)}>
          ‹
        </button>
        <span className="rd-crt-chnum" aria-live="polite">
          CH {CHANNELS[ch]} · {NAMES[ch]}
        </span>
        <button
          type="button"
          aria-label="Next channel"
          data-hint={touched ? undefined : ''}
          onClick={() => onTune(ch + 1)}
        >
          ›
        </button>
      </div>
    </div>
  )
}

/** The LED crawl under the set. Runs only while it is actually on screen. */
function LedTicker() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const cols = layoutTicker(TICKER)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let visible = false
    let offset = 0
    let last = performance.now()

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    }
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (!still) offset = (offset + dt * 16) % cols.length
      drawTicker(ctx, canvas.width, canvas.height, cols, offset, now)
      if (visible && !still) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      cancelAnimationFrame(raf)
      if (visible) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    })
    size()
    io.observe(canvas)
    window.addEventListener('resize', size)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className="rd-crt-ticker"
      aria-label="Let's build something. Open to opportunities."
      role="img"
    />
  )
}
