import { useRef, useState } from 'react'
import { ChipGroup } from '../../../components/ChipGroup'
import { ListPicker } from '../../../components/ListPicker'
import { Popover } from '../../../components/Popover'
import { Stepper } from '../../../components/Stepper'
import { fmtDistance } from '../../../format'
import { useSettings } from '../../../settings/SettingsContext'
import type { Setup } from '../../../settings/url'
import { shortAmmo } from '../data'
import { ratingsFor } from '../penetration'
import { zeroRange } from '../setup'
import type { GzwAmmo, GzwBarrel, GzwScope, GzwWeapon } from '../types'
import { PenStrip } from './PenStrip'
import './menus.css'

const ZERO_PRESETS = [100, 200, 300]
type Menu = 'weapon' | 'ammo' | 'gun' | 'scope'

function CogIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M16.1 8.1L18.5 8.8L18.5 11.2L16.1 11.9L15.7 13L16.9 15.2L15.2 16.9L13 15.7L11.9 16.1L11.2 18.5L8.8 18.5L8.1 16.1L7 15.7L4.8 16.9L3.1 15.2L4.3 13L3.9 11.9L1.5 11.2L1.5 8.8L3.9 8.1L4.3 7L3.1 4.8L4.8 3.1L7 4.3L8.1 3.9L8.8 1.5L11.2 1.5L11.9 3.9L13 4.3L15.2 3.1L16.9 4.8L15.7 7Z" />
      <circle cx="10" cy="10" r="2.6" />
    </svg>
  )
}

/**
 * The setup as tags that open small menus: the weapon; behind its cog the barrel and the accuracy read from the game;
 * the round; the scope and its zero. One menu at a time; picking a weapon or a round closes its menu.
 */
export function SetupMenus({ setup, update, weapons, weapon, barrels, barrel, scopes, scope, ammoList, ammo }: {
  setup: Setup
  update: (patch: Partial<Setup>) => void
  weapons: GzwWeapon[]
  weapon: GzwWeapon
  barrels: GzwBarrel[]
  barrel: GzwBarrel | null
  scopes: GzwScope[]
  scope: GzwScope
  ammoList: GzwAmmo[]
  ammo: GzwAmmo
}) {
  const { display, t } = useSettings()
  const sys = display.system
  const [open, setOpen] = useState<Menu | null>(null)
  const weaponTag = useRef<HTMLButtonElement>(null)
  const ammoTag = useRef<HTMLButtonElement>(null)
  const cogTag = useRef<HTMLButtonElement>(null)
  const scopeTag = useRef<HTMLButtonElement>(null)
  const toggle = (m: Menu) => setOpen((o) => (o === m ? null : m))
  const close = () => setOpen(null)

  // The accuracy field keeps its own text while typing ("1." is not a number yet) and resets when the setup changes elsewhere.
  const [accField, setAccField] = useState({ text: setup.accuracyMoa?.toString() ?? '', from: setup.accuracyMoa })
  if (accField.from !== setup.accuracyMoa) setAccField({ text: setup.accuracyMoa?.toString() ?? '', from: setup.accuracyMoa })
  const onAccuracy = (text: string) => {
    const n = Number(text.replace(',', '.'))
    const value = text.trim() === '' ? null : Number.isFinite(n) && n > 0 && !/[.,]$/.test(text) ? n : undefined
    setAccField({ text, from: value === undefined ? setup.accuracyMoa : value })
    if (value !== undefined) update({ accuracyMoa: value })
  }

  // The barrel by its length on the tag, e.g. M700 · 22".
  const barrelLength = barrel?.name.match(/[\d.]+"/)?.[0]
  const weaponText = `${weapon.name}${barrelLength ? ` · ${barrelLength}` : ''}`
  const scopeText = `${scope.name} · ${t('wb.zero')} ${fmtDistance(setup.zeroM, sys)}`
  const zero = zeroRange(weapon, scope)
  const tagProps = (m: Menu) => ({ type: 'button' as const, 'aria-haspopup': 'dialog' as const, 'aria-expanded': open === m })

  return (
    <>
      <span className="tag-pair">
        <button ref={weaponTag} className="tag tag-btn" {...tagProps('weapon')} aria-label={`${t('wb.weapon')}: ${weaponText}`}
          onClick={() => toggle('weapon')}>
          <b>{weapon.name}</b>{barrelLength && ` · ${barrelLength}`}
        </button>
        <button ref={cogTag} className="tag tag-btn cog" {...tagProps('gun')} aria-label={t('menu.gun')} title={t('menu.gun')}
          onClick={() => toggle('gun')}>
          <CogIcon />
        </button>
      </span>
      <button ref={ammoTag} className="tag tag-btn" {...tagProps('ammo')} aria-label={`${t('wb.ammo')}: ${shortAmmo(ammo)}`}
        onClick={() => toggle('ammo')}>
        <b>{shortAmmo(ammo)}</b>
      </button>
      <button ref={scopeTag} className="tag tag-btn" {...tagProps('scope')} aria-label={`${t('wb.scope')}: ${scopeText}`}
        onClick={() => toggle('scope')}>
        {scope.name} · {t('wb.zero')} <b>{fmtDistance(setup.zeroM, sys)}</b>
      </button>

      <Popover open={open === 'weapon'} onClose={close} anchorRef={weaponTag} label={t('wb.weapon')} className="weapon-menu">
        <ChipGroup label={t('wb.weapon')} value={weapon.id} onChange={(id) => { update({ weaponId: id }); close() }}
          options={weapons.map((w) => ({ value: w.id, label: w.name, title: w.caliber ?? undefined }))} />
      </Popover>

      <Popover open={open === 'ammo'} onClose={close} anchorRef={ammoTag} label={t('wb.ammo')} className="ammo-menu">
        <ListPicker label={t('wb.ammo')} value={ammo.id} onChange={(id) => { update({ ammoId: id }); close() }}
          filterLabel={t('pick.filterIn', { what: t('wb.ammo') })} noMatch={t('pick.noMatch')} maxRows={8}
          items={ammoList.map((a) => {
            const pen = ratingsFor(a)
            return { id: a.id, label: shortAmmo(a), after: <PenStrip ratings={pen.ratings} unknown={pen.source === 'none'} /> }
          })} />
      </Popover>

      <Popover open={open === 'gun'} onClose={close} anchorRef={cogTag} label={t('menu.gun')} className="parts-menu">
        {barrels.length > 0 && (
          <div className="field">
            <span className="label">{t('wb.barrel')}</span>
            <ListPicker label={t('wb.barrel')} value={barrel?.id ?? null} onChange={(id) => update({ barrelId: id })}
              filterLabel={t('pick.filterIn', { what: t('wb.barrel') })} noMatch={t('pick.noMatch')} maxRows={4}
              items={barrels.map((b) => ({
                id: b.id, label: b.name.replace(weapon.name, '').trim() || b.name, meta: b.accuracyMoa !== null ? `${b.accuracyMoa} MOA` : undefined,
                // No source gives this barrel's speed change, so the round's own speed is used as it is.
                tag: b.velocityModifierPct === null ? t('wb.mvUnknown') : undefined, tagMuted: true,
              }))} />
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="read-accuracy">{t('wb.readAccuracy')}</label>
          <span className="inline">
            <input id="read-accuracy" type="text" inputMode="decimal" value={accField.text}
              placeholder={(barrel?.accuracyMoa ?? weapon.accuracyMoa)?.toFixed(2) ?? '—'} onChange={(e) => onAccuracy(e.target.value)} />
            {setup.accuracyMoa !== null && (
              <button type="button" className="btn ghost" onClick={() => onAccuracy('')}>{t('wb.clear')}</button>
            )}
          </span>
          <span className="hint">{t('wb.readAccuracyHint')}</span>
        </div>
      </Popover>

      <Popover open={open === 'scope'} onClose={close} anchorRef={scopeTag} label={t('menu.scope')} className="parts-menu">
        <div className="field">
          <span className="label">{t('wb.scope')}</span>
          <ListPicker label={t('wb.scope')} value={scope.id} onChange={(id) => update({ scopeId: id })}
            filterLabel={t('pick.filterIn', { what: t('wb.scope') })} noMatch={t('pick.noMatch')} maxRows={4}
            items={scopes.map((s) => ({ id: s.id, label: s.name, tag: s.ffp ? 'FFP' : 'SFP' }))} />
          <span className="hint">
            {scope.ffp ? t('wb.ffp') : t('wb.sfp')}
            {scope.maxZeroM !== null && <> · {t('wb.maxZero', { d: fmtDistance(scope.maxZeroM, sys) })}</>}
          </span>
        </div>
        <div className="field">
          <span className="label">{t('wb.zero')}</span>
          <div className="zero-row">
            <Stepper label={t('wb.zero')} value={setup.zeroM} min={zero.minM} max={zero.maxM} step={zero.stepM} format={(m) => fmtDistance(m, sys)}
              onChange={(z) => update({ zeroM: z })} decLabel={t('step.dec', { what: t('wb.zero') })} incLabel={t('step.inc', { what: t('wb.zero') })} />
            <ChipGroup label={t('wb.zeroPresets')} value={setup.zeroM} onChange={(z) => update({ zeroM: z })}
              options={ZERO_PRESETS.filter((z) => z >= zero.minM && z <= zero.maxM).map((z) => ({ value: z, label: fmtDistance(z, sys) }))} />
          </div>
        </div>
      </Popover>
    </>
  )
}
