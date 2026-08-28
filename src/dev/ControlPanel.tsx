import { useEffect, useReducer, useState } from 'react'

import {
  CONTROLS_ENABLED,
  getControls,
  isChoice,
  subscribeToControls,
  type ChoiceControl,
  type Control,
  type RangeControl,
} from './controls'

/**
 * The live control panel.
 *
 * Plain DOM sitting over the canvas, deliberately not part of the R3F tree: a
 * slider has no business causing a scene re-render, and these write straight to
 * the values being drawn.
 *
 * Nothing here is styled to be pretty. It is an instrument, and it reads its
 * values back from the live uniforms every render, so it can never show a
 * number the wall is not actually using.
 */

const PANEL: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: 12,
  zIndex: 10,
  width: 250,
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  padding: '10px 12px 12px',
  borderRadius: 6,
  background: 'rgba(10,11,13,0.82)',
  border: '1px solid rgba(255,255,255,0.12)',
  backdropFilter: 'blur(8px)',
  color: '#d8dce4',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  userSelect: 'none',
}

function Row({ control }: { control: Control }) {
  return isChoice(control) ? (
    <ChoiceRow control={control} />
  ) : (
    <RangeRow control={control} />
  )
}

function ChoiceRow({ control }: { control: ChoiceControl }) {
  const [, bump] = useReducer((n: number) => n + 1, 0)

  return (
    <label style={{ display: 'block', marginTop: 8 }}>
      <span style={{ opacity: 0.75 }}>{control.label}</span>
      <select
        // Same reason as the sliders: a browser restoring its own idea of this
        // control's value on reload would quietly override the config.
        autoComplete="off"
        value={control.get()}
        onChange={(event) => {
          control.set(event.target.value)
          bump()
        }}
        style={{
          width: '100%',
          marginTop: 3,
          padding: '3px 4px',
          borderRadius: 3,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#8FD4FF',
          font: 'inherit',
        }}
      >
        {control.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function RangeRow({ control }: { control: RangeControl }) {
  // Re-render this row only, on its own input.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const value = control.get()

  // Enough decimals to show the step's resolution, and no more.
  const decimals = Math.max(0, Math.ceil(-Math.log10(control.step)))

  return (
    <label style={{ display: 'block', marginTop: 8 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ opacity: 0.75 }}>{control.label}</span>
        <span style={{ color: '#8FD4FF' }}>{value.toFixed(decimals)}</span>
      </span>
      <input
        type="range"
        // Browsers restore form-control values across a reload. Without this an
        // input comes back holding wherever it was last dragged, re-applies that
        // to the uniform, and the wall quietly loads with values the config file
        // does not contain — which looks exactly like the config being ignored.
        autoComplete="off"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => {
          control.set(parseFloat(event.target.value))
          bump()
        }}
        style={{ width: '100%', marginTop: 2, accentColor: '#8FD4FF' }}
      />
    </label>
  )
}

type ControlPanelProps = {
  /** Which controls to show — matches each control's `panel` (default 'main'). */
  panel?: string
  /** Heading shown on the panel's toggle. */
  title?: string
  /** Which side of the viewport the panel docks to. */
  side?: 'left' | 'right'
}

export function ControlPanel({
  panel = 'main',
  title = 'controls',
  side = 'left',
}: ControlPanelProps = {}) {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [open, setOpen] = useState(true)
  // Shown on load so the controls are there to tune straight away. Press the
  // backtick key to hide it when you want a clean view of the scene.
  const [shown, setShown] = useState(true)

  // Systems register their controls as they mount, so the list is not known
  // until after the first paint.
  useEffect(() => subscribeToControls(bump), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '`') setShown((wasShown) => !wasShown)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!CONTROLS_ENABLED || !shown) return null

  const controls = getControls().filter((c) => (c.panel ?? 'main') === panel)
  if (controls.length === 0) return null

  const groups = [...new Set(controls.map((control) => control.group))]

  const dock: React.CSSProperties =
    side === 'right' ? { right: 12, left: 'auto' } : { left: 12, right: 'auto' }

  return (
    <div style={{ ...PANEL, ...dock }}>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          width: '100%',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.6,
        }}
      >
        {open ? '– ' : '+ '}{title}
      </button>

      {open &&
        groups.map((group) => (
          <section key={group} style={{ marginTop: 12 }}>
            <div
              style={{
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                opacity: 0.4,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: 3,
              }}
            >
              {group}
            </div>
            {controls
              .filter((control) => control.group === group)
              .map((control) => (
                <Row key={`${group}/${control.label}`} control={control} />
              ))}
          </section>
        ))}
    </div>
  )
}
