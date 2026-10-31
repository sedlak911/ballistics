import { useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChipGroup } from '../../../components/ChipGroup'
import { Segmented } from '../../../components/Segmented'
import { PHONE, useMedia } from '../../../components/useMedia'
import { TARGET_SPEEDS, type Movement } from '../../../engine/aim'
import { rangeFromReading, readingScale } from '../../../engine/ranging'
import { MOA_PER_MIL, toDisplay, type AngleUnit, type UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import { useSettings } from '../../../settings/SettingsContext'
import type { Setup } from '../../../settings/url'
import { STEADINESS, type Profile, type Steadiness } from '../profile'
import { DISTANCE_M, FIGURE_SIZE_M } from '../ranging'
import './toolbar.css'

/** The target: a posture or a movement. Kneeling and prone are postures, so those targets never move. */
type TargetState = Movement | 'kneeling' | 'prone'
const TARGETS: TargetState[] = ['standing', 'kneeling', 'prone', 'walking', 'jogging', 'sprinting']
const CERTAINTY = [3, 10, 20] as const
const { min: MIN_M, max: MAX_M } = DISTANCE_M
// Slider steps for the target's height; readings are kept on this grid so a typed 1.25 MIL lands exactly.
const READ_STEP: Record<AngleUnit, number> = { mil: 0.05, moa: 0.25 }

const readingAt = (sizeM: number, distanceM: number, unit: AngleUnit) =>
  ((sizeM * 1000) / distanceM) * (unit === 'mil' ? 1 : MOA_PER_MIL)
const fmtReading = (v: number) => {
  const r = Math.round(v * 100) / 100
  return Number.isInteger(Math.round(r * 100) / 10) ? r.toFixed(1) : r.toFixed(2)
}

function MoveIcon({ m }: { m: TargetState }) {
  const d: Record<TargetState, string> = {
    standing: 'M5 6h4v6H5zM5 12h1.6v6H5zM7.4 12H9v6H7.4z',
    kneeling: 'M5 7h4v5H5zM5 12h1.6v5.5H5zM2 15.9h4v1.6H2zM6 12h5.5v1.6H6zM9.9 12h1.6v5.5H9.9z',
    prone: 'M4.5 11.5h8v3h-8zM1 13h4v1.6H1zM12.5 12.6h5v1.2h-5z',
    walking: 'M5.5 6h3.5l.5 6H6zM6 12l-2 6h1.6l2-5zM8 12l1.5 6h1.6L9.6 12z',
    jogging: 'M6.5 6.5l4-.5.5 5.5-3.5.5zM7.5 12l-4 5 1.4.8 4-4.5zM10 11.5l2.5 6h1.6l-2.4-6.5z',
    sprinting: 'M7 7l5-1.2 1 5-4.6 1zM8.4 11.8L2.5 15l.8 1.4 6.2-3zM12.5 10.6l4.3 4.6-1.1 1.1-4.8-4.3z',
  }
  const head: Record<TargetState, [number, number]> = { standing: [7, 3], kneeling: [7, 4.3], prone: [14, 10], walking: [7, 3], jogging: [9, 3], sprinting: [11, 3] }
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx={head[m][0]} cy={head[m][1]} r="2.3" fill="currentColor" />
      <path d={d[m]} fill="currentColor" />
    </svg>
  )
}

/**
 * The inputs that change mid-fight, each under its word. A row for me: range (distance, or the target's height in
 * MIL/MOA, and how sure) and my stance; a row for the target: posture or movement, direction, angle and the speed it
 * assumes. On a phone, distance and movement move into a bar fixed to the bottom.
 */
export function Toolbar({ setup, update, unit, system, rangeBy, onRangeBy, stance, onStance }: {
  setup: Pick<Setup, 'distanceM' | 'rangeSigmaPct' | 'movement' | 'posture' | 'direction' | 'crossing'>
  update: (patch: Partial<Setup>) => void
  unit: AngleUnit
  system: UnitSystem
  rangeBy: Profile['rangeBy']
  onRangeBy: (by: Profile['rangeBy']) => void
  stance: Steadiness
  onStance: (s: Steadiness) => void
}) {
  const { t } = useSettings()
  const phone = useMedia(PHONE)
  const speed = toDisplay(TARGET_SPEEDS[setup.movement], 'speed', system)
  const angleWord = unit === 'mil' ? 'MIL' : 'MOA'

  // By height: the slider is the reading of the whole figure, from its size at 1000 m to its size at 50 m, on a log
  // scale. A reading the owner set is held while the distance is the one it produced: the distance is rounded to
  // whole metres, and re-deriving the reading from it would undo small steps at close range.
  const sizeM = FIGURE_SIZE_M[setup.posture]
  const step = READ_STEP[unit]
  const onGrid = (v: number) => Math.round(v / step) * step
  const lo = Math.floor(readingAt(sizeM, MAX_M, unit) / step + 1e-9) * step
  const hi = Math.ceil(readingAt(sizeM, MIN_M, unit) / step - 1e-9) * step
  const scale = readingScale(lo, hi)
  const [held, setHeld] = useState<{ reading: number; distanceM: number; key: string } | null>(null)
  const heldKey = `${sizeM}|${unit}`
  const reading = held && held.distanceM === setup.distanceM && held.key === heldKey ? held.reading
    : Math.min(hi, Math.max(lo, onGrid(readingAt(sizeM, setup.distanceM, unit))))
  const setReading = (v: number) => {
    const r = Math.min(hi, Math.max(lo, onGrid(v)))
    const d = rangeFromReading(sizeM, r, unit)
    if (d === null) return
    const distanceM = Math.min(MAX_M, Math.max(MIN_M, Math.round(d)))
    setHeld({ reading: r, distanceM, key: heldKey })
    update({ distanceM })
  }
  // The arrow keys step the reading on its grid; a native step on the log scale would round away.
  const onReadingKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    setReading(reading + dir * step)
  }
  const byHeight = rangeBy === 'height'
  const fill = byHeight ? (scale.toPos(reading) / scale.max) * 100 : ((setup.distanceM - MIN_M) / (MAX_M - MIN_M)) * 100

  const distance = (
    <div className={`tool range-tool by-${rangeBy}`}>
      <span className="label" aria-hidden="true">{t('wb.rangeBy')}</span>
      <Segmented className="by" label={t('wb.rangeBy')} value={rangeBy} onChange={onRangeBy}
        options={[{ value: 'distance', label: system === 'metric' ? 'm' : 'yd' }, { value: 'height', label: angleWord }]} />
      {byHeight ? (
        <>
          <label className="label" htmlFor="height">{t('rg.spans', { figure: t(`rg.fig.${setup.posture}`), unit: angleWord })}</label>
          <input id="height" type="range" min={0} max={scale.max} step="any" value={scale.toPos(reading)}
            aria-valuetext={`${fmtReading(reading)} ${angleWord}`} style={{ ['--p' as string]: `${fill}%` }}
            onChange={(e) => setReading(scale.fromPos(Number(e.target.value)))} onKeyDown={onReadingKey} />
          <span className="num readout">{fmtReading(reading)} {angleWord}</span>
        </>
      ) : (
        <>
          <label className="label" htmlFor="distance">{t('wb.distance')}</label>
          <input id="distance" type="range" min={MIN_M} max={MAX_M} step={5} value={setup.distanceM}
            style={{ ['--p' as string]: `${fill}%` }} onChange={(e) => update({ distanceM: Number(e.target.value) })} />
        </>
      )}
      <span className={`num readout${byHeight ? ' derived' : ''}`} data-testid="distance-readout">{fmtDistance(setup.distanceM, system)}</span>
    </div>
  )
  const certainty = (
    <div className="tool chips-tool">
      <span className="label">{t('wb.certainty')}</span>
      <ChipGroup label={t('wb.certainty')} value={setup.rangeSigmaPct} onChange={(p) => update({ rangeSigmaPct: p })}
        options={CERTAINTY.map((p) => ({ value: p, label: `±${p} %`, title: t(`cert.${p}`) }))} />
      {!(CERTAINTY as readonly number[]).includes(setup.rangeSigmaPct) && <span className="num readout">±{setup.rangeSigmaPct} %</span>}
    </div>
  )
  // Mine and the target's, each under its word, so neither reads as the other.
  const me = (
    <div className="tool move me" role="group" aria-label={t('wb.me')}>
      <span className="label" aria-hidden="true">{t('wb.me')}</span>
      {STEADINESS.map((s) => (
        <button key={s} type="button" aria-pressed={stance === s} onClick={() => onStance(s)}>
          <MoveIcon m={s} />
          <span>{t(`steady.${s}`)}</span>
        </button>
      ))}
    </div>
  )
  const target: TargetState = setup.posture === 'standing' ? setup.movement : setup.posture
  // Direction, angle and speed only matter for a moving target; for a still one they stay on screen, switched off.
  const still = target === 'standing' || target === 'kneeling' || target === 'prone'
  const stillTitle = still ? t('wb.stillTarget') : undefined
  const movement = (
    <div className="tool move" role="group" aria-label={t('wb.target')}>
      <span className="label" aria-hidden="true">{t('wb.target')}</span>
      {TARGETS.map((m) => (
        <button key={m} type="button" aria-pressed={target === m} title={t(`move.${m}`)}
          onClick={() => update(m === 'kneeling' || m === 'prone' ? { posture: m, movement: 'standing' } : { posture: 'standing', movement: m })}>
          <MoveIcon m={m} />
          <span>{t(`move.${m}`)}</span>
        </button>
      ))}
    </div>
  )
  // The crossing angle, then the speed it assumes for the target, under their words.
  const crossing = (
    <div className={`tool crossing${still ? ' still' : ''}`} role="group" aria-label={t('wb.angle')} title={stillTitle}>
      <span className="label" aria-hidden="true">{t('wb.angle')}</span>
      {([90, 45] as const).map((a) => (
        <button key={a} type="button" aria-pressed={setup.crossing === a} disabled={still} onClick={() => update({ crossing: a })}>{a}°</button>
      ))}
      <span className="label speed-label" title={t('wb.speedAssumed')}>{t('wb.speed')}</span>
      <span className="num readout speed" title={t('wb.speedAssumed')}>
        {speed.value === 0 ? '0' : speed.value.toFixed(1)}<span className="unit">{speed.unit}</span>
      </span>
    </div>
  )
  const direction = (
    <div className={`tool${still ? ' still' : ''}`} role="group" aria-label={t('wb.direction')} title={stillTitle}>
      <span className="label" aria-hidden="true">{t('wb.direction')}</span>
      {([-1, 1] as const).map((d) => (
        <button key={d} type="button" aria-label={d < 0 ? '←' : '→'} aria-pressed={setup.direction === d} disabled={still}
          onClick={() => update({ direction: d })}>{d < 0 ? '←' : '→'}</button>
      ))}
    </div>
  )

  if (phone) {
    return (
      <>
        <div className="toolbar">
          <div className="tool-row">{me}</div>
          <div className="tool-row">{certainty}</div>
          <div className="tool-row">{crossing}</div>
        </div>
        {createPortal(
          <div className="dock" data-testid="dock">
            {distance}
            <div className="dock-row">
              {movement}
              <button type="button" className="tool dir-toggle" aria-label={t('wb.direction')} disabled={still} title={stillTitle}
                onClick={() => update({ direction: setup.direction === 1 ? -1 : 1 })}>
                {setup.direction === 1 ? '→' : '←'}
              </button>
            </div>
          </div>,
          document.body,
        )}
      </>
    )
  }

  return (
    <div className="toolbar">
      <div className="tool-row">{distance}{certainty}{me}</div>
      <div className="tool-row">{movement}{direction}{crossing}</div>
    </div>
  )
}
