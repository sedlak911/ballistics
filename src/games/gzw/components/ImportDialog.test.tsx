import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { parseHash } from '../../../router'
import { byName, gzw } from '../data'
import type { OcrFindings } from '../ocr/parse'
import { ImportDialog } from './ImportDialog'

const empty: OcrFindings = { weapons: [], barrels: [], scopes: [], accuracyMoa: null, ammo: [], ambiguous: [], unknown: [] }
const m855 = byName(gzw.ammo, '5.56x45mm AP (M855)')!
const m855a1 = byName(gzw.ammo, '5.56x45mm AP (M855A1)')!
const m4a1 = byName(gzw.weapons, 'M4A1')!
const m700 = byName(gzw.weapons, 'M700')!
const findings: OcrFindings = {
  ...empty,
  weapons: [m4a1],
  accuracyMoa: 1.76,
  ammo: [{ ammo: m855, stacks: 9 }],
  ambiguous: [{ label: 'M855..', candidates: [m855, m855a1] }],
  unknown: ['MK18'],
}

function show(f: OcrFindings, onApply = vi.fn()) {
  render(
    <SettingsProvider route={parseHash('#/gzw/workbench')} navigate={() => {}}>
      <ImportDialog findings={f} currentWeapon={m700} onApply={onApply} onClose={() => {}} />
    </SettingsProvider>,
  )
  return onApply
}

afterEach(cleanup)

describe('ImportDialog', () => {
  it('opens over the whole page, outside the column that hosts the import button', () => {
    const { container } = render(
      <SettingsProvider route={parseHash('#/gzw/workbench')} navigate={() => {}}>
        <ImportDialog findings={findings} currentWeapon={m700} onApply={vi.fn()} onClose={() => {}} />
      </SettingsProvider>,
    )
    expect(container).not.toContainElement(screen.getByRole('dialog'))
  })

  it('says when the bench cannot show the weapon it found', () => {
    show({ ...empty, weapons: [byName(gzw.weapons, 'AKM')!], accuracyMoa: 3.5 })
    expect(screen.getByRole('dialog')).toHaveTextContent(/can’t show AKM/)
  })

  it('lists what it found, ticked, and applies only what stays ticked', () => {
    const onApply = show(findings)
    expect(screen.getByRole('checkbox', { name: /M4A1/ })).toBeChecked()
    expect(screen.getByText(/MK18/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /1\.76/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(onApply).toHaveBeenCalledWith({ weapon: m4a1, barrel: null, scope: null, accuracyMoa: null, ammo: m855 })
  })

  it('offers an unsure label’s rounds without choosing one for you', () => {
    const onApply = show({ ...findings, ammo: [] })
    const rounds = within(screen.getByRole('radiogroup', { name: 'Round' }))
    expect(rounds.getByRole('radio', { name: /M855A1/ })).not.toBeChecked()
    expect(rounds.getByRole('radio', { name: 'keep the current one' })).toBeChecked()
    fireEvent.click(rounds.getByRole('radio', { name: /M855A1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ ammo: m855a1 }))
  })

  it('offers each weapon and the rounds that fit the chosen one, the fastest and the best preselected', () => {
    const m61 = byName(gzw.ammo, '7.62x51mm AP (M61)')!
    const m80a1 = byName(gzw.ammo, '7.62x51mm FMJ (M80A1)')!
    const onApply = show({
      ...empty,
      weapons: [m700, m4a1, byName(gzw.weapons, 'Glock 17')!],
      accuracyMoa: 1.76,
      ammo: [{ ammo: m855, stacks: 4 }, { ammo: m80a1, stacks: 2 }, { ammo: m61, stacks: 1 }],
    })
    const weapons = within(screen.getByRole('radiogroup', { name: 'Weapon' }))
    expect(weapons.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['M700', 'M4A1'])
    expect(weapons.getByRole('radio', { name: 'M4A1' })).toBeChecked()
    const rounds = () => within(screen.getByRole('radiogroup', { name: 'Round' }))
    expect(rounds().getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([`${m855.name} · 4×`, 'keep the current one'])
    expect(rounds().getByRole('radio', { name: /M855/ })).toBeChecked()
    // Several weapons and nothing tells whose panel the accuracy came from: it is not offered.
    expect(screen.queryByRole('checkbox', { name: /1\.76/ })).not.toBeInTheDocument()

    fireEvent.click(weapons.getByRole('radio', { name: 'M700' }))
    expect(rounds().getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
      `${m61.name} · 1×`, `${m80a1.name} · 2×`, 'keep the current one',
    ])
    expect(rounds().getByRole('radio', { name: /M61/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(onApply).toHaveBeenCalledWith({ weapon: m700, barrel: null, scope: null, accuracyMoa: null, ammo: m61 })
  })

  it('applies a barrel, and the accuracy read beside it, only to the weapon the barrel fits', () => {
    const barrel16 = byName(gzw.barrels, 'AR-15 Barrel - 16"')!
    show({ ...empty, weapons: [m700, m4a1], barrels: [barrel16], accuracyMoa: 1.76 })
    fireEvent.click(screen.getByRole('radio', { name: 'M700' }))
    expect(screen.queryByRole('checkbox', { name: /AR-15/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /1\.76/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'M4A1' }))
    expect(screen.getByRole('checkbox', { name: /AR-15/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /1\.76/ })).toBeChecked()
  })

  it('names the rounds it found when none fits the weapon', () => {
    show({ ...empty, ammo: [{ ammo: m855, stacks: 3 }], ambiguous: [{ label: 'M855..', candidates: [m855, m855a1] }] })
    expect(screen.getByRole('dialog')).toHaveTextContent('None of the rounds found fits the M700: 5.56x45mm AP (M855), M855..')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Nothing recognised')
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument()
  })

  it('says so when nothing was recognised and offers nothing to apply', () => {
    show(empty)
    expect(screen.getByRole('dialog')).toHaveTextContent('Nothing recognised')
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument()
  })
})
