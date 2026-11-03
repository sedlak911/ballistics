import { useEffect, useId, useRef } from 'react'
import { BOUNDS } from '../setup'
import { cardinalIndex } from '../forecastWind'
import { useSettings } from '../../../settings/SettingsContext'
import { CloseIcon } from './icons'
import { NBSP } from './realText'
import type { useAiming } from './useAiming'
import './camera.css'

/**
 * The camera view for aiming: the rear camera as a viewfinder with a crosshair, and the live direction and slope at the foot.
 * The picture is only shown. It is never drawn to a canvas, saved or sent. The tracks stop when this unmounts, whichever way
 * it goes; the panel behind it decides what Use writes.
 */
export function CameraAim({ aiming, stream, onUse, onClose, message }: {
  aiming: ReturnType<typeof useAiming>
  stream: MediaStream
  onUse: () => void
  onClose: () => void
  message: 'moving' | null
}) {
  const { t } = useSettings()
  const titleId = useId()
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (video.current) video.current.srcObject = stream
    return () => { for (const track of stream.getTracks()) track.stop() }
  }, [stream])

  const state = aiming.state
  const reading = state.status === 'live' ? state.reading : null
  const steady = state.status === 'live' ? state.steady : 0
  const heading = reading ? Math.round(reading.headingDeg) % 360 : null
  const slope = reading ? Math.max(BOUNDS.slopeDeg.min, Math.min(BOUNDS.slopeDeg.max, Math.round(reading.pitchDeg))) + 0 : null
  const point = heading === null ? '' : `${NBSP}·${NBSP}${t('real.cardinals').split(' ')[cardinalIndex(heading)]}`

  return (
    <div className="real-cam" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="real-camera">
      <video ref={video} className="real-cam-video" autoPlay playsInline muted />
      <div className="real-cam-cross" aria-hidden="true"><i /></div>
      <div className="real-cam-top">
        <h2 id={titleId} className="label">{t('aim.title')}</h2>
        <button type="button" className="icon-btn" aria-label={t('dock.close')} title={t('dock.close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="real-cam-foot">
        <div className="real-cam-pair">
          <div>
            <div className="label">{t('real.direction')}</div>
            <div className="num real-cam-num">{heading === null ? '–' : heading}<small>°{point}</small></div>
          </div>
          <div>
            <div className="label">{t('real.slope')}</div>
            <div className="num real-cam-num">{slope === null ? '–' : slope}<small>°</small></div>
          </div>
        </div>
        <div className="real-aim-hold">
          <span>{t('aim.hold')}</span>
          <span className="real-aim-track" aria-hidden="true"><i style={{ width: `${Math.round(steady * 100)}%` }} /></span>
        </div>
        {message === 'moving' && <span className="rm-msg bad" role="alert">{t('aim.moving')}</span>}
        <button type="button" className="btn primary real-cam-use" onClick={onUse}>{t('aim.use')}</button>
      </div>
    </div>
  )
}
