import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { QUALITY } from './quality'
import { Logger } from './logger'
import { currentSection } from './sections'
import { scrollProgress } from '../scroll/scrollProgress'

/**
 * A dependency-free, real-time performance HUD, mounted INSIDE the Canvas so it
 * can read the live renderer stats. Shown when `?stats=1` or `?log=1`.
 *
 * It plots per-frame FPS as a scrolling graph — so a transient stall (e.g. a
 * frame drop as one project transitions to the next) is visible as a dip in the
 * trace, which a once-per-second number can never show. It names the section the
 * scroll is in (including project→project transitions), tracks the worst frame
 * and the 1% low, and — with `?log=1` — records one row per frame and offers a
 * CSV download of the whole top-to-bottom scroll.
 *
 * The meter never re-renders React (everything is drawn to its own canvas), so
 * its own cost is a couple hundred cheap 2D ops per frame and it does not
 * meaningfully perturb what it measures.
 */

const GRAPH_W = 260 // samples shown = pixels wide
const GRAPH_H = 66
const PAD = 8
const TEXT_H = 108
const FPS_CEIL = 120 // top of the graph

export function StatsProbe() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const ctx = useRef<CanvasRenderingContext2D | null>(null)

  /* A handle on the live scene from the console, so "what is actually being
     drawn" is a question that can be answered by looking instead of guessing.
     Only under ?stats=1, alongside the HUD. */
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__rd = { gl, scene, camera }
    return () => { delete (window as unknown as Record<string, unknown>).__rd }
  }, [gl, scene, camera])

  const samples = useRef<Float32Array>(new Float32Array(GRAPH_W))
  const head = useRef(0)
  const filled = useRef(0)
  const last = useRef(performance.now())

  const statText = useRef('')
  const statSince = useRef(performance.now())
  const worstEver = useRef(Infinity)
  const sectionNow = useRef('')
  const recEl = useRef<HTMLDivElement | null>(null)

  // --- HUD canvas ----------------------------------------------------------
  useEffect(() => {
    const el = document.createElement('canvas')
    const cssW = GRAPH_W + PAD * 2
    const cssH = TEXT_H + GRAPH_H + PAD * 2
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = cssW * dpr
    el.height = cssH * dpr
    el.style.cssText = [
      'position:fixed',
      'top:10px',
      'left:10px',
      'z-index:99999',
      `width:${cssW}px`,
      `height:${cssH}px`,
      'background:rgba(0,0,0,0.8)',
      'border:1px solid rgba(201,162,75,0.45)',
      'border-radius:5px',
      'pointer-events:none',
    ].join(';')
    document.body.appendChild(el)
    const c = el.getContext('2d')!
    c.scale(dpr, dpr)
    c.font = '11px ui-monospace,Menlo,monospace'
    c.textBaseline = 'top'
    ctx.current = c
    return () => {
      el.remove()
      ctx.current = null
    }
  }, [])

  // --- Logging controls (only with ?log=1) ---------------------------------
  useEffect(() => {
    if (!Logger.enabled) return

    const bar = document.createElement('div')
    bar.style.cssText = [
      'position:fixed',
      'bottom:14px',
      'left:14px',
      'z-index:99999',
      'display:flex',
      'gap:8px',
      'align-items:center',
      'font:12px ui-monospace,Menlo,monospace',
      'color:#e9c76b',
    ].join(';')

    const rec = document.createElement('div')
    rec.style.cssText =
      'padding:6px 10px;background:rgba(0,0,0,0.8);border:1px solid rgba(201,162,75,0.45);border-radius:4px'
    recEl.current = rec

    const mkBtn = (label: string, onClick: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = [
        'padding:6px 12px',
        'background:#c9a24b',
        'color:#0b0c0e',
        'border:0',
        'border-radius:4px',
        'font:600 12px ui-monospace,Menlo,monospace',
        'cursor:pointer',
      ].join(';')
      b.onclick = onClick
      return b
    }

    const downloadBtn = mkBtn('⤓ Download CSV (L)', () => Logger.download())
    const resetBtn = mkBtn('Reset (R)', () => {
      Logger.reset()
      worstEver.current = Infinity
    })

    bar.append(rec, downloadBtn, resetBtn)
    document.body.appendChild(bar)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'l' || e.key === 'L') Logger.download()
      if (e.key === 'r' || e.key === 'R') {
        Logger.reset()
        worstEver.current = Infinity
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      bar.remove()
      recEl.current = null
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useFrame(() => {
    const c = ctx.current
    if (!c) return

    const now = performance.now()
    const dt = now - last.current
    last.current = now
    const fps = dt > 0 ? 1000 / dt : 0

    samples.current[head.current] = fps
    head.current = (head.current + 1) % GRAPH_W
    if (filled.current < GRAPH_W) filled.current += 1
    if (fps < worstEver.current && fps > 0) worstEver.current = fps

    const scroll = scrollProgress()
    sectionNow.current = currentSection(scroll)
    const info = gl.info

    // Record every frame when logging.
    Logger.record({
      fps,
      ms: dt,
      scroll,
      section: sectionNow.current,
      calls: info.render.calls,
      tris: info.render.triangles,
      dpr: gl.getPixelRatio(),
    })

    // --- text stats, ~5x/sec -------------------------------------------------
    if (now - statSince.current >= 200) {
      statSince.current = now
      const n = filled.current
      const arr = samples.current
      let sum = 0
      let min = Infinity
      const win: number[] = []
      for (let i = 0; i < n; i++) {
        const v = arr[i]
        sum += v
        if (v < min) min = v
        win.push(v)
      }
      win.sort((a, b) => a - b)
      const onePct = win.length ? win[Math.floor(win.length * 0.01)] : 0
      const avg = n ? sum / n : 0
      statText.current =
        `fps ${fps.toFixed(0).padStart(3)}   avg ${avg.toFixed(0)}   min ${min.toFixed(0)}   1% ${onePct.toFixed(0)}\n` +
        `ms  ${dt.toFixed(1)}   worst ${worstEver.current.toFixed(0)}fps   ${gl.getPixelRatio().toFixed(2)}dpr\n` +
        `calls ${info.render.calls}   tris ${(info.render.triangles / 1000).toFixed(0)}k   tier ${QUALITY.tier}·${QUALITY.source}\n` +
        `gpu ${QUALITY.detected.slice(0, 40)}\n` +
        `s ${scroll.toFixed(3)}  ${sectionNow.current}`

      if (recEl.current) {
        recEl.current.textContent = `● REC  ${Logger.count} frames  ·  ${sectionNow.current}`
      }
    }

    // --- draw ---------------------------------------------------------------
    const totalW = GRAPH_W + PAD * 2
    const totalH = TEXT_H + GRAPH_H + PAD * 2
    c.clearRect(0, 0, totalW, totalH)

    const lines = statText.current.split('\n')
    for (let i = 0; i < lines.length; i++) {
      c.fillStyle =
        i === 0 ? '#e9c76b' : i === 4 ? '#7fb3ff' : i === 3 ? '#c8b6ff' : '#9aa0a6'
      c.fillText(lines[i], PAD, PAD + i * 15)
    }

    const gx = PAD
    const gy = TEXT_H + PAD
    c.fillStyle = 'rgba(255,255,255,0.03)'
    c.fillRect(gx, gy, GRAPH_W, GRAPH_H)

    for (const [ref, col, label] of [
      [60, 'rgba(76,175,125,0.55)', '60'],
      [30, 'rgba(201,162,75,0.5)', '30'],
    ] as const) {
      const y = gy + GRAPH_H - (ref / FPS_CEIL) * GRAPH_H
      c.strokeStyle = col
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(gx, y + 0.5)
      c.lineTo(gx + GRAPH_W, y + 0.5)
      c.stroke()
      c.fillStyle = col
      c.fillText(label, gx + GRAPH_W - 15, y - 12)
    }

    const n = filled.current
    for (let i = 0; i < n; i++) {
      const idx = (head.current - n + i + GRAPH_W * 2) % GRAPH_W
      const v = samples.current[idx]
      const h = Math.max(1, Math.min(1, v / FPS_CEIL) * GRAPH_H)
      c.fillStyle = v >= 55 ? '#4caf7d' : v >= 30 ? '#c9a24b' : '#c65b5b'
      c.fillRect(gx + i, gy + GRAPH_H - h, 1, h)
    }
  })

  return null
}
