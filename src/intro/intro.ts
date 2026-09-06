import './intro.css'
import { createCrtScene, type CrtHandle, type ScreenLine } from './crtScene'




/** Copy shown on the tube while it hunts for the channel. No glitch beats and
    no "SYSTEM ONLINE" — the tube just searches, then locks on. */
const HUNT: ScreenLine[][] = [
  [{ t: 'FINDING CHANNEL', s: 34, c: '#9dc0ff', gap: 0 }],
  [{ t: 'FINDING CHANNEL .', s: 34, c: '#bcd4ff', gap: 0 }],
  [{ t: 'FINDING CHANNEL . .', s: 34, c: '#dbe8ff', gap: 0 }],
  [{ t: 'CHANNEL LOCKED', s: 36, c: '#ffffff', b: true, gap: 0 }],
]


const MENU = [
  { id: 'enter', label: 'Enter System' },
  { id: 'resume', label: 'Résumé' },
  { id: 'contact', label: 'Contact' },
]

/**
 * The cinematic CRT title screen. Vanilla Three.js CRT (right) + HTML/CSS room
 * and menu (left). ENTER cuts to the tube's own picture full screen, hunts for
 * a channel, locks onto the hero's mark, then hands off to the real portfolio.
 */
export function startIntro (opts: { onEnter: (target: string) => void; prefetch?: () => void }) {
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

    /* 1. Cut to the tube's picture, full screen.

       There is no camera move here on purpose. Flying a camera at the set meant
       the tube rotated, sheared and changed size on the way in, and every one of
       those was something that could look wrong — and did. Switching to the
       projection is what a television actually does: the picture is simply what
       you are looking at now. No geometry, so nothing to distort.

       The element still has to take the viewport (it normally lives in a 31%
       box on the plate). Reparenting keeps the WebGL context — only recreating
       the canvas would lose it. */
    const set = root.querySelector('.intro-set') as HTMLElement
    root.appendChild(set)
    root.classList.add('flying')

    /* Start pulling the site down now. It is only the fetch and parse — nothing
       mounts yet — so the heavy work is done by the time the transmission ends
       and the reveal can show a page that is actually ready. The tube's model
       is the hero's own file, so this warms it for the page too. */
    opts.prefetch?.()
    void crt.loadContent()

    // the snap itself: a channel-change flash, then the picture is the screen
    crt.setEnter(0.55)
    root.classList.add('switching')
    window.setTimeout(() => {
      crt.setProjection(true)
      crt.setEnter(0.3)
      root.classList.remove('switching')
      transmission()
    }, 160)

    /* 3. The tube hunts for a channel, then locks onto the model: the snow
       peaks, the copy dies, and the RD letter simply arrives in the middle of
       the picture with the interference still boiling behind it. */
    let started = false
    function transmission () {
      if (started) return
      started = true
      let i = 0
      const hunt = () => {
        // interference climbs with every failed attempt, but stops short of
        // the point where the copy stops being readable
        crt.setEnter(0.3 + i * 0.09)
        crt.setChaos(0.22 + i * 0.16)
        crt.setScreenText(HUNT[i])
        i += 1
        if (i < HUNT.length) { window.setTimeout(hunt, 420); return }
        window.setTimeout(lock, 420)
      }
      hunt()
    }

    /** The lock-on: chaos snaps off, the model fades up on the glass. */
    function lock () {
      crt.setScreenText([])
      const t1 = performance.now()
      const DUR = 620
      const fade = () => {
        const p = Math.min(1, (performance.now() - t1) / DUR)
        crt.setContentMix(p)
        // the interference dies away completely — the mark has to be clean,
        // because it is the same object the page is about to show
        crt.setEnter(0.9 * (1 - p))
        crt.setChaos(1.0 - p)
        if (p < 1) requestAnimationFrame(fade)
      }
      requestAnimationFrame(fade)
      window.setTimeout(handoff, DUR + 900)
    }

    /* 4. The hand-off. The site mounts behind the still-lit tube, then the tube
       switches off the way a CRT actually does — the picture collapses to a
       bright horizontal line, the line snaps to a point — and the hero is simply
       already there behind it. Much better than fading through black, and it
       ends the intro on the same piece of hardware it started on. */
    /* 4. The sign-off. The site mounts behind the still-lit tube, then the whole
       picture is swallowed by one spherical swell — the frame balloons, a ring
       stretches out through it, the channels smear apart at the edges — and the
       zoom drives through into the hero, which is already sitting there. */
    function handoff () {
      opts.onEnter(target)
      const t2 = performance.now()
      const DUR = 1500 // long enough that the bubble visibly settles, not just pops
      const swell = () => {
        const p = Math.min(1, (performance.now() - t2) / DUR)
        crt.setWarp(p)
        if (p < 1) { requestAnimationFrame(swell); return }
        root.classList.add('signing-off')
        window.setTimeout(() => {
          crt.dispose()
          window.setTimeout(cleanup, 480)
        }, 460)
      }
      requestAnimationFrame(swell)
      // timers survive a hidden tab where rAF does not
      window.setTimeout(() => {
        if (!root.classList.contains('signing-off')) {
          crt.setWarp(1)
          root.classList.add('signing-off')
          window.setTimeout(() => { crt.dispose(); window.setTimeout(cleanup, 480) }, 460)
        }
      }, DUR + 400)
    }
  }
}
