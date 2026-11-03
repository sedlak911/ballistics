import { Segmented } from '../../../components/Segmented'
import { useSettings } from '../../../settings/SettingsContext'
import { WIND_UNITS, useRealProfile } from '../profile'
import { useMedia, PHONE } from '../../../components/useMedia'
import { hasCompass } from './compass'

/** REAL's own rows of the ⚙ sheet: what the big figure shows in dial mode, and the unit the wind is set and shown in. */
export function RealDisplaySettings() {
  const { t } = useSettings()
  const [profile, setProfile] = useRealProfile()
  const phone = useMedia(PHONE)
  return (
    <>
      <div className="sheet-row rs-primary">
        <span className="label">{t('rs.primary')}</span>
        <Segmented label={t('rs.primary')} value={profile.primary} onChange={(primary) => setProfile({ primary })}
          options={[{ value: 'value', label: t('rs.primaryValue') }, { value: 'clicks', label: t('rs.primaryClicks') }]} />
        <span className="hint">{t('rs.primaryHint')}</span>
      </div>
      <div className="sheet-row">
        <span className="label">{t('rs.windIn')}</span>
        <Segmented label={t('rs.windIn')} value={profile.windUnit} onChange={(windUnit) => setProfile({ windUnit })}
          options={WIND_UNITS.map((u) => ({ value: u, label: u }))} />
      </div>
      <div role="group" aria-labelledby="rs-measure" className="rs-measure">
      <span id="rs-measure" className="label rs-group">{t('rs.measure')}</span>
      {phone && hasCompass() && (
        <div className="sheet-row">
          <span className="label">{t('rs.aiming')}</span>
          <Segmented label={t('rs.aiming')} value={profile.aimMode} onChange={(aimMode) => setProfile({ aimMode })}
            options={[{ value: 'simple', label: t('rs.aimSimple') }, { value: 'camera', label: t('rs.aimCamera') }]} />
        </div>
      )}
      <div className="sheet-row rs-primary">
        <span className="label">{t('rs.forecastWind')}</span>
        <Segmented label={t('rs.forecastWind')} value={profile.forecastWind} onChange={(forecastWind) => setProfile({ forecastWind })}
          options={[{ value: 'tap', label: t('rs.fcTap') }, { value: 'auto', label: t('rs.fcAuto') }]} />
        <span className="hint">{t('rs.fcHint')}</span>
      </div>
      </div>
    </>
  )
}
