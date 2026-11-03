import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'

function open(hash = '#/real/workbench?p=p7&d=800') {
  window.location.hash = hash
  return render(<App />)
}

type Title = 'Rifle' | 'Round' | 'Scope'
type Items = { rifles: Record<string, unknown>[]; rounds: Record<string, unknown>[]; scopes: Record<string, unknown>[] }
const tag = (name: RegExp) => within(screen.getByTestId('real-strip')).getByRole('button', { name })
const sheet = () => screen.getByRole('dialog', { name: 'Settings' })
const section = (title: Title) => within(sheet()).getByRole('region', { name: title })
const lib = () => JSON.parse(localStorage.getItem('gb.real.library')!) as Items
const seed = (l: Partial<Items>) => localStorage.setItem('gb.real.library', JSON.stringify({ v: 1, rifles: [], rounds: [], scopes: [], ...l }))
/** A field's box by its label word, with or without the `optional` mark after it. */
const input = (s: HTMLElement, label: string) =>
  within(s).getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}( optional)?$`)) as HTMLInputElement
const type = (el: HTMLElement, text: string) => {
  fireEvent.change(el, { target: { value: text } })
  fireEvent.blur(el)
}
const button = (s: HTMLElement, name: string | RegExp) => within(s).getByRole('button', { name })
const alerts = (s: HTMLElement) => within(s).queryAllByRole('alert').map((a) => a.textContent)
/** Opens the sheet on a section, its picker's list (the row shows `shown`), and the `+ Add …` row at the list's end. */
const startAdd = (title: Title, shown: string, add: string) => {
  fireEvent.click(tag(new RegExp(`^${title}:`)))
  const s = section(title)
  fireEvent.click(button(s, shown))
  fireEvent.click(button(s, add))
  return s
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LibraryForm: adding in place', () => {
  it('adds a round to the AXSR', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
    open('#/real/workbench?p=p7&d=800&u=imperial')
    const s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    expect(button(s, '+ Add round')).toHaveAttribute('aria-expanded', 'true')
    // The form stands in for the round's own fields and its truing; the other sections stay as they are.
    expect(within(s).queryByRole('group', { name: 'Round' })).not.toBeInTheDocument()
    expect(within(s).queryByRole('button', { name: 'True the muzzle velocity' })).not.toBeInTheDocument()
    expect(input(s, 'Muzzle velocity')).toHaveValue('')
    type(input(s, 'Name'), 'Handload 250 SMK')
    type(input(s, 'Bullet mass'), '250')
    type(input(s, 'BC'), '0.3')
    type(input(s, 'Muzzle velocity'), '880')
    fireEvent.click(button(s, 'Save'))

    const rounds = lib().rounds
    expect(rounds).toEqual([{ id: expect.stringMatching(/^u-/), rifleId: 'axsr', name: 'Handload 250 SMK', massGr: 250, dragModel: 'G7', bc: 0.3, muzzleVelocityMs: 880 }])
    expect(window.location.hash).toContain(`cr=${rounds[0].id}`)
    expect(window.location.hash).not.toContain('cf=')
    expect(tag(/^Round:/)).toHaveTextContent(/^Handload$/)
    // The saved round is the selection, and the section shows its own fields again.
    expect(button(section('Round'), 'Handload 250 SMK')).toHaveFocus()
    expect(input(section('Round'), 'Name')).toHaveValue('Handload 250 SMK')
    expect(input(section('Round'), 'Bullet mass')).toHaveValue('250')
  })

  it('refuses Save until the required fields are valid', () => {
    open()
    const s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    fireEvent.click(button(s, 'Save'))
    expect(alerts(s)).toEqual([
      'Give it a name, at most 40 characters',
      'Type a value from 1.3 to 64.79',
      'Type a value from 0.05 to 1.2',
      'Type a value from 200 to 1300',
    ])
    for (const label of ['Name', 'Bullet mass', 'BC', 'Muzzle velocity']) expect(input(s, label)).toHaveAttribute('aria-invalid', 'true')
    expect(localStorage.getItem('gb.real.library')).toBeNull()
    expect(input(s, 'Name')).toHaveFocus()

    // A field filled in loses its message; one only passed through keeps it.
    type(input(s, 'Name'), 'Handload')
    type(input(s, 'Bullet mass'), '')
    type(input(s, 'BC'), '3')
    expect(input(s, 'Name')).toHaveAttribute('aria-invalid', 'false')
    expect(input(s, 'Bullet mass')).toHaveAttribute('aria-invalid', 'true')
    expect(input(s, 'BC')).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(button(s, 'Save'))
    expect(localStorage.getItem('gb.real.library')).toBeNull()
    expect(input(s, 'Bullet mass')).toHaveFocus()

    type(input(s, 'Bullet mass'), '16.2')
    type(input(s, 'BC'), '0.3')
    type(input(s, 'Muzzle velocity'), '880')
    expect(alerts(s)).toEqual([])
    fireEvent.click(button(s, 'Save'))
    expect(lib().rounds).toHaveLength(1)
  })

  it('refuses Save while a field shows a bad entry, even an optional one', () => {
    open()
    const s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    type(input(s, 'Name'), 'Handload')
    type(input(s, 'Bullet mass'), '16.2')
    type(input(s, 'BC'), '0.3')
    type(input(s, 'Muzzle velocity'), '880')
    type(input(s, 'MV spread (SD)'), '99')
    fireEvent.click(button(s, 'Save'))
    expect(localStorage.getItem('gb.real.library')).toBeNull()
    expect(input(s, 'MV spread (SD)')).toHaveFocus()
  })

  it('adds a rifle with its first round, on the generic scope', () => {
    seed({ scopes: [{ id: 'u-scope-1', rifleId: 'axsr', name: 'S&B 5-25', scopeUnit: 'mil', clickValue: 0.1, zeroM: 100, sightHeightMm: 55 }] })
    open('#/real/workbench?p=p7&cs=u-scope-1&d=800&u=imperial')
    const s = startAdd('Rifle', 'AI AXSR / AXMC .338 27″', '+ Add rifle')
    expect(within(s).getByRole('heading', { name: 'Its first round' })).toBeInTheDocument()
    const [rifleName, roundName] = within(s).getAllByLabelText('Name')
    // The rifle's fields come first, then its round's.
    expect(rifleName.compareDocumentPosition(within(s).getByRole('heading', { name: 'Its first round' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    type(rifleName, 'Steyr SSG 08')
    type(input(s, 'Twist'), '10')
    fireEvent.click(button(s, 'Save'))
    // The round is required with the rifle: nothing is stored without it.
    expect(lib()).toMatchObject({ rifles: [], rounds: [] })
    expect(roundName).toHaveFocus()

    type(roundName, 'Handload 175')
    type(input(s, 'Bullet mass'), '175')
    type(input(s, 'BC'), '0.25')
    type(input(s, 'Muzzle velocity'), '800')
    fireEvent.click(button(s, 'Save'))

    const { rifles, rounds } = lib()
    expect(rifles).toEqual([{ id: expect.stringMatching(/^u-/), name: 'Steyr SSG 08', twist: 'right', groupShots: 3, twistIn: 10 }])
    expect(rounds).toEqual([{ id: expect.stringMatching(/^u-/), rifleId: rifles[0].id, name: 'Handload 175', dragModel: 'G7', massGr: 175, bc: 0.25, muzzleVelocityMs: 800 }])
    expect(window.location.hash).toContain(`cr=${rounds[0].id}`)
    expect(window.location.hash).toContain(`cf=${rifles[0].id}`)
    expect(window.location.hash).not.toContain('cs=')
    expect(tag(/^Rifle:/)).toHaveAccessibleName(/^Rifle: Steyr SSG 08/)
    // The generic scope, with its zero of 100 m in yards.
    expect(tag(/^Scope:/)).toHaveAccessibleName(/^Scope: MRAD · 0\.1 · zero 109\syd$/)
    expect(button(section('Rifle'), 'Steyr SSG 08')).toHaveFocus()
  })

  it('adds a scope: unit from the display angle, zero 100, and the click and sight height asked for', () => {
    open('#/real/workbench?p=p7&d=800&a=moa')
    const s = startAdd('Scope', 'Generic scope', '+ Add scope')
    const unit = within(s).getByRole('group', { name: 'Scope unit' })
    expect(button(unit, 'MOA')).toHaveAttribute('aria-pressed', 'true')
    expect(within(within(s).getByRole('group', { name: 'Zero' })).getByText(/^100\sm$/)).toBeInTheDocument()
    // The display's own reading isn't the scope's: it stays out of the form.
    expect(within(s).queryByRole('group', { name: 'Reading' })).not.toBeInTheDocument()
    type(input(s, 'Name'), 'S&B 5-25')
    fireEvent.click(button(s, 'Save'))
    expect(alerts(s)).toEqual(['Pick the click', 'Type a value from 20 to 120'])
    expect(localStorage.getItem('gb.real.library')).toBeNull()
    expect(button(within(s).getByRole('group', { name: 'Click value' }), '¼')).toHaveFocus()

    // A unit chosen in the form stays in the form until Save.
    fireEvent.click(button(unit, 'MRAD'))
    expect(window.location.hash).toContain('a=moa')
    expect(alerts(s)[0]).toBe('Pick the click')
    fireEvent.click(button(within(s).getByRole('group', { name: 'Click value' }), '0.1'))
    type(input(s, 'Sight height'), '40')
    expect(alerts(s)).toEqual([])
    fireEvent.click(button(s, 'Save'))

    const scopes = lib().scopes
    expect(scopes).toEqual([{ id: expect.stringMatching(/^u-/), rifleId: 'axsr', name: 'S&B 5-25', scopeUnit: 'mil', zeroM: 100, clickValue: 0.1, sightHeightMm: 40 }])
    expect(window.location.hash).toContain(`cs=${scopes[0].id}`)
    expect(window.location.hash).toContain('a=mil')
    expect(tag(/^Scope:/)).toHaveAccessibleName(/^Scope: MRAD · 0\.1 · zero 100/)
    expect(button(section('Scope'), 'S&B 5-25')).toHaveFocus()
  })

  it('marks the optional fields in the form', () => {
    open()
    const marked = (s: HTMLElement, required: string[], optional: string[]) => {
      for (const label of required) expect(input(s, label).labels![0]).toHaveTextContent(new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`))
      for (const label of optional) {
        expect(input(s, label).labels![0]).toHaveTextContent(`${label} optional`)
        expect(input(s, label)).toHaveAttribute('placeholder', 'not set')
      }
      // The required ones first, then the optional ones; a draft's values come from nowhere yet, so nothing is tagged.
      const last = input(s, required[required.length - 1])
      for (const label of optional) expect(last.compareDocumentPosition(input(s, label))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      expect(within(s).queryByText(/^(yours|estimate|default)$/)).not.toBeInTheDocument()
    }
    marked(startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round'),
      ['Name', 'Bullet mass', 'BC', 'Muzzle velocity'],
      ['Calibre, for the tag', 'MV reference temperature', 'Powder sensitivity', 'MV spread (SD)', 'Bullet diameter', 'Bullet length'])
    cleanup()
    open()
    marked(startAdd('Scope', 'Generic scope', '+ Add scope'), ['Name', 'Sight height'], ['Turret travel up', 'Magnification'])
    cleanup()
    open()
    const rifle = startAdd('Rifle', 'AI AXSR / AXMC .338 27″', '+ Add rifle')
    const [rifleName] = within(rifle).getAllByLabelText('Name')
    for (const label of ['Barrel length', 'Twist', 'Accuracy']) {
      expect(within(rifle).getByLabelText(`${label} optional`)).toHaveAttribute('placeholder', 'not set')
      expect(rifleName.compareDocumentPosition(within(rifle).getByLabelText(`${label} optional`))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
  })

  it('cancels without storing anything and gives the focus back to + Add', () => {
    open('#/real/workbench?p=p7&d=800&a=moa')
    const hash = window.location.hash
    const s = startAdd('Scope', 'Generic scope', '+ Add scope')
    type(input(s, 'Name'), 'S&B 5-25')
    fireEvent.click(button(within(s).getByRole('group', { name: 'Scope unit' }), 'MRAD'))
    fireEvent.click(button(within(s).getByRole('group', { name: 'Click value' }), '0.1'))
    type(input(s, 'Sight height'), '40')
    fireEvent.click(button(s, 'Cancel'))

    expect(localStorage.getItem('gb.real.library')).toBeNull()
    expect(localStorage.getItem('gb.real.profiles')).toBeNull()
    expect(window.location.hash).toBe(hash)
    expect(button(s, '+ Add scope')).toHaveFocus()
    expect(button(s, '+ Add scope')).toHaveAttribute('aria-expanded', 'false')
    // The list and the section's fields are back, and a new form starts empty.
    expect(within(s).getByRole('group', { name: 'Scope' })).toBeInTheDocument()
    expect(input(s, 'Sight height')).toHaveValue('60')
    fireEvent.click(button(s, '+ Add scope'))
    expect(input(s, 'Name')).toHaveValue('')
  })
})

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const NOTE = /^On an iPhone, add the site to the home screen first/
const iphone = (standalone = false) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === '(display-mode: standalone)' && standalone, media: q, addEventListener: () => {}, removeEventListener: () => {},
  }))
}

describe('LibraryForm: the note on an iPhone', () => {
  it('shows the note before the first + Add on an iPhone in Safari', () => {
    iphone()
    open()
    const s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    expect(within(s).getByText(NOTE)).toBeInTheDocument()
    expect(within(s).queryByLabelText(/^Name/)).not.toBeInTheDocument()
    expect(button(s, 'How')).toHaveFocus()
  })

  it('describes the note to a screen reader when the focus lands on it', () => {
    iphone()
    open()
    const s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    expect(within(s).getByRole('group', { name: /^On an iPhone, add the site to the home screen first/ })).toBeInTheDocument()
  })

  it('How shows the iPhone steps', () => {
    iphone()
    open()
    const s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    expect(within(s).queryByText(/^In Safari, tap Share/)).not.toBeInTheDocument()
    fireEvent.click(button(s, 'How'))
    expect(within(s).getByText(/^In Safari, tap Share/)).toBeInTheDocument()
  })

  it('Continue anyway opens the form and the note never shows again', () => {
    iphone()
    open()
    let s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    fireEvent.click(button(s, 'Continue anyway'))
    expect(within(s).queryByText(NOTE)).not.toBeInTheDocument()
    expect(input(s, 'Name')).toBeInTheDocument()
    expect(document.activeElement).toBe(input(s, 'Name'))
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).addNoteSeen).toBe(true)
    fireEvent.click(button(s, 'Cancel'))
    cleanup()
    open()
    s = startAdd('Scope', 'Generic scope', '+ Add scope')
    expect(within(s).queryByText(NOTE)).not.toBeInTheDocument()
    expect(input(s, 'Name')).toBeInTheDocument()
  })

  it('never shows on Android or from the home screen', () => {
    open()
    let s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    expect(input(s, 'Name')).toBeInTheDocument()
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    iphone(true)
    open()
    s = startAdd('Round', 'Lapua Scenar 250 gr GB488', '+ Add round')
    expect(input(s, 'Name')).toBeInTheDocument()
  })
})
