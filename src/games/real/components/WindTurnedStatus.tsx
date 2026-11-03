import { useSettings } from '../../../settings/SettingsContext'
import { useWindFlash } from '../windFlash'

/** Tells a screen reader that the wind hour turned with the direction; empty again once the flash is over. */
export function WindTurnedStatus() {
  const { t } = useSettings()
  const flash = useWindFlash()
  return <span className="real-hint-vh" role="status" aria-live="polite">{flash ? t('real.windTurned', { h: flash.hour }) : ''}</span>
}
