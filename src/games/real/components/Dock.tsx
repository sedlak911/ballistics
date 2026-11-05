import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { WindClock } from '../../../components/WindClock'
import { SPEED_TO_MS, type UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { isStandalone } from '../../../install'
import { effectiveAimMode, useRealProfile, type WindUnit } from '../profile'
import { BOUNDS, type RealSetup } from '../setup'
import { forecastUseOffered } from '../forecastWind'
import { useStation } from '../station'
import { useSetDirection } from '../useSetDirection'
import { useWindFlash } from '../windFlash'
import { shownZones, zoneWind, zonesActive } from '../zones'
import { AimBar } from './AimBar'
import { SHEET_BACKDROP } from './CalcSheet'
import { CameraAim } from './CameraAim'
import { hasCompass } from './compass'
import { DirectionField, DistanceTool, ForecastLine, ReadingHint, SlopeTool, WindSigmaTool, WindSpeedTool } from './controls'
import { CloseIcon, LensIcon } from './icons'
import { WindZones, ZoneButtons, ZoneReset, useZoneSelection, zoneClockPatch } from './WindZones'
import { useAiming } from './useAiming'
import { WindTurnedStatus } from './WindTurnedStatus'
import { NBSP, clockCardinals, rounded, speedShort, windText } from './realText'

type PanelName = 'shot' | 'wind'
/** What opened the camera view: Distance, or the shot panel's lens icon or Aim. */
type Opener = 'distance' | 'lens' | 'aim'
const M_PER_YD = 0.9144
/** The clear space left between the answer and an open panel. */
const SCROLL_GAP = 12

/**
 * The phone's bottom bar: one row of two buttons, Distance and Wind. Each opens a panel above the row with what changes at the
 * range, so the answer stays in sight. A disclosure, not a dialog: nothing is trapped and the page isn't dimmed.
 */
export function Dock({ setup, update, system, windUnit, now, weights = null, onHelp }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  system: UnitSystem
  windUnit: WindUnit
  now: number
  /** Each shown zone's share of the drift, near to far (the solution's `zoneWeights`). */
  weights?: number[] | null
  /** Opens the sheet on how to read the wind. */
  onHelp?: (from: HTMLElement) => void
}) {
  const { t } = useSettings()
  const [station] = useStation()
  const [open, setOpen] = useState<PanelName | null>(null)
  const [zone, setZone] = useZoneSelection(setup)
  const zones = zonesActive(setup)
  const zw = zoneWind(setup, zone)
  const id = useId()
  const dockRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttons = { shot: useRef<HTMLButtonElement>(null), wind: useRef<HTMLButtonElement>(null) }
  const directionRef = useRef<HTMLInputElement>(null)
  const slopeRef = useRef<HTMLInputElement>(null)
  const lensRef = useRef<HTMLButtonElement>(null)
  const wantDirection = useRef(false)
  const cancelAimRef = useRef(() => {})
  const [profile, setProfile] = useRealProfile()
  // In the camera style the camera view is the shot screen: Distance opens it. When the camera can't start, that measurement
  // reads the top edge in the panel instead (the setting stays `camera`).
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [noCamera, setNoCamera] = useState(false)
  const camToken = useRef(0)
  // A view that Distance opened closes to the page; one that the panel opened, to the panel. Null once the camera fell back
  // to the simple way, which stays in the panel.
  const openedBy = useRef<Opener | null>(null)
  const cameraStyle = effectiveAimMode(profile, isStandalone()) === 'camera'
  const aimMode = cameraStyle && !noCamera ? 'camera' : 'simple'
  const aiming = useAiming(aimMode)
  const aimStop = aiming.stop
  // Ends the aiming and the camera, and drops a stream that is still being asked for.
  const stopAiming = useCallback(() => {
    camToken.current++
    setStream(null)
    aimStop()
  }, [aimStop])
  const setDirection = useSetDirection(setup, update)
  const aimingNow = useRef(false)
  aimingNow.current = aiming.state.status === 'asking' || aiming.state.status === 'live'

  // Aiming belongs to the shot panel: whatever takes the panel away (close, ✕, a press outside, the Wind panel) ends it.
  useEffect(() => {
    if (open !== 'shot') stopAiming()
  }, [open, stopAiming])
  // A failed measurement (the sensors gave nothing, or the permission was refused) ends the camera too: the panel shows why.
  const failed = aiming.state.status === 'failed'
  useEffect(() => {
    if (!failed) return
    camToken.current++
    openedBy.current = null
    setStream(null)
  }, [failed])
  // A stream still being asked for when the dock goes is dropped when it comes.
  useEffect(() => () => { camToken.current++ }, [])
  // A phone put down, or another app in front, stops it: the sensors aren't kept running unseen.
  useEffect(() => {
    if (open !== 'shot') return
    const onHide = () => { if (document.visibilityState === 'hidden') stopAiming() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [open, stopAiming])

  // Locked, the figures show the lock, not the latest reading. A phone tilted past the slope range reads no slope: the
  // field shows its own value, still disabled.
  const locked = aiming.state.status === 'live' ? aiming.state.locked : null
  const liveReading = aiming.state.status === 'live' ? aiming.state.reading : null
  const tilted = aiming.state.status === 'live' && aiming.state.tilted
  const slopeLive = locked ? locked.slopeDeg : liveReading && !tilted ? Math.max(BOUNDS.slopeDeg.min, Math.min(BOUNDS.slopeDeg.max, Math.round(liveReading.pitchDeg))) + 0 : undefined
  const headingLive = locked ? locked.headingDeg : liveReading ? Math.round(liveReading.headingDeg) % 360 : undefined
  // Starts the aiming, through the camera or by the top edge; a camera already up, or still being asked for, goes.
  const aim = (camera = cameraStyle, by: Opener = 'aim') => {
    const token = ++camToken.current
    openedBy.current = camera ? by : null
    setStream(null)
    setNoCamera(false)
    aiming.start()
    if (!camera) return
    const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!devices || typeof devices.getUserMedia !== 'function') { fallBack(); return }
    // Both calls run in the tap itself: iOS asks for each permission only inside a gesture.
    devices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(
      (s) => {
        if (camToken.current === token) setStream(s)
        else for (const track of s.getTracks()) track.stop()
      },
      () => { if (camToken.current === token) fallBack() },
    )
  }
  const fallBack = () => {
    openedBy.current = null
    setNoCamera(true)
  }
  // Leaves the aiming (✕, Use, Cancel, Escape). A camera view that Distance opened goes back to the page, the panel with it,
  // and the focus to Distance; otherwise the panel stays.
  const leaveAim = () => {
    stopAiming()
    if (openedBy.current !== 'distance') return
    buttons.shot.current?.focus()
    setOpen(null)
  }
  const useAim = () => {
    const r = aiming.take()
    if (r === null) return
    setDirection(r.headingDeg, { slopeDeg: r.slopeDeg })
    leaveAim()
  }
  cancelAimRef.current = leaveAim
  // The style icons choose for good, as ⚙ does, and measure on the other way at once.
  const toSimple = () => {
    setProfile({ aimMode: 'simple', aimChosen: true })
    aim(false)
  }
  const toCamera = () => {
    setProfile({ aimMode: 'camera', aimChosen: true })
    aim(true, 'lens')
  }
  // A figure tapped in the camera view: the view and the aiming end, and that field of the panel takes the focus. Committed
  // at once, so the field is enabled while still inside the tap (iOS opens the keyboard only there).
  const typeIn = (field: 'direction' | 'slope') => {
    flushSync(stopAiming)
    ;(field === 'direction' ? directionRef : slopeRef).current?.focus()
  }
  // A camera view gone back to the panel (✕, Use, Escape, the style icon, a failure): the focus it held goes to the button that
  // opened it, the lens icon or Aim, else to the panel.
  useEffect(() => {
    if (stream || document.activeElement !== document.body) return
    const back = openedBy.current === 'lens' ? lensRef.current : panelRef.current?.querySelector<HTMLElement>('.real-aim')
    ;(back ?? panelRef.current)?.focus({ preventScroll: true })
  }, [stream])

  // The panel takes the focus when it opens or when the other one replaces it; asking for the direction goes on to its field.
  useEffect(() => {
    if (!open) return
    if (wantDirection.current) {
      wantDirection.current = false
      directionRef.current?.focus()
    } else panelRef.current?.focus({ preventScroll: true })
    // The panel covers the lower page: the page gets its height as room to scroll, and is scrolled just enough to keep the
    // last large figure above it. Measured again when the panel grows (a forecast offer, a compass message).
    const panel = panelRef.current
    if (!panel) return
    let height = 0
    const place = (grewOnly: boolean) => {
      const h = panel.offsetHeight
      if (grewOnly && h <= height) return
      height = h
      document.documentElement.style.setProperty('--real-panel-h', `${h}px`)
      // The panel's top from the dock's, which doesn't move while the panel slides in.
      const dock = dockRef.current?.querySelector('.real-dock-row')?.getBoundingClientRect().top
      if (dock === undefined) return
      const top = dock - h - 9
      const figures = document.querySelectorAll('.real-hero')
      const last = figures[figures.length - 1]?.getBoundingClientRect().bottom
      const first = figures[0]?.getBoundingClientRect().top
      if (last === undefined || first === undefined) return
      const down = last - top + SCROLL_GAP
      if (down > 0) {
        window.scrollBy(0, down)
        return
      }
      // The last figure already clears the panel: bring the first back under the header, but never past the last rule.
      if (grewOnly) return
      const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0
      const up = Math.min(Math.max(0, header) - first, -down)
      if (up > 0) window.scrollBy(0, -up)
    }
    place(false)
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => place(true))
      observer.observe(panel)
    }
    return () => {
      observer?.disconnect()
      document.documentElement.style.removeProperty('--real-panel-h')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A sheet over the dock (how to read the wind) takes the Escape; the panel stays.
      if (document.querySelector(`.${SHEET_BACKDROP}`)) return
      // The first Escape ends the aiming and keeps the panel; the next one closes it.
      if (aimingNow.current) { cancelAimRef.current(); return }
      buttons[open].current?.focus()
      setOpen(null)
    }
    // An outside press closes it and leaves the focus where it is.
    // The focused field is blurred first, so a typed value commits before the panel goes (NumberField commits on blur).
    const onDown = (e: PointerEvent) => {
      if (dockRef.current?.contains(e.target as Node)) return
      // A press on the sheet over the dock (a portal) is not outside.
      if ((e.target as Element).closest?.(`.${SHEET_BACKDROP}`)) return
      const a = document.activeElement
      if (a instanceof HTMLElement && dockRef.current?.contains(a)) a.blur()
      setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the button refs never change
  }, [open])

  const yards = system === 'imperial'
  // The unit is drawn small so the value fits the half-width button on a 375px phone.
  const unit = (u: string) => <>{NBSP}<small>{u}</small></>
  const distance = <>{yards ? Math.round(setup.distanceM / M_PER_YD) : rounded(setup.distanceM, 1)}{unit(yards ? 'yd' : 'm')}</>
  const flash = useWindFlash()
  const wind = zones ? <>{t('zones.count', { n: shownZones(setup.distanceM).length })}</> : <>{speedShort(setup.windMs, windUnit)}{unit(windUnit)}{setup.windSet && <em key={flash?.key} className={flash?.hour === setup.windClock ? 'real-hour-flash' : undefined}>{t('dock.windValue', { s: '', h: setup.windClock })}</em>}</>
  const titles: Record<PanelName, string> = { shot: t('dock.shot'), wind: zones ? t('zones.title') : t('real.wind') }
  const words: Record<PanelName, string> = { shot: t('real.distance'), wind: t('real.wind') }
  const values: Record<PanelName, ReactNode> = { shot: distance, wind }
  const panelId = (name: PanelName) => `${id}-${name}`

  const windGlow = !setup.windSet
  const offered = forecastUseOffered(station, now, windUnit)
  const needDir = station.azimuthDeg === null

  const cardinals = clockCardinals(station.azimuthDeg?.value, t('real.cardinals'))

  return createPortal(
    <div ref={dockRef} className="real-dock" data-testid="real-dock">
      {open && (
        <div key={open} ref={panelRef} id={panelId(open)} className="real-panel" data-testid="real-panel" role="region" tabIndex={-1}
          aria-labelledby={`${panelId(open)}-title`}>
          <div className="real-panel-head">
            <h2 id={`${panelId(open)}-title`} className="label">{titles[open]}</h2>
            {open === 'wind' && <ZoneButtons setup={setup} update={update} onHelp={onHelp} />}
            {open === 'shot' && hasCompass() && (
              <button ref={lensRef} type="button" className="icon-btn" aria-label={t('aim.toCamera')} title={t('aim.toCamera')} onClick={toCamera}>
                <LensIcon />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label={t('dock.close')} title={t('dock.close')}
              onClick={() => { buttons[open].current?.focus(); setOpen(null) }}>
              <CloseIcon />
            </button>
          </div>
          {open === 'shot' ? (
            <div className="real-panel-body">
              <DistanceTool setup={setup} update={update} system={system} ruler />
              <SlopeTool setup={setup} update={update} hint="line" live={slopeLive} aiming={aiming.state.status === 'live'} inputRef={slopeRef} />
              <div className={aiming.state.status === 'live' ? 'real-dir-aim is-live' : 'real-dir-aim'}>
                <DirectionField setup={setup} update={update} inputRef={directionRef} live={headingLive} glow={needDir && !hasCompass()} />
                {hasCompass() && !stream && <AimBar state={aiming.state} mode={aimMode} glow={needDir} notice={noCamera && aiming.state.status === 'live' ? t('aim.noCamera') : undefined}
                  onAim={() => aim()} onUse={useAim} onCancel={leaveAim} />}
              </div>
            </div>
          ) : (
            <div className="real-panel-body">
              {zones && <WindZones setup={setup} system={system} windUnit={windUnit} weights={weights} selected={zone} onSelect={setZone} />}
              <div className="real-panel-wind">
                <WindClock label={t('real.windBlows')} value={zw.clock} onChange={(h) => update(zoneClockPatch(setup, zones ? zone : null, h))}
                  speedMs={rounded(zw.ms / SPEED_TO_MS[windUnit], 1)} unit={windUnit} cardinals={cardinals}
                  valueText={t('real.clockValue', { h: zw.clock, s: windText(zw.ms, windUnit) })} />
                <div className="real-panel-col">
                  <div className="real-tool real-wind"><WindSpeedTool setup={setup} update={update} windUnit={windUnit} zone={zones ? zone : undefined} glow={windGlow && !offered} /></div>
                  <div className="real-tool"><WindSigmaTool /></div>
                  {zones && <ZoneReset setup={setup} update={update} zone={zone} />}
                </div>
              </div>
              <ForecastLine glow={windGlow} setup={setup} update={update} now={now} onNeedDirection={() => { wantDirection.current = true; setOpen('shot') }} />
              {!zones && <ReadingHint />}
            </div>
          )}
        </div>
      )}
      {stream && <CameraAim aiming={aiming} stream={stream} setup={setup} update={update} system={system}
        onUse={useAim} onClose={leaveAim} onSimple={toSimple} onType={typeIn} />}
      <WindTurnedStatus />
      <div className="real-dock-row">
        {(['shot', 'wind'] as const).map((name) => (
          <button key={name} ref={buttons[name]} type="button" className={name === 'wind' && windGlow ? 'real-dock-btn glow-want' : 'real-dock-btn'} aria-expanded={open === name}
            aria-controls={panelId(name)} onClick={() => {
              const opening = open !== name
              if (opening) setZone('near')
              setOpen(opening ? name : null)
              // In the camera style Distance opens the camera view, asking for the sensors and the camera inside this tap.
              if (opening && name === 'shot' && cameraStyle && hasCompass()) aim(true, 'distance')
            }}>
            <span className="label">{words[name]}</span>{' '}
            <span className="num">{values[name]}</span>
            <span className={name === 'shot' && needDir ? 'real-dock-chevron glow-want' : 'real-dock-chevron'} aria-hidden="true">{open === name ? '⌄' : '⌃'}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
