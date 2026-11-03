import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { aimMark } from '../../../components/scopeGeometry'
import { Toast } from '../../../components/Toast'
import { PHONE, useMedia } from '../../../components/useMedia'
import { useToast } from '../../../components/useToast'
import type { TKey } from '../../../i18n'
import { useSettings } from '../../../settings/SettingsContext'
import { BottomBar } from '../components/BottomBar'
import { RealMenus, type SheetAt } from '../components/RealMenus'
import { RealView, type AskLine } from '../components/RealView'
import { StationLine } from '../components/StationLine'
import type { ItemKind } from '../library'
import { useRealProfile } from '../profile'
import { resetPatch, type Section } from '../profiles'
import { deleteFallback, useSelection, type FieldRef } from '../selection'
import { useRealSetup, type RealSetup } from '../setup'
import { solveReal } from '../solve'
import { useStation } from '../station'
import { modelFreshness } from '../components/stationText'
import { useNow } from '../components/useNow'

const WAS_RESET = { rifle: 'rs.wasReset.rifle', round: 'rs.wasReset.round', scope: 'rs.wasReset.scope' } as const
const DELETED = { rifle: 'lib.deleted.rifle', round: 'lib.deleted.round', scope: 'lib.deleted.scope' } as const
const LINK_MISSING = { rifle: 'lib.linkMissing.rifle', round: 'lib.linkMissing.round', scope: 'lib.linkMissing.scope' } as const

/** The setup fields that name the selection, which a delete moves and its Undo puts back. */
type Chosen = Pick<RealSetup, 'presetId' | 'roundId' | 'scopeId' | 'customRifleId'>

/**
 * REAL's one page: reads the setup, the selection (a built-in preset with its overrides, a shared link's on top, or
 * custom items), the profile and the station, solves the shot once per change and hands the answer to the view. The hit
 * chance costs four extra solves, so only a large screen or the open calculation sheet asks for it; the shares, a run
 * per effect, only the sheet (R9). It owns the page's one toast.
 */
export function RealPage() {
  const { display, t } = useSettings()
  const [setup, setSetup, po, fromUrl] = useRealSetup()
  const { own, fromLink, useMine } = po
  // `update` and `savePreset` drop a link's unknown ids with the first change (selection.ts dropUnknown).
  const { sel, library, actions, save, update, savePreset } = useSelection(setup, setSetup, po, fromUrl)
  const [profile] = useRealProfile()
  const [station] = useStation()
  const now = useNow(station.model?.fetchedAt)
  const staleWeather = modelFreshness(station, now) === 'stale'
  const phone = useMedia(PHONE)
  const unit = display.angle

  const { toast, show, close, closeSticky } = useToast()
  // An Undo runs seconds after its reset or delete, so it acts on the page as it is then, through the latest save and
  // update (today's setup, a link's values on screen or not). It runs only while it is the one on offer: a later reset
  // or delete replaces it, and a change of preset or round withdraws it, even a change there and back, and closes the
  // toast that offers it. A delete's own fallback is the one change that doesn't: `fellBack` holds the preset and
  // round it moved to, and the next change skips the withdrawal only if it is that one. Resets exist only on a
  // built-in round (Ruling 6), so they go to its preset overrides.
  const saveNow = useRef(savePreset)
  const updateNow = useRef(setSetup)
  const offered = useRef<object | null>(null)
  const fellBack = useRef<Pick<RealSetup, 'presetId' | 'roundId'> | null>(null)
  useEffect(() => {
    saveNow.current = savePreset
    updateNow.current = setSetup
  })
  useEffect(() => {
    const moved = fellBack.current
    fellBack.current = null
    if (moved !== null && moved.presetId === setup.presetId && moved.roundId === setup.roundId) return
    offered.current = null
    close()
  }, [setup.presetId, setup.roundId, close])
  // A section reset is an edit like any other (spec §1): a link on screen is adopted first, so the other sections keep
  // their values.
  const reset = useCallback((s: Section) => {
    const { patch, undo } = resetPatch(own, s)
    savePreset(patch)
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
  }, [own, savePreset, show, t])

  // A delete takes the selected item of its kind, and a rifle its rounds and scopes too (library.ts remove); the
  // selection falls back (selection.ts deleteFallback). Its Undo puts the entries back first, so the selection that was
  // on screen resolves to them again. It moves the setup as it is, unknown ids and all, so `fellBack` names the move.
  const deleteItem = useCallback((kind: ItemKind) => {
    const item = kind === 'rifle' ? sel.rifle : kind === 'round' ? sel.round : sel.scope
    if (item === null) return
    const was: Chosen = { presetId: setup.presetId, roundId: setup.roundId, scopeId: setup.scopeId, customRifleId: setup.customRifleId }
    const next = { ...was, ...deleteFallback(sel, kind, library) }
    const removed = actions.remove(kind, item.id)
    if (next.presetId !== was.presetId || next.roundId !== was.roundId) fellBack.current = { presetId: next.presetId, roundId: next.roundId }
    setSetup(next)
    offered.current = removed
    show({
      text: t(DELETED[kind]),
      action: {
        label: t('toast.undo'),
        run: () => {
          if (offered.current !== removed) return
          offered.current = null
          actions.restore(removed)
          updateNow.current(was)
        },
      },
    })
  }, [sel, setup, library, actions, setSetup, show, t])

  // The settings sheet, opened by a tag or by a line of the main screen, at a section.
  const [sheet, setSheet] = useState<SheetAt | null>(null)
  const openAt = (section: Section) => (returnFocus: RefObject<HTMLElement | null>) => setSheet({ section, returnFocus })
  // The fields a line names, each once (two items can each lack a name).
  const names = (refs: FieldRef[]) => [...new Set(refs.map((f) => t(`lib.f.${f.key}` as TKey)))].join(', ')

  // An incomplete selection isn't solved: its preset holds placeholders, which nobody is meant to read. The page shows
  // only the line naming what is missing, and a calculation sheet open on the answer before closes.
  const preset = sel.preset
  const complete = sel.incomplete.length === 0
  const [calcOpen, setCalcOpen] = useState(false)
  if (calcOpen && !complete) setCalcOpen(false)
  const needHit = !phone || calcOpen
  const solution = useMemo(
    () => complete ? solveReal(preset, setup, profile, station, unit, { shares: calcOpen, hit: needHit }) : null,
    [complete, preset, setup, profile, station, unit, calcOpen, needHit],
  )
  // Hold mode: whether the hold point falls beyond the reticle, the way the scope view draws it.
  const offView = solution !== null && solution.reached && profile.mode === 'hold'
    && aimMark(solution.elevation, Math.abs(solution.windage), solution.windage < 0 ? -1 : 1, unit).clamped

  // The new lines are at most two: the incomplete line or the add line (never both), and the wind note.
  const incomplete: AskLine | null = complete ? null
    : { text: t('lib.toCompute', { fields: names(sel.incomplete) }), open: openAt(sel.incomplete[0].section) }
  const addMore: AskLine | null = !complete || sel.unset.length === 0 ? null
    : { text: t('lib.morePrecise', { fields: names(sel.unset.slice(0, 4)) }), open: openAt(sel.unset[0].section) }

  // Under the tags: what a link from another device names that this one doesn't have, then a link's values. Both show
  // only for an unknown scope beside a built-in round's `o=` (a custom round ignores `o=`).
  const missing = sel.linkMissing === null ? null : t(LINK_MISSING[sel.linkMissing])
  const linkValues = fromLink ? <>{t('real.fromLink')} <button type="button" className="real-note-btn" onClick={useMine}>{t('real.useMine')}</button></> : null
  const note = missing !== null && linkValues !== null ? <>{missing}<br />{linkValues}</> : missing ?? linkValues

  return (
    <>
      <RealView solution={solution} mode={profile.mode} primary={profile.primary} distanceM={setup.distanceM} targetCm={setup.targetCm}
        windUnit={profile.windUnit} system={display.system} phone={phone} offView={offView} customScope={sel.scope !== null} calcOpen={calcOpen} onCalc={setCalcOpen}
        station={<StationLine now={now} />} staleWeather={staleWeather} incomplete={incomplete} addMore={addMore} windUnset={!setup.windSet}
        note={note}
        tags={<RealMenus setup={setup} update={update} sel={sel} own={own} save={save} station={station} sheet={sheet} onSheet={setSheet}
          onReset={reset} onDelete={deleteItem} show={show} onSheetClosed={closeSticky} />}
        bar={<BottomBar setup={setup} update={update} system={display.system} windUnit={profile.windUnit} phone={phone} />} />
      <Toast toast={toast} onClose={close} closeLabel={t('toast.close')} />
    </>
  )
}
