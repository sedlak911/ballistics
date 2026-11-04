import { useEffect, useId, useLayoutEffect, useRef, type RefObject } from 'react'
import type { UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { cardinalIndex } from '../forecastWind'
import { BOUNDS, type RealSetup } from '../setup'
import { DistanceTool } from './controls'
import { CloseIcon, PhoneEdgeIcon } from './icons'
import { NBSP } from './realText'
import type { useAiming } from './useAiming'
import './camera.css'

/** The compass tape: 3 px a degree, 45° to each side of the heading. */
const TAPE_PX = 3
const TAPE_HALF_DEG = 45
const TAPE_H = 38
/** The lens in the reticle's units (the camera mockup's): its radius, and the steadiness ring just outside it. */
const LENS_R = 165
const RING_R = 171
const VIEW_R = 180
/** The duplex: black posts from the rim in to POST_IN, then thin red lines in to GAP, round a red dot. */
const POST_IN = 55
const GAP = 9
const DOT_R = 2.4

const arms = (from: number, to: number) => `M${from} 0H${to}M${-from} 0H${-to}M0 ${from}V${to}M0 ${-from}V${-to}`

/**
 * The compass tape over the lens: it slides with the heading under a fixed accent mark. Ticks every 5°, longer every 10°,
 * a label every 30°, and the cardinal letters at 0, 90, 180 and 270.
 */
function CompassTape({ heading, letters }: { heading: number | null; letters: string[] }) {
  const half = TAPE_HALF_DEG * TAPE_PX
  if (heading === null) return <div className="real-cam-tape" aria-hidden="true" />
  const ticks: string[] = []
  const labels: { at: number; x: number; text: string; cardinal: boolean }[] = []
  for (let d = Math.ceil((heading - TAPE_HALF_DEG) / 5) * 5; d <= heading + TAPE_HALF_DEG; d += 5) {
    const x = Math.round((d - heading) * TAPE_PX * 10) / 10
    ticks.push(d % 10 === 0 ? `M${x} 17v12` : `M${x} 22v7`)
    if (d % 30 !== 0) continue
    const n = ((d % 360) + 360) % 360
    const cardinal = n % 90 === 0
    labels.push({ at: d, x, text: cardinal ? letters[n / 45] : String(n), cardinal })
  }
  return (
    <div className="real-cam-tape" aria-hidden="true">
      <svg viewBox={`${-half} 0 ${2 * half} ${TAPE_H}`} width={2 * half} height={TAPE_H}>
        <path className="real-cam-tick" d={ticks.join('')} />
        {labels.map((l) => (
          <text key={l.at} x={l.x} y={12} textAnchor="middle" className={l.cardinal ? 'real-cam-deg is-cardinal' : 'real-cam-deg'}>{l.text}</text>
        ))}
        <path className="real-cam-mark" d={`M-6 ${TAPE_H}L0 ${TAPE_H - 8}L6 ${TAPE_H}Z`} />
      </svg>
    </div>
  )
}

/** Cuts the glass round the lens: the lens's centre and radius, measured, go to the glass's mask as CSS variables. */
function useLensHole(view: RefObject<HTMLDivElement | null>, lens: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const v = view.current
    const l = lens.current
    if (!v || !l) return
    const place = () => {
      const a = v.getBoundingClientRect()
      const b = l.getBoundingClientRect()
      v.style.setProperty('--hole-x', `${b.left - a.left + b.width / 2}px`)
      v.style.setProperty('--hole-y', `${b.top - a.top + b.height / 2}px`)
      v.style.setProperty('--hole-r', `${b.width / 2}px`)
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    // The lens sits in the middle of the room it is given: that room changes size whenever the lens moves.
    const observer = new ResizeObserver(place)
    observer.observe(l.parentElement ?? l)
    return () => observer.disconnect()
  }, [view, lens])
}

/**
 * The camera view, the home-screen app's shot screen: the rear camera behind frosted glass, a clear lens with a duplex
 * reticle, the compass tape, the steadiness ring, the direction and slope, the distance and Use. The picture is only shown.
 * It is never drawn to a canvas, saved or sent. The tracks stop when this unmounts, whichever way it goes; the dock decides
 * what Use writes. The distance applies at once; the direction and the slope only with Use.
 */
export function CameraAim({ aiming, stream, setup, update, system, onUse, onClose, onSimple, onType }: {
  aiming: ReturnType<typeof useAiming>
  stream: MediaStream
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  system: UnitSystem
  onUse: () => void
  onClose: () => void
  /** The style icon: measure the simple way from now on. */
  onSimple: () => void
  /** A tap on a figure: leave the camera and type that field in the shot panel. */
  onType: (field: 'direction' | 'slope') => void
}) {
  const { t } = useSettings()
  const titleId = useId()
  const view = useRef<HTMLDivElement>(null)
  const lens = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (video.current) video.current.srcObject = stream
    return () => { for (const track of stream.getTracks()) track.stop() }
  }, [stream])
  // A dialog over the panel: the keyboard and a screen reader start in it.
  useEffect(() => { view.current?.focus({ preventScroll: true }) }, [])
  useLensHole(view, lens)

  const state = aiming.state
  const locked = state.status === 'live' ? state.locked : null
  const live = state.status === 'live' ? state.reading : null
  // Locked, the ring is full (steady is 1) and everything shows the lock, not the latest reading.
  const steady = state.status === 'live' ? state.steady : 0
  const tape = locked ? locked.headingDeg : live ? live.headingDeg : null
  const heading = locked ? locked.headingDeg : live ? Math.round(live.headingDeg) % 360 : null
  const slope = locked ? locked.slopeDeg : live ? Math.max(BOUNDS.slopeDeg.min, Math.min(BOUNDS.slopeDeg.max, Math.round(live.pitchDeg))) + 0 : null
  const letters = t('real.cardinals').split(' ')
  const none = <span className="real-cam-none">—</span>

  return (
    <div ref={view} className="real-cam" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid="real-camera">
      <video ref={video} className="real-cam-video" autoPlay playsInline muted />
      <div className="real-cam-glass" aria-hidden="true" />
      <div className="real-cam-top">
        <h2 id={titleId} className="label">{t('aim.title')}</h2>
        <button type="button" className="icon-btn" aria-label={t('aim.toSimple')} title={t('aim.toSimple')} onClick={onSimple}>
          <PhoneEdgeIcon />
        </button>
        <button type="button" className="icon-btn" aria-label={t('dock.close')} title={t('dock.close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <CompassTape heading={tape} letters={letters} />
      <div className="real-cam-room">
        <div ref={lens} className="real-cam-lens" aria-hidden="true">
          <svg className="real-cam-reticle" viewBox={`${-VIEW_R} ${-VIEW_R} ${2 * VIEW_R} ${2 * VIEW_R}`}>
            <path className="real-cam-post-halo" d={arms(LENS_R, POST_IN)} />
            <path className="real-cam-post" d={arms(LENS_R, POST_IN)} />
            <path className="real-cam-lit-halo" d={arms(POST_IN, GAP)} />
            <path className="real-cam-lit" d={arms(POST_IN, GAP)} />
            <circle className="real-cam-dot" r={DOT_R} />
            <circle className="real-cam-track" r={RING_R} />
            <circle className={locked ? 'real-cam-ring is-locked' : 'real-cam-ring'} r={RING_R} pathLength={100}
              strokeDasharray={`${Math.round(steady * 1000) / 10} 100`} transform="rotate(-90)" />
          </svg>
        </div>
      </div>
      <div className="real-cam-foot">
        <p className={locked ? 'real-cam-status is-locked' : 'real-cam-status'} role="status">{locked ? t('aim.measured') : t('aim.hold')}</p>
        <div className="real-cam-duo">
          <button type="button" className="real-cam-read" onClick={() => onType('direction')}>
            <span className="label">{t('real.direction')}</span>
            <span className="num">{heading === null ? none : <>{heading}<small>°{NBSP}·{NBSP}{letters[cardinalIndex(heading)]}</small></>}</span>
          </button>
          <button type="button" className="real-cam-read" onClick={() => onType('slope')}>
            <span className="label">{t('real.slope')}</span>
            <span className="num">{slope === null ? none : <>{String(slope).replace('-', '−')}<small>°</small></>}</span>
          </button>
        </div>
        <DistanceTool setup={setup} update={update} system={system} ruler shortWord={t('aim.distance')} />
        <button type="button" className={locked ? 'btn primary real-cam-use is-ready' : 'btn primary real-cam-use'} aria-disabled={!locked}
          onClick={onUse}>{t('aim.use')}</button>
      </div>
    </div>
  )
}
