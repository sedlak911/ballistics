import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../../App'
import { byName, gzw } from '../data'
import { workbenchAmmo } from '../workbench'

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}
const param = (k: string) => new URLSearchParams(window.location.hash.split('?')[1]).get(k)
const menu = (name: string) => screen.getByRole('dialog', { name })
const GUN = 'Barrel and accuracy'
const SCOPE = 'Scope and zero'
const scopeTag = () => screen.getByRole('button', { name: /^Scope:/ })

beforeEach(() => localStorage.setItem('gb.gzw.profile', JSON.stringify({ setupDone: true })))
afterEach(cleanup)

describe('Setup menus in the header', () => {
  it('picks the weapon from its tag, with its best round', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: /^Weapon: M700/ }))
    fireEvent.click(within(menu('Weapon')).getByRole('button', { name: 'SKS' }))
    expect(screen.queryByRole('dialog', { name: 'Weapon' })).not.toBeInTheDocument()
    const sks = byName(gzw.weapons, 'SKS')!
    expect(param('w')).toBe(sks.id)
    expect(param('am')).toBe(workbenchAmmo(gzw, sks)[0].id)
  })

  it('drops the accuracy read from the game when the weapon changes', () => {
    open('#/gzw/workbench?acc=0.95')
    fireEvent.click(screen.getByRole('button', { name: /^Weapon:/ }))
    fireEvent.click(within(menu('Weapon')).getByRole('button', { name: 'SKS' }))
    expect(window.location.hash).not.toMatch(/acc=0\.95/)
  })

  it('picks the round from its tag', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: /^Ammo: M80A1/ }))
    fireEvent.click(within(menu('Ammo')).getByRole('button', { name: /M61/ }))
    expect(param('am')).toBe(byName(gzw.ammo, '7.62x51mm AP (M61)')!.id)
    expect(screen.queryByRole('dialog', { name: 'Ammo' })).not.toBeInTheDocument()
  })

  it('opens the barrel and the real accuracy from the cog', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: GUN }))
    expect(within(menu(GUN)).getByRole('group', { name: 'Barrel' })).toBeInTheDocument()
    expect(within(menu(GUN)).getByLabelText(/Real accuracy/)).toBeInTheDocument()
    expect(within(menu(GUN)).queryByRole('group', { name: 'Scope' })).not.toBeInTheDocument()
    expect(within(menu(GUN)).queryByRole('group', { name: 'Zero' })).not.toBeInTheDocument()
  })

  it('opens the scope and the zero from the scope tag, in 50 m steps, and stays open while you pick', () => {
    open(`#/gzw/workbench?w=${byName(gzw.weapons, 'M4A1')!.id}&z=100`)
    fireEvent.click(scopeTag())
    expect(within(menu(SCOPE)).getByRole('group', { name: 'Scope' })).toBeInTheDocument()
    expect(within(menu(SCOPE)).queryByRole('group', { name: 'Barrel' })).not.toBeInTheDocument()
    fireEvent.click(within(menu(SCOPE)).getByRole('button', { name: 'Zero: more' }))
    expect(param('z')).toBe('150')
    expect(menu(SCOPE)).toBeInTheDocument()
    fireEvent.click(within(menu(SCOPE)).getByRole('button', { name: 'Zero: less' }))
    fireEvent.click(within(menu(SCOPE)).getByRole('button', { name: 'Zero: less' }))
    expect(param('z')).toBe('50')
  })

  it('starts the zero at 100 m on a long rifle', () => {
    open('#/gzw/workbench?z=100')
    fireEvent.click(scopeTag())
    expect(within(menu(SCOPE)).getByRole('button', { name: 'Zero: less' })).toBeDisabled()
  })

  it('keeps the zero within the scope', () => {
    open(`#/gzw/workbench?w=${byName(gzw.weapons, 'M16 A1')!.id}&z=600`)
    fireEvent.click(scopeTag())
    expect(within(menu(SCOPE)).getByRole('button', { name: 'Zero: more' })).toBeDisabled()
    const presets = within(within(menu(SCOPE)).getByRole('group', { name: 'Zero presets' })).getAllByRole('button')
    expect(presets.map((b) => parseInt(b.textContent!, 10)).every((m) => m <= 600)).toBe(true)
  })

  it('shows the zero in yards in imperial mode', () => {
    open('#/gzw/workbench?u=imperial&z=100')
    fireEvent.click(scopeTag())
    expect(within(within(menu(SCOPE)).getByRole('group', { name: 'Zero' })).getByRole('status')).toHaveTextContent(/yd$/)
  })

  it('marks the barrels whose muzzle-velocity modifier is unknown', () => {
    open(`#/gzw/workbench?w=${byName(gzw.weapons, 'M4A1')!.id}`)
    fireEvent.click(screen.getByRole('button', { name: GUN }))
    const rows = within(within(menu(GUN)).getByRole('group', { name: 'Barrel' })).getAllByRole('button')
    const row = (length: string) => rows.find((r) => r.textContent!.includes(`Barrel - ${length}`))!
    expect(row('20"')).not.toHaveTextContent('MV unknown')
    expect(row('16"')).toHaveTextContent('MV unknown')
  })

  it('leaves only the accuracy behind the cog for weapons without barrels, and lists a single scope', () => {
    open(`#/gzw/workbench?w=${byName(gzw.weapons, 'AK-12')!.id}`)
    fireEvent.click(screen.getByRole('button', { name: GUN }))
    expect(within(menu(GUN)).queryByRole('group', { name: 'Barrel' })).not.toBeInTheDocument()
    expect(within(menu(GUN)).getByLabelText(/Real accuracy/)).toBeInTheDocument()
    cleanup()
    open(`#/gzw/workbench?w=${byName(gzw.weapons, 'SVD')!.id}`)
    fireEvent.click(scopeTag())
    expect(within(within(menu(SCOPE)).getByRole('group', { name: 'Scope' })).getAllByRole('button')).toHaveLength(1)
  })

  it('writes the real accuracy into the link, with a decimal comma too', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: GUN }))
    fireEvent.change(within(menu(GUN)).getByLabelText(/Real accuracy/), { target: { value: '1,76' } })
    expect(param('acc')).toBe('1.76')
  })

  it('opens one menu at a time and gives the focus back to its tag on Escape', () => {
    open('#/gzw/workbench')
    const weapon = screen.getByRole('button', { name: /^Weapon:/ })
    fireEvent.click(weapon)
    fireEvent.click(screen.getByRole('button', { name: /^Ammo:/ }))
    expect(screen.queryByRole('dialog', { name: 'Weapon' })).not.toBeInTheDocument()
    expect(menu('Ammo')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: /^Ammo:/ })).toHaveFocus()
  })

  it('opens on the chosen weapon and marks only the tag whose menu is open', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: /^Weapon:/ }))
    expect(within(menu('Weapon')).getByRole('button', { name: 'M700' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: GUN }))
    expect(screen.getByRole('button', { name: GUN })).toHaveAttribute('aria-expanded', 'true')
    expect(scopeTag()).toHaveAttribute('aria-expanded', 'false')
  })
})
