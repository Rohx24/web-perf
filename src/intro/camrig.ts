import type { CamState, CamKey, CrtHandle } from './crtScene'

/**
 * Camera keyframe editor — `?cam=1` only, dynamically imported so it never
 * reaches the shipped bundle.
 *
 * Pose the camera with the sliders, ADD a key, repeat. PLAY flies the path so
 * you can judge the timing, and EXPORT hands back the array to bake into the
 * ENTER flight.
 *
 * The canvas is switched to full-frame while this is open (via .cam-mode),
 * because the set normally lives in a 31%-wide box on the plate and you cannot
 * judge a push-in through a letterbox.
 */

const CSS = `
.camrig {
  position: fixed; top: 12px; right: 12px; z-index: 9999;
  width: 296px; padding: 12px 14px 10px;
  max-height: 94vh; overflow-y: auto; overscroll-behavior: contain;
  background: rgba(10,8,16,.94); border: 1px solid rgba(160,140,220,.35);
  border-radius: 8px; color: #dfe3f4;
  font: 500 11px/1.5 ui-monospace, monospace; letter-spacing: .04em;
  box-shadow: 0 12px 40px rgba(0,0,0,.6); user-select: none;
}
.camrig h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .18em; color: #7ee0ff; text-transform: uppercase; }
.camrig h5 { margin: 10px 0 5px; font-size: 10px; letter-spacing: .16em; color: #9aa2c0; text-transform: uppercase; }
.camrig .row { display: grid; grid-template-columns: 44px 1fr 52px; gap: 6px; align-items: center; margin-bottom: 3px; }
.camrig label { color: #9aa2c0; font-size: 10px; }
.camrig input[type=range] { width: 100%; height: 3px; accent-color: #38d6ff; cursor: pointer; }
.camrig .val { text-align: right; font-size: 10px; color: #cfd6ee; }
.camrig .btns { display: flex; gap: 5px; margin-top: 9px; flex-wrap: wrap; }
.camrig button {
  flex: 1 0 60px; padding: 6px 0; cursor: pointer; border-radius: 4px;
  background: #21304a; color: #e7e9f7; border: 1px solid rgba(120,180,220,.4);
  font: 600 10px/1 ui-monospace, monospace; letter-spacing: .08em;
}
.camrig button:hover { background: #2c4260; }
.camrig button.pri { background: #1d5170; border-color: #49b6e0; }
.camrig .keys { margin-top: 8px; }
.camrig .key {
  display: grid; grid-template-columns: 18px 1fr 26px 22px; gap: 5px;
  align-items: center; margin-bottom: 3px; font-size: 10px;
}
.camrig .key input {
  width: 100%; background: #05040a; color: #8fe3b0; border: 1px solid #2a2140;
  border-radius: 3px; padding: 3px 4px; font: 500 10px ui-monospace, monospace;
}
.camrig .key b { color: #7ee0ff; font-weight: 600; }
.camrig .key button { flex: none; padding: 3px 0; font-size: 9px; }
.camrig pre {
  margin: 8px 0 0; padding: 8px; max-height: 150px; overflow: auto;
  background: #05040a; border-radius: 4px; color: #8fe3b0;
  font: 500 10px/1.45 ui-monospace, monospace; white-space: pre; letter-spacing: 0;
}
.camrig .hint { color: #6f7695; font-size: 9px; line-height: 1.45; margin-top: 6px; }
`

interface Slider {
  key: keyof CamState
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: Slider[] = [
  { key: 'px', label: 'Cam X', min: -6, max: 6, step: 0.01 },
  { key: 'py', label: 'Cam Y', min: -4, max: 4, step: 0.01 },
  { key: 'pz', label: 'Cam Z', min: -4, max: 10, step: 0.01 },
  { key: 'tx', label: 'Aim X', min: -4, max: 4, step: 0.01 },
  { key: 'ty', label: 'Aim Y', min: -3, max: 3, step: 0.01 },
  { key: 'tz', label: 'Aim Z', min: -4, max: 4, step: 0.01 },
  { key: 'fov', label: 'Lens', min: 8, max: 90, step: 1 },
]

export function mountCamRig (opts: { root: HTMLElement; crt: CrtHandle; initial?: CamKey[] }) {
  const { root, crt } = opts
  root.classList.add('cam-mode')

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  // Load the flight that is currently baked in, so this is a refining pass
  // rather than a blank page. Falls back to wherever the automatic framing has
  // the camera if there is no path yet.
  const keys: CamKey[] = (opts.initial ?? []).map((k) => ({ t: k.t, cam: { ...k.cam } }))
  const cam: CamState = keys.length ? { ...keys[0].cam } : crt.getCam()

  const panel = document.createElement('div')
  panel.className = 'camrig'
  panel.innerHTML = '<h4>Camera keyframes</h4>'

  const out = document.createElement('pre')
  const keyList = document.createElement('div')
  keyList.className = 'keys'

  const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

  const renderOut = () => {
    out.textContent =
      keys.length === 0
        ? '// no keyframes yet — pose, then ADD'
        : 'const ENTER_PATH: CamKey[] = [\n' +
          keys
            .map(
              (k) =>
                `  { t: ${k.t}, cam: { px: ${fmt(k.cam.px)}, py: ${fmt(k.cam.py)}, pz: ${fmt(k.cam.pz)},` +
                ` tx: ${fmt(k.cam.tx)}, ty: ${fmt(k.cam.ty)}, tz: ${fmt(k.cam.tz)}, fov: ${fmt(k.cam.fov)} } },`,
            )
            .join('\n') +
          '\n]'
  }

  const renderKeys = () => {
    keyList.innerHTML = ''
    keys.forEach((k, i) => {
      const row = document.createElement('div')
      row.className = 'key'
      const idx = document.createElement('b')
      idx.textContent = String(i)
      const time = document.createElement('input')
      time.value = String(k.t)
      time.title = 'time in ms from the start of the flight'
      time.addEventListener('change', () => {
        const v = Number(time.value)
        if (Number.isFinite(v)) { k.t = Math.max(0, Math.round(v)); keys.sort((a, b) => a.t - b.t); renderKeys(); renderOut() }
      })
      const go = document.createElement('button')
      go.textContent = 'GO'
      go.title = 'jump the camera to this key'
      go.addEventListener('click', () => { Object.assign(cam, k.cam); crt.setCam(cam); syncSliders() })
      const del = document.createElement('button')
      del.textContent = '×'
      del.addEventListener('click', () => { keys.splice(i, 1); renderKeys(); renderOut() })
      row.append(idx, time, go, del)
      keyList.appendChild(row)
    })
    renderOut()
  }

  const inputs = new Map<keyof CamState, { range: HTMLInputElement; val: HTMLElement }>()
  const syncSliders = () => {
    for (const s of SLIDERS) {
      const io = inputs.get(s.key)!
      io.range.value = String(cam[s.key])
      io.val.textContent = fmt(cam[s.key])
    }
  }

  for (const s of SLIDERS) {
    const row = document.createElement('div')
    row.className = 'row'
    const label = document.createElement('label')
    label.textContent = s.label
    const range = document.createElement('input')
    range.type = 'range'
    range.min = String(s.min)
    range.max = String(s.max)
    range.step = String(s.step)
    range.value = String(cam[s.key])
    const val = document.createElement('span')
    val.className = 'val'
    val.textContent = fmt(cam[s.key])
    range.addEventListener('input', () => {
      cam[s.key] = Number(range.value)
      val.textContent = fmt(cam[s.key])
      crt.setCam(cam)
    })
    row.append(label, range, val)
    panel.appendChild(row)
    inputs.set(s.key, { range, val })
  }

  const btns = document.createElement('div')
  btns.className = 'btns'

  const add = document.createElement('button')
  add.className = 'pri'
  add.textContent = '+ ADD KEY'
  add.addEventListener('click', () => {
    // default spacing: 900ms after the last key, 0 for the first
    const t = keys.length === 0 ? 0 : keys[keys.length - 1].t + 900
    keys.push({ t, cam: { ...cam } })
    renderKeys()
  })

  const play = document.createElement('button')
  play.textContent = 'PLAY'
  play.addEventListener('click', () => {
    if (keys.length < 2) return
    crt.playPath(keys, () => { syncSliders() })
  })

  const stop = document.createElement('button')
  stop.textContent = 'STOP'
  stop.addEventListener('click', () => crt.stopPath())

  const copy = document.createElement('button')
  copy.textContent = 'COPY'
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(out.textContent ?? '').then(
      () => { copy.textContent = 'COPIED'; setTimeout(() => (copy.textContent = 'COPY'), 1200) },
      () => { copy.textContent = 'SELECT ↓' },
    )
  })

  const clear = document.createElement('button')
  clear.textContent = 'CLEAR'
  clear.addEventListener('click', () => { keys.length = 0; renderKeys() })

  btns.append(add, play, stop, copy, clear)

  const hint = document.createElement('div')
  hint.className = 'hint'
  hint.textContent =
    'Pose with the sliders → ADD KEY. Times are ms and editable; GO jumps to a key. ' +
    'Key 0 should be the title-screen pose. Aim = the point the camera looks at.'

  panel.append(btns, keyList, out, hint)
  root.appendChild(panel)

  renderKeys()
  crt.setCam(cam)
}
