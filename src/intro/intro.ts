import './intro.css'
import { createCrtScene, type CrtHandle } from './crtScene'
import {
  QUALITY,
  TIER_STORAGE_KEY,
  autoTier,
  readVibrance,
  saveVibrance,
  type Tier,
} from '../perf/quality'




/** The reveal, in one place so it can be dialled from ?tune=1. */
export const REVEAL = {
  /** how long the front takes to cross the screen */
  dur: 3000,
  /** the page arrives magnified and settles to 1:1, as Alche's does */
  zoom: 1.6,
}

/** The push into the screen after the blow-out, and the black it ends on. */
const DIVE = { ms: 900, scale: 3.6 }


/**
 * `href` makes a row a real link rather than a scripted one.
 *
 * The résumé used to open with window.open(), which the browser is entitled to
 * swallow as a pop-up — silently, with no error, which is exactly how it
 * presented: nothing happened on the deployed site while localhost was fine,
 * because pop-up permission is per-site and localhost is commonly allowed.
 * A user-activated link navigation is not subject to that, and it also gets
 * middle-click, cmd-click, "open in new tab" and a visible destination on
 * hover, none of which a button can offer.
 */
const MENU: { id: string; label: string; href?: string }[] = [
  { id: 'enter', label: 'Enter System' },
  { id: 'resume', label: 'Résumé', href: '/resume.html' },
  { id: 'contact', label: 'Contact' },
  { id: 'settings', label: 'Settings' },
]

/**
 * The cinematic CRT title screen. Vanilla Three.js CRT (right) + HTML/CSS room
 * and menu (left). ENTER cuts to the tube's own picture full screen, hunts for
 * a channel, locks onto the hero's mark, then hands off to the real portfolio.
 */
export function startIntro (opts: { onEnter: (target: string) => void }) {
  const root = document.createElement('div')
  root.className = 'intro-root'
  root.innerHTML = `
    <div class="intro-stage">
      <div class="intro-plate"></div>
      <div class="intro-lamp"></div>
      <div class="intro-win"></div>
      <div class="intro-motes"></div>
      <div class="intro-desk"><div class="intro-desk-sheen"></div></div>
      <div class="intro-set">
        <div class="intro-shadow"></div>
        <div class="intro-halo"></div>
        <div class="intro-crt"></div>
        <div class="intro-spill"></div>
      </div>
      <div class="intro-note n1">GOOD IDEAS<br>LATE NIGHTS</div>
      <div class="intro-note n2">BUILD<br>EXPLORE<br>REPEAT</div>
    </div>
    <div class="intro-grade"></div>
    <div class="intro-roll"></div>
    <div class="intro-corner tl">RD · 2026<br>BENGALURU, IN</div>
    <div class="intro-corner tr">CH 06<br>SIGNAL: <span class="hi">FOUND</span><br>USER: ROHIT<br>STATUS: BUILDING</div>
    <div class="intro-corner bl">SAME BRAIN<br>DIFFERENT DAY</div>
    <div class="intro-corner br">RUNNING ON<br>TOO MUCH COFFEE</div>
    <div class="intro-left">
      <div class="intro-title"><span class="r">Rohit</span><span class="d" data-t="DIGGI">DIGGI</span></div>
      <div class="intro-menu"></div>
      <div class="intro-settings" hidden>
        <div class="intro-set-row">
          <span class="intro-set-label">Quality</span>
          <div class="intro-quality-opts"></div>
        </div>
        <div class="intro-set-row">
          <span class="intro-set-label">Vibrance</span>
          <input class="intro-vib" type="range" min="0.5" max="1.8" step="0.05" />
          <span class="intro-vib-val"></span>
        </div>
        <p class="intro-set-note">Quality reloads. Vibrance applies as you drag.</p>
      </div>
    </div>
    <div class="intro-scan"></div>
    <div class="intro-fade"><div class="intro-signal"></div></div>
  `
  document.body.appendChild(root)

  /* Lock the page while the title screen is up.

     The portfolio mounts underneath now, and it brings its own scroll length
     with it — so a wheel over the title screen was quietly scrolling the site
     behind it, and ENTER dropped you wherever you had got to instead of at the
     top of the hero. Nothing here scrolls, so taking the scroll away costs the
     title screen nothing. It is handed back at the reveal, from the top. */
  document.documentElement.classList.add('rd-intro-lock')

  // --- menu ---
  const menuEl = root.querySelector('.intro-menu') as HTMLElement
  let sel = 0
  const buttons = MENU.map((m, i) => {
    const b = document.createElement(m.href ? 'a' : 'button')
    b.innerHTML = `<span class="car">▶</span><span class="lbl">${m.label}</span>`
    if (m.href) {
      const a = b as HTMLAnchorElement
      a.href = m.href
      a.target = '_blank'
      a.rel = 'noopener'
    }
    b.addEventListener('click', () => {
      sel = i
      paint()
      // a link navigates on its own; everything else needs the handler
      if (!m.href) activate()
    })
    b.addEventListener('mouseenter', () => { sel = i; paint() })
    menuEl.appendChild(b)
    return b
  })
  const paint = () => buttons.forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)))
  paint()

  /* Quality, on the title screen rather than buried in the site.

     It defaults to LOW because detection kept picking a tier machines could not
     hold, and this is the floor — so the way back up belongs here, in front of
     the visitor, before anything heavy has been asked of their GPU. Changing it
     reloads: dpr and the transmission buffer are read once at module load, and
     half-applying them would be a lie. */
  const QOPTS: { id: Tier | 'auto'; label: string }[] = [
    { id: 'low', label: 'Low' },
    { id: 'med', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'auto', label: 'Auto' },
  ]
  const panel = root.querySelector('.intro-settings') as HTMLElement
  const qWrap = root.querySelector('.intro-quality-opts') as HTMLElement
  for (const o of QOPTS) {
    const b = document.createElement('button')
    b.textContent = o.label
    if (o.id === QUALITY.tier && QUALITY.source !== 'default') b.setAttribute('aria-current', 'true')
    else if (o.id === 'low' && QUALITY.source === 'default') b.setAttribute('aria-current', 'true')
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      const pick = o.id === 'auto' ? autoTier() : o.id
      try {
        localStorage.setItem(TIER_STORAGE_KEY, pick)
        window.location.reload()
      } catch {
        // storage blocked (private window) — the URL is honoured too
        window.location.search = `?tier=${pick}`
      }
    })
    qWrap.appendChild(b)
  }

  // Vibrance drags live — it is only a filter on the composited canvas, so
  // there is no renderer to rebuild and no reason to make anyone reload for it.
  const vib = root.querySelector('.intro-vib') as HTMLInputElement
  const vibVal = root.querySelector('.intro-vib-val') as HTMLElement
  vib.value = String(readVibrance())
  vibVal.textContent = `${Math.round(readVibrance() * 100)}%`
  vib.addEventListener('input', () => {
    const v = Number(vib.value)
    vibVal.textContent = `${Math.round(v * 100)}%`
    saveVibrance(v)
  })
  vib.addEventListener('click', (e) => e.stopPropagation())

  // --- 3D CRT ---
  const crt: CrtHandle = createCrtScene(root.querySelector('.intro-crt') as HTMLElement)
  // Fade the set in only once the tube is actually on, so it never pops.
  crt.onReady(() => root.classList.add('crt-ready'))

  const params = new URLSearchParams(window.location.search)
  // ?crtdbg=1 exposes the tube so its state can be driven from the console
  // without sitting through the whole ENTER sequence each time.
  if (params.get('crtdbg') === '1') (window as unknown as { __crt: CrtHandle }).__crt = crt
  // The room plate has a real desk in it now, so the CSS one stays off unless
  // explicitly asked for (?desk=1) — kept around in case the plate changes.
  if (params.get('desk') !== '1') root.classList.add('no-desk')
  // ?look=warm|cool|matte swaps the colour grade; default is the baked one.
  const look = params.get('look')
  if (look && /^[a-z]+$/.test(look)) root.classList.add(`look-${look}`)

  // --- dust drifting through the lamp light ---
  const motes = root.querySelector('.intro-motes') as HTMLElement
  for (let i = 0; i < 14; i++) {
    const m = document.createElement('i')
    // spread across the lit left/centre of the room, where dust would catch
    m.style.cssText =
      `left:${6 + Math.random() * 62}%;` +
      `top:${10 + Math.random() * 70}%;` +
      `--s:${(0.6 + Math.random() * 1.6).toFixed(2)}px;` +
      `--d:${(26 + Math.random() * 34).toFixed(1)}s;` +
      `--delay:${(-Math.random() * 40).toFixed(1)}s;` +
      `--drift:${(Math.random() * 2 - 1).toFixed(2)};` +
      `opacity:${(0.10 + Math.random() * 0.30).toFixed(2)}`
    motes.appendChild(m)
  }


  // --- keyboard ---
  let entering = false
  const onKey = (e: KeyboardEvent) => {
    if (entering) return
    // don't steal arrows/enter from the tuner's sliders
    const t = e.target as HTMLElement | null
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { sel = (sel + 1) % MENU.length; paint(); e.preventDefault() }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { sel = (sel - 1 + MENU.length) % MENU.length; paint(); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === ' ') { activate(); e.preventDefault() }
  }
  window.addEventListener('keydown', onKey)

  const cleanup = () => {
    document.documentElement.classList.remove('rd-intro-lock')
    window.removeEventListener('keydown', onKey)
    crt.dispose()
    root.remove()
  }

  function activate () {
    const item = MENU[sel]
    /* Keyboard goes through the same navigation the mouse does, rather than a
       second code path that can rot on its own. */
    if (item.href) { buttons[sel].click(); return }
    if (item.id === 'settings') { panel.hidden = !panel.hidden; return }
    runEnter(item.id)
  }

  function runEnter (target: string) {
    if (entering) return
    entering = true

    /* 1. The channel change: the tube pulses five times in its own room, the
       gaps closing and each pulse brighter than the last, until it blows out.
       Driven off one clock rather than chained timers so the envelope stays
       exact even if a frame is late. */
    crt.setEnter(0.5)
    root.classList.add('switching')
    const ONSETS = [0, 460, 830, 1130, 1370] // gaps closing: 460/370/300/240
    const PEAKS = [0.35, 0.5, 0.7, 0.95, 1.4] // and brighter each time
    const PULSE = 260 // each blink swells and falls rather than snapping
    const CUT = 1720 // the blow-out, and the moment the dive starts
    const SETTLE = 1150 // how long that blow-out takes to calm

    const t0 = performance.now()
    let cut = false
    const drive = () => {
      const e = performance.now() - t0
      let v = 0
      for (let i = 0; i < ONSETS.length; i++) {
        const d = e - ONSETS[i]
        // sine envelope: rises and falls smoothly, so the tube swells instead
        // of snapping on and off
        if (d >= 0 && d < PULSE) v = Math.max(v, PEAKS[i] * Math.sin((Math.PI * d) / PULSE))
      }
      if (e >= CUT) {
        if (!cut) { cut = true; dive() }
        const s = Math.min(1, (e - CUT) / SETTLE)
        v = Math.max(v, 2.3 * (1 - s) * (1 - s)) // eases out, so it settles
      }
      crt.setFlash(v)
      if (e < CUT + SETTLE) requestAnimationFrame(drive)
      else crt.setFlash(0)
    }
    requestAnimationFrame(drive)
    // rAF is suspended while the tab is hidden; timers are not
    window.setTimeout(() => { if (!cut) { cut = true; crt.setFlash(0); dive() } }, CUT + 250)

    /* 2. The dive. On the blow-out the room pushes in on the glowing screen and
       goes to black, and the page's own reveal opens the hero out of that black.

       This replaced a full-screen "finding channel" hunt: the hero seen through
       the tube's lamp lattice, RGB-split copy and tearing, for about three
       seconds before anything happened. A push is uniform scale on a flat
       plate, so unlike the old camera flight there is nothing in it to shear.
       The origin is the screen's centre, so the screen is what grows toward
       you. `scale` composes with the plate's centring transform and its
       tracking-error `translate`, and touches neither. */
    function dive () {
      const stage = root.querySelector('.intro-stage') as HTMLElement
      const screen = root.querySelector('.intro-crt') as HTMLElement
      const r = screen.getBoundingClientRect()
      const box = root.getBoundingClientRect()
      // the scale origin, in the plate's own (untransformed) layout box
      const ox = r.left + r.width / 2 - box.left - stage.offsetLeft
      const oy = r.top + r.height / 2 - box.top - stage.offsetTop
      stage.style.transformOrigin = `${ox}px ${oy}px`
      // on the root, so the black veil (the root's ::after) reads them too
      root.style.setProperty('--dive-scale', String(DIVE.scale))
      root.style.setProperty('--dive-ms', `${DIVE.ms}ms`)
      root.classList.remove('switching')
      root.classList.add('diving')
      window.setTimeout(handoff, DIVE.ms)
    }

    /* 3. Hand over, in the black the dive ends on. The reveal itself belongs to
       the page's own composite, the way Alche's does (systems/IntroReveal), and
       its "before" is black too, so the seam cannot show. All this does is let
       go: tell the app the title screen is done, which starts that front and
       lifts the hero off its intro resolution, and take this layer away. */
    function handoff () {
      // hand the page back at the top, wherever the visitor's wheel had gone
      window.scrollTo(0, 0)
      document.documentElement.classList.remove('rd-intro-lock')
      opts.onEnter(target)
      root.classList.add('signing-off')
      window.setTimeout(() => { crt.dispose(); cleanup() }, 420)
    }
  }
}
