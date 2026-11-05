import { useSettings } from '../../../settings/SettingsContext'
import type { AimMode, AimState } from './useAiming'

/**
 * What goes under the Direction field in the shot panel: the Aim button and its note; while the phone reads, the steadiness
 * bar with Use and Cancel. It writes nothing: the panel decides what Use does, and Use works once the phone has locked.
 */
export function AimBar({ state, mode, notice, glow = false, onAim, onUse, onCancel }: {
  state: AimState
  /** How the phone is read: a tilted phone is told to be held flat, or upright for the camera. */
  mode: AimMode
  /** Said above the bar: the camera wasn't available, so the phone is read the simple way. */
  notice?: string
  /** Aim glows: the direction is still missing. */
  glow?: boolean
  onAim: () => void
  onUse: () => void
  onCancel: () => void
}) {
  const { t } = useSettings()
  if (state.status === 'live') {
    return (
      <div className="real-aimbar">
        {notice && <span className="rm-note" role="status">{notice}</span>}
        <div className="real-aim-hold">
          <span>{state.locked ? t('aim.measured') : state.tilted ? t(mode === 'camera' ? 'aim.upright' : 'aim.flat') : t('aim.hold')}</span>
          <span className="real-aim-track" aria-hidden="true"><i style={{ width: `${Math.round(state.steady * 100)}%` }} /></span>
        </div>
        <div className="real-aim-actions">
          <button type="button" className={state.locked ? 'btn primary is-ready' : 'btn primary'} aria-disabled={!state.locked} onClick={onUse}>{t('aim.use')}</button>
          <button type="button" className="btn ghost" onClick={onCancel}>{t('aim.cancel')}</button>
        </div>
      </div>
    )
  }
  return (
    <div className="real-aimbar">
      <button type="button" className={glow ? 'btn ghost real-aim glow-want' : 'btn ghost real-aim'} disabled={state.status === 'asking'} onClick={onAim}>{t('aim.button')}</button>
      {state.status === 'failed' && <span className="rm-msg bad" role="alert">{t('aim.fail')}</span>}
      <span className="rm-note">{t('aim.note')}</span>
    </div>
  )
}
