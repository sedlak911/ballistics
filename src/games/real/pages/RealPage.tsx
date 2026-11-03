import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aimMark } from '../../../components/scopeGeometry'
import { Toast } from '../../../components/Toast'
import { PHONE, useMedia } from '../../../components/useMedia'
import { useToast } from '../../../components/useToast'
import { useSettings } from '../../../settings/SettingsContext'
import { BottomBar } from '../components/BottomBar'
import { RealMenus } from '../components/RealMenus'
import { RealView } from '../components/RealView'
import { StationLine } from '../components/StationLine'
import { PRESETS } from '../data/presets'
import { useRealProfile } from '../profile'
import { resetPatch, resolvePreset, type Overrides, type Section } from '../profiles'
import { useRealSetup } from '../setup'
import { solveReal } from '../solve'
import { useStation } from '../station'
import { modelFreshness } from '../components/stationText'
import { useNow } from '../components/useNow'

const WAS_RESET = { rifle: 'rs.wasReset.rifle', round: 'rs.wasReset.round', scope: 'rs.wasReset.scope' } as const

/**
 * REAL's one page: reads the setup, the preset's overrides (a shared link's on top), the profile and the station, solves the shot once per
 * change and hands the answer to the view. The hit chance costs four extra solves, so only a large screen or the open
 * calculation sheet asks for it; the shares, a run per effect, only the sheet (R9). It owns the page's one toast.
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

  const { toast, show, close, closeSticky } = useToast()
  // An Undo runs seconds after its reset, so it acts on the page as it is then, through the latest save (today's setup,
  // a link's values on screen or not). It runs only while it is the one on offer: a later reset replaces it, and a
  // change of preset withdraws it, even a change there and back, and closes the toast that offers it.
  const saveNow = useRef(save)
  const offered = useRef<Overrides | null>(null)
  useEffect(() => { saveNow.current = save })
  useEffect(() => {
    offered.current = null
    close()
  }, [setup.presetId, close])
  // A section reset is an edit like any other (spec §1): a link on screen is adopted first, so the other sections keep
  // their values.
  const reset = useCallback((s: Section) => {
    const { patch, undo } = resetPatch(own, s)
    save(patch)
    offered.current = undo
    show({
      text: t(WAS_RESET[s]),
      action: {
        label: t('toast.undo'),
        run: () => {
          if (offered.current !== undo) return
          offered.current = null
          saveNow.current(undo)
        },
      },
    })
  }, [own, save, show, t])

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
    <>
      <RealView solution={solution} mode={profile.mode} primary={profile.primary} distanceM={setup.distanceM} targetCm={setup.targetCm}
        windUnit={profile.windUnit} system={display.system} phone={phone} offView={offView} calcOpen={calcOpen} onCalc={setCalcOpen}
        station={<StationLine now={now} />} staleWeather={staleWeather}
        note={fromLink ? <>{t('real.fromLink')} <button type="button" className="real-note-btn" onClick={useMine}>{t('real.useMine')}</button></> : null}
        tags={<RealMenus setup={setup} update={update} preset={preset} own={own} save={save} station={station} onReset={reset} show={show} onSheetClosed={closeSticky} />}
        bar={<BottomBar setup={setup} update={update} system={display.system} windUnit={profile.windUnit} phone={phone} />} />
      <Toast toast={toast} onClose={close} closeLabel={t('toast.close')} />
    </>
  )
}
