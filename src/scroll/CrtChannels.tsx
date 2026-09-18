import { Fragment, useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'

import { CrtLedScreen } from './CrtLedScreen'
import { PROJECTS } from './projects'
import { lastPush } from './releaseDownloads'

/**
 * The contact set as a working television.
 *
 * The screen carries four channels (contact, now, work, credits), picked from
 * the guide under the set, the knob on the bezel or the arrow keys, each change covered by a burst of the
 * snow that is already running and the channel number flashed in the corner the
 * way a set's on-screen display does. Every channel is in the DOM from the start
 * and only its visibility changes, so the hover scramble (attached once, at
 * mount) reaches all of them.
 */

const MAIL = 'rohitdiggi@outlook.com'
const CHANNELS = ['06', '07', '08', '09'] as const
const NAMES = ['Contact', 'Now', 'Work', 'Credits'] as const
/** One line each in the channel guide under the set. */
const BLURBS = [
  'Email, links and my résumé',
  'Local time and what I am up to',
  'Every project, one click away',
  'How this site was made',
] as const

/** Channel 08's list: the gallery's projects, then DriveDash (no gallery pane). */
const WORK = [
  ...PROJECTS.map((p) => ({ i: p.index, title: p.title, tag: p.categoryTag, href: p.launchUrl ?? '/works.html' })),
  { i: '06', title: 'DriveDash', tag: 'Android · Navigation', href: 'https://github.com/Rohx24/Drivedash' },
]

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
  // bumped each time the set comes into view, so its lines rise in again
  const [shown, setShown] = useState(0)

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

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let visible = false
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !visible) setShown((n) => n + 1)
        visible = e.isIntersecting
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

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
          {/* keeps the snow and the lamps behind the type from fighting it */}
          <div className="rd-crt-scrim" />
          <Fragment key={`show-${shown}`}>
            {/* CH 06 · contact */}
            <div className="rd-crt-content" data-on={ch === 0 ? '' : undefined}>
              <span className="rd-crt-ch">CH 06 · Contact</span>
              <h2 className="rd-crt-head">Contact me</h2>
              <p className="rd-crt-lede">Open to opportunities · Bengaluru, IN</p>
              <a className="rd-crt-mail" href={`mailto:${MAIL}`}>
                {MAIL}
              </a>
              <div className="rd-crt-links">
                <a href="https://github.com/Rohx24" target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
                <a href="https://linkedin.com/in/rohit-j-d-b38069302" target="_blank" rel="noreferrer">
                  LinkedIn ↗
                </a>
                <a href="https://wa.me/918861502347" target="_blank" rel="noreferrer">
                  WhatsApp ↗
                </a>
              </div>
              {/* Say hi without leaving: whatever is typed here becomes the body of
                  an email, opened in the visitor's own mail app on Enter. */}
              <form className="rd-crt-say" onSubmit={send}>
                <label htmlFor="rd-crt-say-input">
                  {sent ? 'Opening your mail app…' : 'Type a message, press Enter to email me'}
                </label>
                <div className="rd-crt-say-row">
                  <span aria-hidden="true">&gt;</span>
                  <input
                    id="rd-crt-say-input"
                    value={msg}
                    onChange={(e) => {
                      setMsg(e.target.value)
                      setSent(false)
                    }}
                    maxLength={600}
                    placeholder="Hi Rohit, I'd like to talk about…"
                    spellCheck={false}
                  />
                  <button type="submit" disabled={!msg.trim()}>
                    Send ↵
                  </button>
                </div>
              </form>
              <a className="rd-crt-cv" href="/resume/Rohit-Diggi-Resume.pdf" download>
                Download résumé ↓
              </a>
            </div>

            {/* CH 07 · now */}
            <div className="rd-crt-content" data-on={ch === 1 ? '' : undefined}>
              <span className="rd-crt-ch">CH 07 · Now</span>
              <div className="rd-crt-clock">{clock}</div>
              <span className="rd-crt-sub">in Bengaluru, IN</span>
              <dl className="rd-crt-facts">
                <div>
                  <dt>Studying</dt>
                  <dd>Final-year B.Tech (Hons.) CSE, AI/ML at RV University</dd>
                </div>
                <div>
                  <dt>Research</dt>
                  <dd>Research Assistant, Rochester Institute of Technology</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Open to opportunities · 2026</dd>
                </div>
              </dl>
              <a className="rd-crt-sub rd-crt-live-link" href="https://github.com/Rohx24" target="_blank" rel="noreferrer">
                {push ? `Last push to GitHub ${push} ↗` : 'GitHub ↗'}
              </a>
            </div>

            {/* CH 08 · work */}
            <div className="rd-crt-content" data-on={ch === 2 ? '' : undefined}>
              <span className="rd-crt-ch">CH 08 · Work</span>
              <ol className="rd-crt-work">
                {WORK.map((w) => (
                  <li key={w.i}>
                    <a href={w.href} target="_blank" rel="noreferrer">
                      <span>{w.i}</span>
                      <b>{w.title}</b>
                      <em>{w.tag}</em>
                      <i aria-hidden="true">↗</i>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="rd-crt-links">
                <a href="/works.html">All work ↗</a>
                <a href="/lab.html">Lab ↗</a>
              </div>
            </div>

            {/* CH 09 · credits: they roll, the way a film's do. Mounted only while
                the channel is on, so tuning in always starts them from the bottom. */}
            <div className="rd-crt-content rd-crt-content--roll" data-on={ch === 3 ? '' : undefined}>
              {ch === 3 && <CreditsRoll />}
            </div>
          </Fragment>

          {/* the set's on-screen display, flashed on every change */}
          <div key={`osd-${ch}`} className="rd-crt-osd" aria-hidden="true">
            CH {CHANNELS[ch]}
          </div>
        </div>
        <CrtBar ch={ch} onTune={tune} touched={touched} />
      </div>
      <ChannelGuide ch={ch} onTune={tune} />
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

/**
 * End credits. Two nested transforms, both linear and equally long: the outer
 * slides a screen's height (in from the bottom edge), the inner slides its own
 * height (out past the top), so the text travels the whole way on the
 * compositor with no layout. Hovering holds it.
 */
function CreditsRoll() {
  return (
    <div className="rd-crt-roll" aria-label="Credits">
      <div className="rd-crt-roll-in">
        <div className="rd-crt-roll-track">
          <p className="rd-roll-kicker">CH 09 · Credits</p>
          <p className="rd-roll-title">Rohit Diggi</p>
          <div className="rd-roll-block">
            <span>Directed, designed &amp; built by</span>
            <b>Rohit Diggi</b>
          </div>
          <div className="rd-roll-block">
            <span>Starring</span>
            {WORK.map((w) => (
              <b key={w.i}>{w.title}</b>
            ))}
          </div>
          <div className="rd-roll-block">
            <span>Research</span>
            <b>Rochester Institute of Technology</b>
            <b>RV University</b>
          </div>
          <div className="rd-roll-block">
            <span>Rendering</span>
            <b>three.js</b>
            <b>React Three Fiber</b>
          </div>
          <div className="rd-roll-block">
            <span>Build</span>
            <b>Vite · TypeScript</b>
          </div>
          <div className="rd-roll-block">
            <span>Typefaces</span>
            <b>Space Grotesk</b>
            <b>Russo One</b>
          </div>
          <div className="rd-roll-block">
            <span>Hero mark</span>
            <b>55,884 triangles · 0.48 MB</b>
          </div>
          <div className="rd-roll-block">
            <span>Filmed on location in</span>
            <b>Bengaluru, India</b>
          </div>
          <p className="rd-roll-end">Thanks for watching.</p>
        </div>
      </div>
    </div>
  )
}

/**
 * The channel guide under the set: every channel, what is on it, and which one
 * is showing. Doubles as the way in for anyone who never finds the knob.
 */
function ChannelGuide({ ch, onTune }: { ch: number; onTune: (n: number) => void }) {
  return (
    <nav className="rd-crt-guide" aria-label="Channels">
      {CHANNELS.map((c, i) => (
        <button
          key={c}
          type="button"
          data-on={ch === i ? '' : undefined}
          aria-pressed={ch === i}
          onClick={() => onTune(i)}
        >
          <span className="rd-crt-guide-top">
            <i aria-hidden="true" />
            CH {c}
          </span>
          <b>{NAMES[i]}</b>
          <small>{BLURBS[i]}</small>
        </button>
      ))}
    </nav>
  )
}
