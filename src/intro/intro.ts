import './intro.css'
import { createCrtScene, type CamKey, type CrtHandle, type ScreenLine } from './crtScene'

/**
 * The ENTER flight. Placeholder path until the keyframes come back from the
 * ?cam=1 editor: hold on the title framing, then push in and settle square on
 * the glass so the tube fills the frame for the transmission.
 * Key 0 is filled in at run time from wherever the automatic framing has the
 * camera, so the flight always starts from exactly what the visitor is
 * looking at rather than a hard-coded guess.
 */
const ENTER_PATH: CamKey[] = [
  // key 0 must match the title framing on a full-frame canvas, or the flight
  // starts with a jump. Solved for the current --crt-* values at 16:9.
  { t: 0, cam: { px: -0.51, py: 0.29, pz: 3.45, tx: -0.51, ty: 0.29, tz: 0, fov: 30 } },
  { t: 750, cam: { px: -0.3, py: 0.2, pz: 2.6, tx: -0.14, ty: 0.09, tz: 0, fov: 31 } },
  { t: 1750, cam: { px: 0, py: 0.04, pz: 1.15, tx: 0, ty: 0, tz: 0, fov: 34 } },
  { t: 2450, cam: { px: 0, py: 0, pz: 0.62, tx: 0, ty: 0, tz: 0, fov: 38 } },
]

/** Copy shown on the tube during the transmission sequence. */
const SIGNAL: ScreenLine[][] = [
  [{ t: 'SIGNAL LOST.', s: 40, c: '#eaf1ff', b: true, gap: 0 }],
  [
    { t: 'SIGNAL LOST.', s: 34, c: '#9dc0ff', gap: 44 },
    { t: 'RECONNECTING…', s: 40, c: '#eaf1ff', b: true, gap: 0 },
  ],
  [
    { t: 'ROHIT DIGGI', s: 44, c: '#ffffff', b: true, gap: 40 },
    { t: 'SYSTEM ONLINE.', s: 34, c: '#9dc0ff', gap: 0 },
  ],
]

const MENU = [
  { id: 'enter', label: 'Enter System' },
  { id: 'resume', label: 'Résumé' },
  { id: 'contact', label: 'Contact' },
]

/**
 * The cinematic CRT title screen. Vanilla Three.js CRT (right) + HTML/CSS room
 * and menu (left). On ENTER it plays the signal-breakup → "SYSTEM ONLINE"
 * transition, then calls `onEnter` (which lazily mounts the real portfolio).
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
    <div class="intro-corner br">RUNNING ON<br>TOO MUCH CHAI</div>
    <div class="intro-left">
      <div class="intro-title"><span class="r">Rohit</span><span class="d" data-t="DIGGI">DIGGI</span></div>
      <div class="intro-menu"></div>
    </div>
    <div class="intro-scan"></div>
    <div class="intro-fade"><div class="intro-signal"></div></div>
  `
  document.body.appendChild(root)

  // --- menu ---
  const menuEl = root.querySelector('.intro-menu') as HTMLElement
  let sel = 0
  const buttons = MENU.map((m, i) => {
    const b = document.createElement('button')
    b.innerHTML = `<span class="car">▶</span><span class="lbl">${m.label}</span>`
    b.addEventListener('click', () => { sel = i; paint(); activate() })
    b.addEventListener('mouseenter', () => { sel = i; paint() })
    menuEl.appendChild(b)
    return b
  })
  const paint = () => buttons.forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)))
  paint()

  // --- 3D CRT ---
  const crt: CrtHandle = createCrtScene(root.querySelector('.intro-crt') as HTMLElement)
  // Fade the set in only once the tube is actually on, so it never pops.
  crt.onReady(() => root.classList.add('crt-ready'))

  const params = new URLSearchParams(window.location.search)
  // The room plate has a real desk in it now, so the CSS one stays off unless
  // explicitly asked for (?desk=1) — kept around in case the plate changes.
  if (params.get('desk') !== '1') root.classList.add('no-desk')
  // ?look=warm|cool|matte swaps the colour grade; default is the baked one.
  const look = params.get('look')
  if (look && /^[a-z]+$/.test(look)) root.classList.add(`look-${look}`)

  // ?cam=1 opens the camera keyframe editor (dev only, lazily loaded).
  if (params.get('cam') === '1') {
    crt.onReady(() =>
      import('./camrig').then((m) => m.mountCamRig({ root, crt, initial: ENTER_PATH })),
    )
  }

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
    window.removeEventListener('keydown', onKey)
    crt.dispose()
    root.remove()
  }

  function activate () {
    const id = MENU[sel].id
    if (id === 'resume') { window.open('/works.html', '_blank'); return } // placeholder target
    runEnter(id)
  }

  function runEnter (target: string) {
    if (entering) return
    entering = true
    const fade = root.querySelector('.intro-fade') as HTMLElement

    /* 1. Go full-frame. The set normally lives in a 31%-wide box on the plate,
       and you cannot fly a camera through a letterbox. Reparenting the element
       keeps its WebGL context intact — only recreating the canvas would lose
       it. The camera is pinned to key 0 BEFORE the box changes size, so the
       ResizeObserver's refit can't snap the framing back on the way through. */
    const set = root.querySelector('.intro-set') as HTMLElement
    crt.setCam(ENTER_PATH[0].cam)
    root.appendChild(set)
    root.classList.add('flying')

    // 2. Fly, swelling the static as we close on the glass.
    const FLIGHT = ENTER_PATH[ENTER_PATH.length - 1].t
    const t0 = performance.now()
    const ramp = () => {
      const p = Math.min(1, (performance.now() - t0) / FLIGHT)
      crt.setEnter(p * 0.45) // enough to feel the signal go, still legible
      if (p < 1) requestAnimationFrame(ramp)
    }
    requestAnimationFrame(ramp)
    crt.playPath(ENTER_PATH, transmission)

    /* rAF — and therefore the flight — is suspended entirely while the tab is
       hidden. Timers still fire, so this guarantees the handoff completes for
       a visitor who switches away mid-transition instead of stranding them on
       a frozen title screen. */
    const watchdog = window.setTimeout(transmission, FLIGHT + 600)

    // 3. The transmission, played on the tube itself now that it fills the frame.
    let started = false
    function transmission () {
      if (started) return
      started = true
      window.clearTimeout(watchdog)
      crt.stopPath()
      let i = 0
      const step = () => {
        crt.setEnter(i === 0 ? 0.95 : 0.5) // burst of snow, then it settles
        crt.setScreenText(SIGNAL[i])
        i += 1
        window.setTimeout(i < SIGNAL.length ? step : handoff, 900)
      }
      step()
    }

    function handoff () {
      fade.classList.add('on')
      window.setTimeout(() => {
        opts.onEnter(target)
        // Kill the CRT while the black still covers everything, so its canvas
        // can never bleed over the portfolio during the reveal.
        crt.dispose()
        window.setTimeout(() => {
          root.style.transition = 'opacity 0.9s ease'
          root.style.opacity = '0'
          window.setTimeout(cleanup, 950)
        }, 900)
      }, 620)
    }
  }
}
