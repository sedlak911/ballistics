import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../../App'
import { readingScale } from '../../../engine/ranging'
import { byId, byName, gzw } from '../data'
import { ratingsFor, topPenetratedClass } from '../penetration'
import { NIJ_CLASSES } from '../types'
import { workbenchAmmo } from '../workbench'

const M80A1 = byName(gzw.ammo, '7.62x51mm FMJ (M80A1)')!.id

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

afterEach(cleanup)

describe('Focus view', () => {
  it('opens with only the answer: verdict, hold and lead, armor line, no ammo rack', () => {
    open('#/gzw/workbench?d=300&mv=sprinting&h=mich-tc-2002-black')
    expect(screen.getByTestId('focus-verdict')).toHaveTextContent(/Close in to|No good shot/)
    expect(screen.getByTestId('focus-sentence')).toHaveTextContent(/Head: \d+ % chance to hit/)
    expect(screen.getByText('Hold over')).toBeInTheDocument()
    expect(screen.getByText('Lead')).toBeInTheDocument()
    expect(screen.getByTestId('focus-armor')).toHaveTextContent('Usually penetrates up to')
    expect(screen.queryAllByTestId('ammo-card')).toHaveLength(0)
  })

  it('shows the setup as tags', () => {
    open('#/gzw/workbench')
    expect(screen.getByTestId('setup-strip')).toHaveTextContent('M700')
    expect(screen.getByTestId('setup-strip')).toHaveTextContent('M80A1')
  })

  it('takes distance, a mil reading and movement from the toolbar', () => {
    open('#/gzw/workbench')
    fireEvent.click(within(screen.getByRole('group', { name: 'Range by' })).getByRole('button', { name: 'MIL' }))
    fireEvent.change(screen.getByLabelText('Standing figure (1.8 m) spans (MIL)'), { target: { value: String(readingScale(1.8, 36).toPos(6)) } })
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('300 m')
    fireEvent.click(screen.getByRole('button', { name: /Sprinting/ }))
    expect(window.location.hash).toContain('mv=sprinting')
  })

  it('has one view, whatever the link or the stored choice says', () => {
    localStorage.setItem('gb.display', JSON.stringify({ view: 'full' }))
    open('#/gzw/workbench?v=full')
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument()
    expect(screen.getByTestId('focus-verdict')).toBeInTheDocument()
    expect(screen.queryAllByTestId('ammo-card')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Change setup' })).not.toBeInTheDocument()
  })

  it('keeps only the aim zone beside the verdict, under its word; my stance lives in the toolbar', () => {
    open('#/gzw/workbench')
    const opts = screen.getByTestId('answer-opts')
    expect(opts).not.toHaveTextContent(/My hold|Me|Kneeling/)
    expect(within(opts).getByRole('group', { name: 'I aim for' })).toBeInTheDocument()
    expect(opts).toHaveTextContent(/^I aim forHeadChest$/)
  })

  it('changes the distance with the wheel over the scope, and only there', () => {
    localStorage.setItem('gb.gzw.profile', JSON.stringify({ setupDone: true }))
    open('#/gzw/workbench?d=300')
    const readout = () => screen.getByTestId('distance-readout')
    const scope = screen.getByRole('img', { name: /FFP/ })
    fireEvent.wheel(scope, { deltaY: -100 })
    expect(readout()).toHaveTextContent('310 m')
    fireEvent.wheel(scope, { deltaY: 30 })
    expect(readout()).toHaveTextContent('307 m')
    fireEvent.wheel(screen.getByTestId('focus-verdict'), { deltaY: -100 })
    expect(readout()).toHaveTextContent('307 m')
  })

  it('leaves the wheel to the page during the first visit', () => {
    localStorage.removeItem('gb.gzw.profile')
    open('#/gzw/workbench?d=300')
    expect(screen.getByRole('region', { name: 'First, your weapon' })).toBeInTheDocument()
    const notPrevented = fireEvent.wheel(screen.getByRole('img', { name: /FFP/ }), { deltaY: -100 })
    expect(notPrevented).toBe(true)
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('300 m')
  })

  it('stops the wheel at 1000 m', () => {
    localStorage.setItem('gb.gzw.profile', JSON.stringify({ setupDone: true }))
    open('#/gzw/workbench?d=995')
    fireEvent.wheel(screen.getByRole('img', { name: /FFP/ }), { deltaY: -100 })
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('1000 m')
  })

  it('colours a shoot verdict', () => {
    open('#/gzw/workbench?d=100&mv=standing&rs=3')
    expect(screen.getByTestId('focus-verdict')).toHaveTextContent('Shoot')
    expect(screen.getByTestId('focus-verdict')).toHaveClass('v-shoot')
  })

  it('shows the setup in the header', () => {
    open('#/gzw/workbench')
    expect(within(screen.getByRole('banner')).getByTestId('setup-strip')).toHaveTextContent('M700')
  })

  it('switches the answer to the chest', () => {
    open('#/gzw/workbench')
    fireEvent.click(within(screen.getByRole('group', { name: 'I aim for' })).getByRole('button', { name: 'Chest' }))
    expect(screen.getByTestId('focus-sentence').textContent).toMatch(/^Chest:/)
    expect(localStorage.getItem('gb.gzw.profile')).toContain('"aimZone":"chest"')
  })

  it('shows the toughest class the round usually penetrates, with no armor to pick', () => {
    open('#/gzw/workbench?d=100&h=mich-tc-2002-black&t=none')
    const line = screen.getByTestId('focus-armor')
    const top = topPenetratedClass(ratingsFor(byId(gzw.ammo, M80A1)!).ratings)!
    expect(line.querySelector('.c')).toHaveTextContent(new RegExp(`^${NIJ_CLASSES[top].replace(/\+/g, '\\+')}$`))
    expect(line.textContent).toMatch(new RegExp(`^Usually penetrates up to ?${NIJ_CLASSES[top].replace(/\+/g, '\\+')}`))
    expect(within(line).queryAllByRole('button')).toHaveLength(0)
    expect(within(screen.getByRole('banner')).queryByText(/^(Head|Chest)$/)).not.toBeInTheDocument()
    // Old armor keys are ignored, and the next change writes a link without them.
    fireEvent.click(screen.getByRole('button', { name: /±20 %/ }))
    expect(window.location.hash).not.toMatch(/[?&](h|t)=/)
  })

  it('says so when the round usually penetrates no class', () => {
    open('#/gzw/workbench?w=sks&am=7.62x39mm-sp&d=100')
    const line = screen.getByTestId('focus-armor')
    expect(line.querySelector('.c')).toHaveTextContent('none')
    expect(line).toHaveTextContent("Doesn't usually penetrate class I")
  })

  it('starts from a weapon pick, with its best round', () => {
    localStorage.removeItem('gb.gzw.profile')
    open('#/gzw/workbench')
    const first = screen.getByRole('region', { name: 'First, your weapon' })
    expect(first).toHaveTextContent(/character.*inventory.*weapon detail/i)
    expect(within(first).getByRole('button', { name: 'Import from clipboard (Ctrl+V)' })).toBeInTheDocument()
    fireEvent.click(within(first).getByRole('button', { name: 'SKS' }))
    expect(screen.queryByRole('region', { name: 'First, your weapon' })).not.toBeInTheDocument()
    expect(screen.getByTestId('setup-strip')).toHaveTextContent('SKS')
    const sks = byName(gzw.weapons, 'SKS')!
    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('am')).toBe(workbenchAmmo(gzw, sks)[0].id)
    expect(localStorage.getItem('gb.gzw.profile')).toContain('"setupDone":true')
  })

  it('brings the best round with the weapon the first visit already shows', () => {
    localStorage.removeItem('gb.gzw.profile')
    localStorage.removeItem('gb.gzw.setup')
    open('#/gzw/workbench')
    fireEvent.click(within(screen.getByRole('region', { name: 'First, your weapon' })).getByRole('button', { name: 'M700' }))
    const m700 = byName(gzw.weapons, 'M700')!
    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('am')).toBe(workbenchAmmo(gzw, m700)[0].id)
  })

  it('weakens penetration as the round loses energy with distance', () => {
    localStorage.setItem('gb.gzw.profile', JSON.stringify({ aimZone: 'chest', setupDone: true }))
    open('#/gzw/workbench?d=100')
    const near = screen.getByTestId('focus-armor').querySelector('.c')!.textContent
    cleanup()
    open('#/gzw/workbench?d=600')
    const far = screen.getByTestId('focus-armor')
    expect(far.querySelector('.c')!.textContent).not.toBe(near)
    expect(far).toHaveTextContent(/At 600 m: ≈ \d+ % of its energy at 150 m, where pen data ends/)
  })

  it('rates armor as charted within typical engagement distances', () => {
    localStorage.setItem('gb.gzw.profile', JSON.stringify({ aimZone: 'chest', setupDone: true }))
    open('#/gzw/workbench?d=200')
    const armor = screen.getByTestId('focus-armor')
    const top = topPenetratedClass(ratingsFor(byId(gzw.ammo, M80A1)!).ratings)!
    expect(armor.querySelector('.c')).toHaveTextContent(NIJ_CLASSES[top])
    expect(armor).not.toHaveTextContent(/energy/)
  })

  it('imports a screenshot from Focus too', () => {
    open('#/gzw/workbench')
    expect(screen.getByRole('button', { name: 'Import from clipboard (Ctrl+V)' })).toBeInTheDocument()
  })
})
