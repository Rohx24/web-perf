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
  background: rgba(10,8,16,.92); border: 1px solid rgba(160,140,220,.35);
  border-radius: 8px; color: #dfe3f4;
  font: 500 11px/1.5 ui-monospace, monospace; letter-spacing: .04em;
  box-shadow: 0 12px 40px rgba(0,0,0,.6); user-select: none;
}
.tune h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .18em; color: #ff8ec9; text-transform: uppercase; }
.tune .row { display: grid; grid-template-columns: 62px 1fr 46px; gap: 7px; align-items: center; margin-bottom: 5px; }
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

  const ctls: Ctl[] = [
    { key: 'left', label: 'X pos', min: 0, max: 90, step: 0.5, value: readVar('--crt-left', 46.5), cssVar: '--crt-left', unit: '%' },
    { key: 'top', label: 'Y pos', min: 0, max: 90, step: 0.5, value: readVar('--crt-top', 40), cssVar: '--crt-top', unit: '%' },
    { key: 'w', label: 'Width', min: 8, max: 80, step: 0.5, value: readVar('--crt-w', 35), cssVar: '--crt-w', unit: '%' },
    { key: 'h', label: 'Height', min: 8, max: 95, step: 0.5, value: readVar('--crt-h', 50), cssVar: '--crt-h', unit: '%' },
    { key: 'yaw', label: 'Rotate', min: -45, max: 45, step: 0.5, value: deg(crt.getYaw()), unit: '°', apply: (v) => crt.setYaw((v * Math.PI) / 180) },
    { key: 'pitch', label: 'Tilt', min: -25, max: 25, step: 0.5, value: deg(crt.getPitch()), unit: '°', apply: (v) => crt.setPitch((v * Math.PI) / 180) },
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
      `--desk-top: ${by('deskTop')}%;\n` +
      `--desk-h: ${by('deskH')}%;\n\n` +
      `/* src/intro/crtScene.ts */\n` +
      `YAW   = ${((by('yaw') * Math.PI) / 180).toFixed(3)}  // ${by('yaw')}°\n` +
      `PITCH = ${((by('pitch') * Math.PI) / 180).toFixed(3)}  // ${by('pitch')}°`
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
