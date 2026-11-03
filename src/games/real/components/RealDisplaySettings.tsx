import { Segmented } from '../../../components/Segmented'
import { useSettings } from '../../../settings/SettingsContext'
import { useRealProfile } from '../profile'

/** REAL's own rows of the ⚙ sheet: what the big figure shows in dial mode. */
export function RealDisplaySettings() {
  const { t } = useSettings()
  const [profile, setProfile] = useRealProfile()
  return (
    <div className="sheet-row rs-primary">
      <span className="label">{t('rs.primary')}</span>
      <Segmented label={t('rs.primary')} value={profile.primary} onChange={(primary) => setProfile({ primary })}
        options={[{ value: 'value', label: t('rs.primaryValue') }, { value: 'clicks', label: t('rs.primaryClicks') }]} />
      <span className="hint">{t('rs.primaryHint')}</span>
    </div>
  )
}
