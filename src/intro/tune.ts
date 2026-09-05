import type { CrtHandle } from './crtScene'

/**
 * Temporary framing panel — `?tune=1` only, dynamically imported so it never
 * lands in the shipped bundle. Drag the sliders until the set sits where you
 * want it, then hit Copy and paste the block into intro.css / crtScene.ts.
 */

interface Ctl {
  key: string
  label: string
  min: number
  max: number
  step: number
  value: number
  /** css custom property this drives, if any */
  cssVar?: string
  unit?: string
  apply?: (v: number) => void
}

const CSS = `
.tune {
  position: fixed; top: 12px; right: 12px; z-index: 9999;
  width: 268px; padding: 12px 14px 10px;
  max-height: 94vh; overflow-y: auto; overscroll-behavior: contain;
  background: rgba(10,8,16,.92); border: 1px solid rgba(160,140,220,.35);
  border-radius: 8px; color: #dfe3f4;
  font: 500 11px/1.5 ui-monospace, monospace; letter-spacing: .04em;
  box-shadow: 0 12px 40px rgba(0,0,0,.6); user-select: none;
}
.tune h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .18em; color: #ff8ec9; text-transform: uppercase; }
.tune .row { display: grid; grid-template-columns: 56px 1fr 48px; gap: 6px; align-items: center; margin-bottom: 3px; }
.tune label { color: #9aa2c0; font-size: 10px; }
.tune input[type=range] { width: 100%; height: 3px; accent-color: #ff5cb0; cursor: pointer; }
.tune .val { text-align: right; font-size: 10px; color: #cfd6ee; }
.tune .btns { display: flex; gap: 6px; margin-top: 9px; }
.tune button {
  flex: 1; padding: 6px 0; cursor: pointer; border-radius: 4px;
  background: #2a2140; color: #e7e9f7; border: 1px solid rgba(160,140,220,.4);
  font: 600 10px/1 ui-monospace, monospace; letter-spacing: .1em;
}
.tune button:hover { background: #382b56; }
.tune pre {
  margin: 8px 0 0; padding: 8px; max-height: 168px; overflow: auto;
  background: #05040a; border-radius: 4px; color: #8fe3b0;
  font: 500 10px/1.5 ui-monospace, monospace; white-space: pre; letter-spacing: 0;
}
.tune.min .row, .tune.min .btns, .tune.min pre { display: none; }
`

/** radians → degrees, snapped to the slider's step so the readout stays clean */
const deg = (rad: number) => Math.round(((rad * 180) / Math.PI) * 2) / 2

export function mountTuner (opts: { root: HTMLElement; stage: HTMLElement; crt: CrtHandle }) {
  const { root, stage, crt } = opts

  const readVar = (name: string, fallback: number) => {
    const raw = getComputedStyle(stage).getPropertyValue(name).trim()
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
  }

  const r2 = (n: number) => Math.round(n * 100) / 100

  const ctls: Ctl[] = [
    // --- box on the plate ---
    { key: 'left', label: 'X pos', min: 0, max: 90, step: 0.5, value: readVar('--crt-left', 45), cssVar: '--crt-left', unit: '%' },
    { key: 'top', label: 'Y pos', min: -10, max: 90, step: 0.5, value: readVar('--crt-top', 22.5), cssVar: '--crt-top', unit: '%' },
    { key: 'w', label: 'Box W', min: 8, max: 90, step: 0.5, value: readVar('--crt-w', 36), cssVar: '--crt-w', unit: '%' },
    { key: 'h', label: 'Box H', min: 8, max: 100, step: 0.5, value: readVar('--crt-h', 62), cssVar: '--crt-h', unit: '%' },
    // --- the set within that box ---
    { key: 'fill', label: 'Size', min: 0.3, max: 1.6, step: 0.01, value: r2(crt.getFill()), apply: (v) => crt.setFill(v) },
    { key: 'push', label: 'Push', min: 0.4, max: 2.5, step: 0.01, value: r2(crt.getPush()), apply: (v) => crt.setPush(v) },
    { key: 'fov', label: 'Lens', min: 10, max: 60, step: 1, value: Math.round(crt.getFov()), unit: '°', apply: (v) => crt.setFov(v) },
    { key: 'camy', label: 'Cam H', min: -1, max: 1, step: 0.01, value: r2(crt.getCamY()), apply: (v) => crt.setCamY(v) },
    { key: 'yaw', label: 'Rotate', min: -60, max: 60, step: 0.5, value: deg(crt.getYaw()), unit: '°', apply: (v) => crt.setYaw((v * Math.PI) / 180) },
    { key: 'pitch', label: 'Tilt', min: -30, max: 30, step: 0.5, value: deg(crt.getPitch()), unit: '°', apply: (v) => crt.setPitch((v * Math.PI) / 180) },
    // --- notes, each independent ---
    { key: 'n1x', label: 'Note1 X', min: 0, max: 100, step: 0.5, value: readVar('--n1-x', 74), cssVar: '--n1-x', unit: '%' },
    { key: 'n1y', label: 'Note1 Y', min: 0, max: 100, step: 0.5, value: readVar('--n1-y', 18), cssVar: '--n1-y', unit: '%' },
    { key: 'n1r', label: 'Note1 ∠', min: -25, max: 25, step: 0.5, value: readVar('--n1-r', 4.5), cssVar: '--n1-r', unit: 'deg' },
    { key: 'n2x', label: 'Note2 X', min: 0, max: 100, step: 0.5, value: readVar('--n2-x', 82), cssVar: '--n2-x', unit: '%' },
    { key: 'n2y', label: 'Note2 Y', min: 0, max: 100, step: 0.5, value: readVar('--n2-y', 52), cssVar: '--n2-y', unit: '%' },
    { key: 'n2r', label: 'Note2 ∠', min: -25, max: 25, step: 0.5, value: readVar('--n2-r', -5), cssVar: '--n2-r', unit: 'deg' },
    // --- css desk (only visible with ?desk=1) ---
    { key: 'deskTop', label: 'Desk Y', min: 30, max: 100, step: 0.5, value: readVar('--desk-top', 72), cssVar: '--desk-top', unit: '%' },
    { key: 'deskH', label: 'Desk H', min: 5, max: 70, step: 0.5, value: readVar('--desk-h', 34), cssVar: '--desk-h', unit: '%' },
  ]

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const panel = document.createElement('div')
  panel.className = 'tune'
  panel.innerHTML = `<h4>CRT framing</h4>`

  const out = document.createElement('pre')

  const render = () => {
    const by = (k: string) => ctls.find((c) => c.key === k)!.value
    out.textContent =
      `/* src/intro/intro.css  →  .intro-stage */\n` +
      `--crt-left: ${by('left')}%;\n` +
      `--crt-top: ${by('top')}%;\n` +
      `--crt-w: ${by('w')}%;\n` +
      `--crt-h: ${by('h')}%;\n` +
      `--n1-x: ${by('n1x')}%;  --n1-y: ${by('n1y')}%;  --n1-r: ${by('n1r')}deg;\n` +
      `--n2-x: ${by('n2x')}%;  --n2-y: ${by('n2y')}%;  --n2-r: ${by('n2r')}deg;\n` +
      `--desk-top: ${by('deskTop')}%;\n` +
      `--desk-h: ${by('deskH')}%;\n\n` +
      `/* src/intro/crtScene.ts */\n` +
      `YAW    = ${((by('yaw') * Math.PI) / 180).toFixed(3)}   // ${by('yaw')}°\n` +
      `PITCH  = ${((by('pitch') * Math.PI) / 180).toFixed(3)}   // ${by('pitch')}°\n` +
      `MARGIN = ${(1 / by('fill')).toFixed(3)}   // Size ${by('fill')}\n` +
      `PUSH   = ${by('push')}\n` +
      `FOV    = ${by('fov')}\n` +
      `CAM_Y  = ${by('camy')}`
  }

  const applyAll = () => {
    for (const c of ctls) {
      if (c.cssVar) stage.style.setProperty(c.cssVar, `${c.value}${c.unit ?? ''}`)
      c.apply?.(c.value)
    }
    render()
  }

  for (const c of ctls) {
    const row = document.createElement('div')
    row.className = 'row'
    const val = document.createElement('span')
    val.className = 'val'
    val.textContent = `${c.value}${c.unit ?? ''}`
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(c.min)
    input.max = String(c.max)
    input.step = String(c.step)
    input.value = String(c.value)
    input.addEventListener('input', () => {
      c.value = Number(input.value)
      val.textContent = `${c.value}${c.unit ?? ''}`
      if (c.cssVar) stage.style.setProperty(c.cssVar, `${c.value}${c.unit ?? ''}`)
      c.apply?.(c.value)
      render()
    })
    const label = document.createElement('label')
    label.textContent = c.label
    row.append(label, input, val)
    panel.appendChild(row)
  }

  const btns = document.createElement('div')
  btns.className = 'btns'
  const copy = document.createElement('button')
  copy.textContent = 'COPY'
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(out.textContent ?? '').then(
      () => { copy.textContent = 'COPIED'; setTimeout(() => (copy.textContent = 'COPY'), 1200) },
      () => { copy.textContent = 'SELECT ↓' },
    )
  })
  const hide = document.createElement('button')
  hide.textContent = 'HIDE'
  hide.addEventListener('click', () => panel.classList.toggle('min'))
  btns.append(copy, hide)
  panel.append(btns, out)

  root.appendChild(panel)
  applyAll()
}
