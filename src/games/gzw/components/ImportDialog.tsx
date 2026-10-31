import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../../../settings/SettingsContext'
import { gzw } from '../data'
import { fastestWeapon, onBench } from '../ocr/apply'
import type { OcrFindings } from '../ocr/parse'
import type { GzwAmmo, GzwBarrel, GzwScope, GzwWeapon } from '../types'
import { workbenchAmmo } from '../workbench'
import './import.css'

export interface ImportSelection {
  weapon: GzwWeapon | null
  barrel: GzwBarrel | null
  scope: GzwScope | null
  accuracyMoa: number | null
  ammo: GzwAmmo | null
}

/**
 * What the screenshot showed; nothing changes until "Use". Several weapons are a choice, the fastest preselected, and
 * the round is one choice among those found that fit it, the best preselected. Parts and the read accuracy show only
 * for the weapon they belong to.
 */
export function ImportDialog({ findings, currentWeapon, onApply, onClose }: {
  findings: OcrFindings
  currentWeapon: GzwWeapon
  onApply: (s: ImportSelection) => void
  onClose: () => void
}) {
  const { t } = useSettings()
  const { weapons, barrels, scopes, accuracyMoa, ammo, ambiguous, unknown } = findings
  const bench = weapons.filter(onBench)
  const sure = ammo.map((a) => a.ammo)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [weaponId, setWeaponId] = useState(() => fastestWeapon(bench, { barrels, ammo: sure })?.id)
  const [roundIds, setRoundIds] = useState<Record<string, string>>({})
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const on = (key: string) => !off.has(key)
  const toggle = (key: string) => setOff((s) => {
    const next = new Set(s)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const row = (key: string, text: string) => (
    <label key={key} className="imp-row">
      <input type="checkbox" checked={on(key)} onChange={() => toggle(key)} />
      <span>{text}</span>
    </label>
  )

  const weapon = bench.length === 1 ? (on('weapon') ? bench[0] : null) : bench.find((w) => w.id === weaponId) ?? null
  const target = weapon ?? currentWeapon
  const barrel = barrels.find((b) => target.barrelIds.includes(b.id)) ?? null
  const scope = scopes.find((s) => target.scopeIds.includes(s.id)) ?? null
  // The accuracy is read off one weapon's panel: the one its parts fit, or the only weapon on the screen.
  const byParts = weapons.filter((w) => barrels.some((b) => w.barrelIds.includes(b.id)) || scopes.some((s) => w.scopeIds.includes(s.id)))
  const owner = byParts.length === 1 ? byParts[0] : weapons.length === 1 ? weapons[0] : null
  const accuracy = accuracyMoa !== null && (weapons.length === 0 || owner?.id === target.id) ? accuracyMoa : null
  // Unsure labels offer every round they could be; only a sure one is preselected.
  const found = new Set([...sure, ...ambiguous.flatMap((a) => a.candidates)].map((a) => a.id))
  const rounds = workbenchAmmo(gzw, target).filter((a) => found.has(a.id))
  const roundId = roundIds[target.id] ?? rounds.find((a) => sure.some((s) => s.id === a.id))?.id ?? ''
  const stacks = (a: GzwAmmo) => ammo.find((x) => x.ammo.id === a.id)?.stacks
  const offBench = weapons.filter((w) => !onBench(w))
  const unfit = rounds.length > 0 ? [] : [...sure.map((a) => a.name), ...ambiguous.map((a) => a.label)]
  const offered = bench.length > 0 || barrel !== null || scope !== null || accuracy !== null || rounds.length > 0

  const apply = () => onApply({
    weapon,
    barrel: barrel && on('barrel') ? barrel : null,
    scope: scope && on('scope') ? scope : null,
    accuracyMoa: accuracy !== null && on('accuracy') ? accuracy : null,
    ammo: rounds.find((a) => a.id === roundId) ?? null,
  })

  const radios = (name: string, label: string, options: { id: string; text: string }[], value: string, pick: (id: string) => void) => (
    <div className="imp-pick" role="radiogroup" aria-labelledby={`${name}-label`}>
      <span id={`${name}-label`}>{label}</span>
      {options.map((o) => (
        <label key={o.id} className="imp-row">
          <input type="radio" name={name} checked={value === o.id} onChange={() => pick(o.id)} />
          <span>{o.text}</span>
        </label>
      ))}
    </div>
  )

  // On <body>, so no sticky or stacked column it was opened from can paint over it.
  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <h3 id="imp-title" className="h-panel">{t('imp.title')}</h3>
        {!offered && offBench.length === 0 && unfit.length === 0 ? <p className="note">{t('imp.nothing')}</p> : offered && (
          <div className="imp-list">
            {bench.length === 1 && row('weapon', `${t('imp.weapon')}: ${bench[0].name}`)}
            {bench.length > 1 && radios('imp-weapon', t('imp.weapon'), bench.map((w) => ({ id: w.id, text: w.name })), weapon?.id ?? '', setWeaponId)}
            {barrel && row('barrel', `${t('imp.barrel')}: ${barrel.name}`)}
            {scope && row('scope', `${t('imp.scope')}: ${scope.name}`)}
            {accuracy !== null && row('accuracy', `${t('imp.accuracy')}: ${accuracy} MOA`)}
            {rounds.length > 0 && radios('imp-round', t('imp.round'), [
              ...rounds.map((a) => ({ id: a.id, text: stacks(a) ? `${a.name} · ${stacks(a)}×` : a.name })),
              { id: '', text: t('imp.keep') },
            ], roundId, (id) => setRoundIds((r) => ({ ...r, [target.id]: id })))}
          </div>
        )}
        {offBench.length > 0 && <p className="note">{t('imp.notOnBench', { list: offBench.map((w) => w.name).join(', ') })}</p>}
        {unfit.length > 0 && <p className="note">{t('imp.noFit', { weapon: target.name, list: unfit.join(', ') })}</p>}
        {unknown.length > 0 && <p className="note">{t('imp.unknown', { list: unknown.join(', ') })}</p>}
        <div className="imp-actions">
          <button ref={closeRef} type="button" className="btn ghost" onClick={onClose}>{t('imp.close')}</button>
          {offered && <button type="button" className="btn primary" onClick={apply}>{t('imp.use')}</button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
