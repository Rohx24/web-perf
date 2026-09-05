import './intro.css'
import { createCrtScene, type CrtHandle } from './crtScene'

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
    <div class="intro-corner tl">RD · 2026<br>BENGALURU, IN</div>
    <div class="intro-corner tr">CH 06<br>SIGNAL: <span class="hi">FOUND</span><br>USER: ROHIT<br>STATUS: BUILDING</div>
    <div class="intro-corner bl">SAME BRAIN<br>DIFFERENT DAY</div>
    <div class="intro-corner br">RUNNING ON<br>TOO MUCH COFFEE</div>
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

  // Dev-only framing panel. Dynamically imported so it never reaches the
  // production bundle unless someone actually asks for ?tune=1.
  const params = new URLSearchParams(window.location.search)
  // The room plate has a real desk in it now, so the CSS one stays off unless
  // explicitly asked for (?desk=1) — kept around in case the plate changes.
  if (params.get('desk') !== '1') root.classList.add('no-desk')
  if (params.get('tune') === '1') {
    import('./tune').then((m) =>
      m.mountTuner({
        root,
        stage: root.querySelector('.intro-stage') as HTMLElement,
        crt,
      }),
    )
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
    const signal = root.querySelector('.intro-signal') as HTMLElement

    // 1–4: ramp the CRT signal breakup (static + brightness surge).
    const t0 = performance.now()
    const DUR = 1200
    let broke = false
    const ramp = () => {
      const p = Math.min(1, (performance.now() - t0) / DUR)
      crt.setEnter(p)
      if (p > 0.5) root.classList.add('glitching')
      if (p < 1) requestAnimationFrame(ramp)
      else afterBreakup()
    }
    requestAnimationFrame(ramp)
    // rAF is suspended entirely while the tab is hidden. Without this, a
    // visitor who switches away mid-transition comes back to a frozen title
    // screen that never hands off to the site. Timers still fire (throttled),
    // so this guarantees the handoff completes either way.
    window.setTimeout(() => { crt.setEnter(1); afterBreakup() }, DUR + 400)

    function afterBreakup () {
      if (broke) return
      broke = true
      // 5–7: whiteout of static → fade to black.
      fade.classList.add('on')
      window.setTimeout(() => {
        root.classList.remove('glitching')
        const steps = ['SIGNAL LOST.', 'SIGNAL LOST.\n\nRECONNECTING…', 'ROHIT DIGGI\n\nSYSTEM ONLINE.']
        let i = 0
        signal.textContent = steps[0]
        const seq = window.setInterval(() => {
          i += 1
          if (i < steps.length) { signal.textContent = steps[i]; return }
          window.clearInterval(seq)
          // Hand off to the real site (lazily mounted).
          opts.onEnter(target)
          // Kill the CRT NOW, while the black "SYSTEM ONLINE" screen still covers
          // everything — so the CRT canvas can never bleed over the portfolio
          // during the reveal fade. Then fade the black away to show the site.
          crt.dispose()
          window.setTimeout(() => {
            root.style.transition = 'opacity 0.9s ease'
            root.style.opacity = '0'
            window.setTimeout(cleanup, 950)
          }, 1200)
        }, 780)
      }, 520)
    }
  }
}
