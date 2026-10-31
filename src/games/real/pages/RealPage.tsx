import { useMemo, useState } from 'react'
import { aimMark } from '../../../components/scopeGeometry'
import { PHONE, useMedia } from '../../../components/useMedia'
import { useSettings } from '../../../settings/SettingsContext'
import { BottomBar } from '../components/BottomBar'
import { RealMenus } from '../components/RealMenus'
import { RealView } from '../components/RealView'
import { StationLine } from '../components/StationLine'
import { PRESETS } from '../data/presets'
import { useRealProfile } from '../profile'
import { resolvePreset } from '../profiles'
import { useRealSetup } from '../setup'
import { solveReal } from '../solve'
import { useStation } from '../station'
import { modelFreshness } from '../components/stationText'
import { useNow } from '../components/useNow'

/**
 * REAL's one page: reads the setup, the preset's overrides (a shared link's on top), the profile and the station, solves the shot once per
 * change and hands the answer to the view. The hit chance costs four extra solves, so only a large screen or the open
 * calculation sheet asks for it; the shares, a run per effect, only the sheet (R9).
 */
export function RealPage() {
  const { display, t } = useSettings()
  const [setup, update, { own, fromLink, linkKeys, useMine, save }] = useRealSetup()
  const [profile] = useRealProfile()
  const [station] = useStation()
  const now = useNow(station.model?.fetchedAt)
  const staleWeather = modelFreshness(station, now) === 'stale'
  const phone = useMedia(PHONE)
  const unit = display.angle

  const preset = useMemo(() => resolvePreset(PRESETS.find((p) => p.id === setup.presetId)!, own, linkKeys), [setup.presetId, own, linkKeys])
  const [calcOpen, setCalcOpen] = useState(false)
  const needHit = !phone || calcOpen
  const solution = useMemo(
    () => solveReal(preset, setup, profile, station, unit, { shares: calcOpen, hit: needHit }),
    [preset, setup, profile, station, unit, calcOpen, needHit],
  )
  // Hold mode: whether the hold point falls beyond the reticle, the way the scope view draws it.
  const offView = solution.reached && profile.mode === 'hold'
    && aimMark(solution.elevation, Math.abs(solution.windage), solution.windage < 0 ? -1 : 1, unit).clamped

  return (
    <RealView solution={solution} mode={profile.mode} distanceM={setup.distanceM} targetCm={setup.targetCm}
      windUnit={profile.windUnit} system={display.system} phone={phone} offView={offView} calcOpen={calcOpen} onCalc={setCalcOpen}
      station={<StationLine now={now} />} staleWeather={staleWeather}
      note={fromLink ? <>{t('real.fromLink')} <button type="button" className="real-note-btn" onClick={useMine}>{t('real.useMine')}</button></> : null}
      tags={<RealMenus setup={setup} update={update} preset={preset} own={own} save={save} station={station} />}
      bar={<BottomBar setup={setup} update={update} system={display.system} windUnit={profile.windUnit} phone={phone} />} />
  )
}
