/**
 * Changing channel.
 *
 * The whole site is a television: the title screen is a CRT, the last page is a
 * set with a knob on it. So going to Work or the Lab is not a page load, it is a
 * channel change. The picture pumps, collapses to a bright line and snaps to a
 * dot the way a tube switching off does, static rushes in, and the next page
 * opens back out of that line with the channel flashed in the corner.
 *
 * Only Work and the Lab do this. Every other link navigates plainly.
 *
 * Two documents, one effect: the outgoing page plays the switch-off and leaves a
 * note in sessionStorage; the incoming page reads that note before its first
 * paint (the inline snippet in its <head>) and plays the tune-in. The seam is
 * hidden because both halves end and begin on the same black frame with the same
 * static over it.
 */

const CHANNELS = {
  '/works.html': { n: '02', name: 'Work' },
  '/lab.html': { n: '03', name: 'Lab' },
}
const NOTE = 'rd.channel'
const OUT_MS = 520
const IN_MS = 900
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

const styles = `
.rd-ch-veil { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; background: #000; opacity: 0; }
.rd-ch-veil canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; image-rendering: pixelated; mix-blend-mode: screen; }
/* the tube's last line of light, and the dot it snaps to */
.rd-ch-line {
  position: fixed; left: 50%; top: 50%; z-index: 2147483001; height: 2px; width: 0;
  transform: translate(-50%, -50%); pointer-events: none; opacity: 0; border-radius: 2px;
  background: #fff; box-shadow: 0 0 18px 4px rgba(190, 225, 255, 0.85), 0 0 60px 12px rgba(120, 180, 255, 0.45);
}
/* the set's on-screen display, the same one the contact TV flashes */
.rd-ch-osd {
  position: fixed; top: 7vh; right: 6vw; z-index: 2147483002; pointer-events: none;
  font: 700 clamp(13px, 1.6vw, 20px) / 1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.18em; text-transform: uppercase; color: #7dff9a;
  text-shadow: 0 0 12px rgba(125, 255, 154, 0.8); opacity: 0;
}
/* the picture itself: collapsed to a line, then opened back out */
html.rd-ch-out body, html.rd-ch-in body { will-change: transform, filter; }
`

/** Grey-black snow, redrawn a few times a second, scaled up hard and blocky. */
function snow(canvas) {
  const w = 96
  const h = Math.max(24, Math.round((96 * innerHeight) / innerWidth))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  let raf = 0
  const draw = () => {
    const img = ctx.createImageData(w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() < 0.05 ? 150 + ((Math.random() * 90) | 0) : (Math.random() * 70) | 0
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    raf = requestAnimationFrame(draw)
  }
  draw()
  return () => cancelAnimationFrame(raf)
}

function stage() {
  const veil = document.createElement('div')
  veil.className = 'rd-ch-veil'
  const canvas = document.createElement('canvas')
  veil.appendChild(canvas)
  const line = document.createElement('div')
  line.className = 'rd-ch-line'
  document.body.append(veil, line)
  return { veil, canvas, line, stop: snow(canvas) }
}

const ease = { in: 'cubic-bezier(0.7, 0, 0.84, 0)', out: 'cubic-bezier(0.16, 1, 0.3, 1)' }
const play = (el, frames, ms, opts = {}) =>
  el.animate(frames, { duration: ms, fill: 'forwards', ...opts })

/** Switch the tube off, then hand over to the next document. */
function switchOff(href, channel) {
  document.documentElement.classList.add('rd-ch-out')
  const { veil, canvas, line } = stage()
  const body = document.body

  // the picture surges, then folds to a line: a tube losing its vertical hold
  play(body, [
    { transform: 'scale(1)', filter: 'brightness(1) contrast(1)' },
    { transform: 'scale(1.012)', filter: 'brightness(1.5) contrast(1.15) saturate(0.7)', offset: 0.3 },
    { transform: 'scaleX(1.035) scaleY(0.004)', filter: 'brightness(2.6) contrast(1.3) saturate(0.2)' },
  ], OUT_MS * 0.78, { easing: ease.in })
  play(veil, [{ opacity: 0 }, { opacity: 0.55, offset: 0.6 }, { opacity: 1 }], OUT_MS)
  play(canvas, [{ opacity: 0 }, { opacity: 0.5 }], OUT_MS * 0.8)
  // the line lingers a moment after the picture has gone, then pinches to a dot
  play(line, [
    { width: '0vw', opacity: 0, offset: 0 },
    { width: '86vw', opacity: 1, offset: 0.55 },
    { width: '30vw', opacity: 1, offset: 0.85 },
    { width: '0vw', opacity: 0.9, offset: 1 },
  ], OUT_MS)

  try {
    sessionStorage.setItem(NOTE, JSON.stringify({ t: Date.now(), ...channel }))
  } catch {
    // no note: the next page simply appears, which is the old behaviour
  }
  setTimeout(() => { location.href = href }, OUT_MS)
  // if the navigation never happens (blocked, offline), give the page back
  setTimeout(() => {
    document.documentElement.classList.remove('rd-ch-out')
    body.getAnimations().forEach((a) => a.cancel())
    veil.remove()
    line.remove()
  }, 6000)
}

/** Open the picture back out of the line, and flash the channel. */
function tuneIn(channel) {
  const { veil, canvas, line, stop } = stage()
  const body = document.body
  veil.style.opacity = '1'
  canvas.style.opacity = '0.5'

  const osd = document.createElement('div')
  osd.className = 'rd-ch-osd'
  osd.textContent = `CH ${channel.n} · ${channel.name}`
  document.body.appendChild(osd)

  // hold the collapsed frame, show it, and only then let go of the head's hold
  body.style.transform = 'scaleX(1.04) scaleY(0.004)'
  body.style.filter = 'brightness(2.6) saturate(0.2)'
  body.style.visibility = 'visible'
  document.documentElement.classList.remove('rd-ch-in')

  play(line, [
    { width: '0vw', opacity: 1 },
    { width: '92vw', opacity: 1, offset: 0.22 },
    { width: '100vw', opacity: 0, offset: 0.5 },
    { width: '100vw', opacity: 0 },
  ], IN_MS * 0.6, { easing: ease.out })
  play(body, [
    { transform: 'scaleX(1.04) scaleY(0.004)', filter: 'brightness(2.6) saturate(0.2)', offset: 0 },
    { transform: 'scaleX(1.02) scaleY(0.05)', filter: 'brightness(1.9) saturate(0.5)', offset: 0.22 },
    { transform: 'scale(1)', filter: 'brightness(1) saturate(1)' },
  ], IN_MS, { easing: ease.out })
  play(veil, [{ opacity: 1 }, { opacity: 0.6, offset: 0.35 }, { opacity: 0 }], IN_MS * 0.9)
  play(canvas, [{ opacity: 0.5 }, { opacity: 0.22, offset: 0.4 }, { opacity: 0 }], IN_MS * 0.9)
  play(osd, [
    { opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.72 }, { opacity: 0 },
  ], 1800)

  setTimeout(() => {
    stop()
    veil.remove()
    line.remove()
    body.style.transform = body.style.filter = body.style.visibility = ''
  }, IN_MS)
  setTimeout(() => osd.remove(), 1900)
}

/* ---- wiring ------------------------------------------------------------- */

const sheet = document.createElement('style')
sheet.textContent = styles
document.head.appendChild(sheet)

/** The channel a link goes to, or null if it is an ordinary link. */
function channelFor(a) {
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return null
  const href = a.getAttribute('href') || ''
  if (!href.startsWith('/')) return null
  const path = href.split('#')[0].split('?')[0]
  return CHANNELS[path] ? { ...CHANNELS[path], href } : null
}

document.addEventListener('click', (e) => {
  if (still || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const channel = channelFor(e.target.closest && e.target.closest('a[href]'))
  if (!channel) return
  e.preventDefault()
  switchOff(channel.href, { n: channel.n, name: channel.name })
})

// Warm the destination on hover, so the switch is not waiting on the network.
const warmed = new Set()
document.addEventListener('pointerover', (e) => {
  const channel = channelFor(e.target.closest && e.target.closest('a[href]'))
  if (!channel || warmed.has(channel.href)) return
  warmed.add(channel.href)
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = channel.href
  document.head.appendChild(link)
}, { passive: true })

// Arriving: the note is only left by a switch-off, and only Work and the Lab
// carry this half of the effect (their <head> sets .rd-ch-in before first paint).
if (document.documentElement.classList.contains('rd-ch-in')) {
  let channel = null
  try {
    const note = JSON.parse(sessionStorage.getItem(NOTE) || 'null')
    if (note && Date.now() - note.t < 8000) channel = note
    sessionStorage.removeItem(NOTE)
  } catch {
    channel = null
  }
  if (channel && !still) tuneIn(channel)
  else document.documentElement.classList.remove('rd-ch-in')
}

/* Back from a switch-off. The page that switched off is frozen mid-collapse,
   and the browser can restore it from its cache exactly as it was, so hand the
   picture back whenever this document is shown again. */
addEventListener('pageshow', (e) => {
  if (!e.persisted && !document.documentElement.classList.contains('rd-ch-out')) return
  document.documentElement.classList.remove('rd-ch-out')
  document.body.getAnimations().forEach((a) => a.cancel())
  document.body.style.transform = document.body.style.filter = document.body.style.visibility = ''
  document.querySelectorAll('.rd-ch-veil, .rd-ch-line, .rd-ch-osd').forEach((el) => el.remove())
})

// ?chdbg=1 exposes both halves, so the effect can be driven (and slowed with
// document.getAnimations()) without waiting on a real navigation.
if (new URLSearchParams(location.search).get('chdbg') === '1') {
  window.__channel = { switchOff, tuneIn }
}
