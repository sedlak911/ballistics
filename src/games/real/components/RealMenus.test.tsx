import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'
import { readLinkOverrides, writeLinkOverrides, type Overrides } from '../profiles'

function open(hash = '#/real/workbench?p=p7&d=800') {
  window.location.hash = hash
  return render(<App />)
}

const strip = () => screen.getByTestId('real-strip')
const tag = (name: RegExp | string) => within(strip()).getByRole('button', { name })
const menu = (name: string) => screen.getByRole('dialog', { name })
const stored = () => JSON.parse(localStorage.getItem('gb.real.profiles') ?? '{"presets":{}}').presets as Record<string, Record<string, unknown>>
const type = (el: HTMLElement, text: string) => {
  fireEvent.change(el, { target: { value: text } })
  fireEvent.blur(el)
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('RealMenus', () => {
  it('shows the rifle, round and scope tags in the header strip, in the short forms (I5)', () => {
    open()
    expect(tag(/^Rifle: AI AXSR · 27″$/)).toBeInTheDocument()
    expect(tag('Rifle details')).toBeInTheDocument()
    expect(tag(/^Round: \.338 LM Scenar 250$/)).toHaveTextContent(/^\.338 LM Scenar 250$/)
    expect(tag(/^Round:/)).toHaveAttribute('title', 'Lapua Scenar 250 gr GB488')
    expect(tag(/^Scope: MRAD · 0\.1 · zero 100\sm$/)).toHaveTextContent(/^MRAD · 0\.1 · zero 100$/)
  })

  it('on a phone shows all three tags in the strip under the header, the scope as unit · click · zero (I5)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
    try {
      open()
      const s = strip()
      expect(s.closest('.real-strip')).not.toBeNull()
      expect(within(s).getAllByRole('button').map((b) => b.textContent)).toEqual(['AI AXSR · 27″', '', '.338 LM Scenar 250', 'MRAD · 0.1 · zero 100'])
      // The mode isn't on the tag: the answer's keys say it.
      expect(screen.getByText('· dial')).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('picking Desert Tech HTI selects its first round; the round menu then offers two', () => {
    open()
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(within(menu('Rifle')).getByRole('button', { name: 'Desert Tech HTI' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.hash).toContain('p=p8')
    fireEvent.click(tag(/^Round:/))
    const rounds = within(menu('Round')).getByRole('group', { name: 'Round' })
    expect(within(rounds).getAllByRole('button').map((b) => b.textContent)).toEqual(['DTM .375 CheyTac 352 gr', '12.7×99 ball (M33)'])
  })

  it('keeps one menu open at a time', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(tag(/^Scope:/))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(menu('Scope and zero')).toBeInTheDocument()
  })

  it('a changed sight height is stored for the preset and tagged yours; another preset and back keeps it; reset clears it', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    expect(within(cog).getAllByText('estimate').length).toBeGreaterThan(0)
    expect(within(cog).getByText('measure it')).toBeInTheDocument()
    type(within(cog).getByLabelText('Sight height'), '65')
    expect(stored().p7.sightHeightMm).toBe(65)
    expect(within(cog).getAllByText('yours').length).toBeGreaterThan(0)
    expect(within(cog).queryByText('measure it')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to preset' }))
    expect(stored().p7).toBeUndefined()
    expect(within(menu('Rifle details')).getByText('measure it')).toBeInTheDocument()
  })

  it('sets the twist direction in the cog, right-hand by default; left-hand is stored and moves the windage (M10)', () => {
    open('#/real/workbench?p=p7&d=1000&ws=0')
    const windage = () => screen.getByTestId('real-windage').textContent
    const before = windage()
    fireEvent.click(tag('Rifle details'))
    const dir = within(menu('Rifle details')).getByRole('group', { name: 'Twist direction' })
    expect(within(dir).getByRole('button', { name: 'right-hand' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(dir).getByRole('button', { name: 'left-hand' }))
    expect(stored().p7).toEqual({ twist: 'left' })
    expect(within(dir).getByRole('button', { name: 'left-hand' })).toHaveAttribute('aria-pressed', 'true')
    expect(windage()).not.toBe(before)
  })

  it('switching to P1 and back to P7 keeps the override', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    type(within(menu('Rifle details')).getByLabelText('Sight height'), '65')
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(within(menu('Rifle')).getByRole('button', { name: 'CZ BREN 2 14″' }))
    expect(window.location.hash).toContain('p=p1')
    expect(stored().p1).toBeUndefined()
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(within(menu('Rifle')).getByRole('button', { name: 'AI AXSR / AXMC .338 27″' }))
    expect(window.location.hash).toContain('p=p7')
    expect(stored().p7.sightHeightMm).toBe(65)
  })

  it('a stored zero outside the stepper (2500 m) is dropped: the scope shows the preset\'s 100 m, not yours (M7)', () => {
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { zeroM: 2500 } } }))
    open('#/real/workbench?p=p7&d=300')
    expect(tag(/^Scope:/)).toHaveTextContent(/zero 100$/)
    fireEvent.click(tag(/^Scope:/))
    expect(within(menu('Scope and zero')).queryByText('yours')).not.toBeInTheDocument()
    expect(screen.getByTestId('real-elevation')).toHaveTextContent(/^↑/)
  })

  it('a value outside its bounds, or text that is not a number, stores nothing', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    const sight = within(menu('Rifle details')).getByLabelText('Sight height')
    for (const bad of ['0', '-0', '500', 'abc', '']) {
      type(sight, bad)
      expect(stored().p7).toBeUndefined()
    }
    expect(sight).toHaveAttribute('aria-invalid', 'true')
  })

  it('trues the MV at 800 m from an observed 4.9 mrad and the MV tag says trued at 800 m', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    expect(within(cog).getByText('observed in calm air')).toBeInTheDocument()
    type(within(cog).getByLabelText('Distance'), '800')
    type(within(cog).getByLabelText('Dial needed (MRAD)'), '4.9')
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    const o = stored().p7
    expect(o.truedAtM).toBe(800)
    expect(o.muzzleVelocityMs).not.toBe(900)
    expect(o.muzzleVelocityMs as number).toBeGreaterThan(850)
    expect(within(cog).getByText(/^trued at 800\sm$/)).toBeInTheDocument()
    cleanup()
    open()
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).getByText(/^trued at 800\sm$/)).toBeInTheDocument()
  })

  it('refuses 49 (ten times too big): says so and stores nothing', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    type(within(cog).getByLabelText('Distance'), '800')
    type(within(cog).getByLabelText('Dial needed (MRAD)'), '49')
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    expect(within(cog).getByRole('alert')).toHaveTextContent('The observed figure doesn’t fit this load at this distance. Check the figure and the unit.')
    expect(stored().p7).toBeUndefined()
  })

  it('a manual MV clears the trued distance', () => {
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { muzzleVelocityMs: 910, truedAtM: 800 } } }))
    open()
    fireEvent.click(tag(/^Round:/))
    const round = menu('Round')
    expect(within(round).getByText(/^trued at 800\sm$/)).toBeInTheDocument()
    type(within(round).getByLabelText('Muzzle velocity'), '905')
    expect(stored().p7.muzzleVelocityMs).toBe(905)
    expect(stored().p7.truedAtM).toBeUndefined()
    expect(within(menu('Round')).queryByText(/trued at/)).not.toBeInTheDocument()
  })

  it('a stored trued distance without an MV shows no trued tag', () => {
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { truedAtM: 600 } } }))
    open()
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).queryByText(/trued at/)).not.toBeInTheDocument()
  })

  // I4: Custom's numbers are placeholders, so they read as estimates until typed.
  it('Custom tags its untouched placeholders estimate, never yours; a typed BC is yours', () => {
    open('#/real/workbench?p=custom&d=800')
    fireEvent.click(tag(/^Round:/))
    const round = menu('Round')
    expect(within(round).queryByText('yours')).not.toBeInTheDocument()
    expect(within(round).getAllByText('estimate').length).toBeGreaterThanOrEqual(7)
    expect(within(round).getByText('chronograph it')).toBeInTheDocument()
    type(within(round).getByLabelText('BC'), '0.31')
    expect(stored().custom).toEqual({ bc: 0.31 })
    expect(within(menu('Round')).getAllByText('yours')).toHaveLength(1)
    fireEvent.click(tag('Rifle details'))
    expect(within(menu('Rifle details')).queryByText('yours')).not.toBeInTheDocument()
    expect(within(menu('Rifle details')).getByText('measure it')).toBeInTheDocument()
  })

  it('shows the BC of a table drag read-only', () => {
    open('#/real/workbench?p=p9&d=800')
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).getByText('measured Cd curve')).toBeInTheDocument()
    expect(within(menu('Round')).queryByLabelText('BC')).not.toBeInTheDocument()
  })

  it('changing the drag model stores nothing until a BC for it is typed, then stores both', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    const round = menu('Round')
    expect(within(round).getByRole('button', { name: 'G7' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(round).getByRole('button', { name: 'G1' }))
    expect(stored().p7).toBeUndefined()
    expect(within(round).getByRole('alert')).toHaveTextContent('Enter the G1 BC')
    type(within(round).getByLabelText('BC'), '0.58')
    expect(stored().p7).toEqual({ dragModel: 'G1', bc: 0.58 })
    expect(within(menu('Round')).getByRole('button', { name: 'G1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a BC typed with the model unchanged stores the BC alone; going back to the model undoes the pending change', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    const round = menu('Round')
    fireEvent.click(within(round).getByRole('button', { name: 'G1' }))
    fireEvent.click(within(round).getByRole('button', { name: 'G7' }))
    expect(within(round).queryByRole('alert')).not.toBeInTheDocument()
    type(within(round).getByLabelText('BC'), '0.33')
    expect(stored().p7).toEqual({ bc: 0.33 })
  })

  it('shows mass and diameter in grams and millimetres, and stores grains and inches', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    const round = menu('Round')
    expect((within(round).getByLabelText('Bullet mass') as HTMLInputElement).value).toBe('16.2')
    expect((within(round).getByLabelText('Bullet diameter') as HTMLInputElement).value).toBe('8.59')
    type(within(round).getByLabelText('Bullet mass'), '15')
    expect(stored().p7.massGr as number).toBeCloseTo(231.5, 1)
    type(within(round).getByLabelText('Bullet diameter'), '8.6')
    expect(stored().p7.diameterIn as number).toBeCloseTo(0.3386, 3)
  })

  it('MOA in the scope menu switches the hero to MOA and the click chips to ¼ and ⅛', () => {
    open()
    fireEvent.click(tag(/^Scope:/))
    const scope = menu('Scope and zero')
    expect(within(scope).getByRole('group', { name: 'Click value' })).toHaveTextContent('0.10.05')
    fireEvent.click(within(scope).getByRole('button', { name: 'MOA' }))
    expect(within(menu('Scope and zero')).getByRole('group', { name: 'Click value' })).toHaveTextContent('¼⅛')
    expect(screen.getByTestId('real-elevation')).toHaveTextContent(/MOA$/)
    expect(tag(/^Scope: MOA · ¼ · zero/)).toBeInTheDocument()
  })

  it('writes the scope unit with every click or travel write; a travel entered in MRAD is not read as MOA', () => {
    open()
    fireEvent.click(tag(/^Scope:/))
    const scope = menu('Scope and zero')
    type(within(scope).getByLabelText('Turret travel up'), '20')
    expect(stored().p7).toMatchObject({ travelUp: 20, scopeUnit: 'mil', clickValue: 0.1 })
    fireEvent.click(within(scope).getByRole('button', { name: '0.05' }))
    expect(stored().p7).toMatchObject({ clickValue: 0.05, scopeUnit: 'mil', travelUp: 20 })
    fireEvent.click(within(scope).getByRole('button', { name: 'MOA' }))
    expect((within(menu('Scope and zero')).getByLabelText('Turret travel up') as HTMLInputElement).value).toBe('')
    fireEvent.click(within(menu('Scope and zero')).getByRole('button', { name: '⅛' }))
    expect(stored().p7).toMatchObject({ clickValue: 0.125, scopeUnit: 'moa' })
    expect(stored().p7.travelUp).toBeUndefined()
  })

  it('empty travel means unknown', () => {
    open()
    fireEvent.click(tag(/^Scope:/))
    type(within(menu('Scope and zero')).getByLabelText('Turret travel up'), '20')
    type(within(menu('Scope and zero')).getByLabelText('Turret travel up'), '')
    expect(stored().p7.travelUp).toBeNull()
  })

  it('steps the zero in 25 m from 25 to 600 and switches the reading mode', () => {
    open()
    fireEvent.click(tag(/^Scope:/))
    const scope = menu('Scope and zero')
    fireEvent.click(within(scope).getByRole('button', { name: 'Zero: more' }))
    expect(stored().p7.zeroM).toBe(125)
    fireEvent.click(within(scope).getByRole('button', { name: 'Hold in the reticle' }))
    expect(tag(/^Scope: MRAD · 0\.1 · zero 125\sm$/)).toBeInTheDocument()
    expect(screen.getAllByText('· hold')).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).mode).toBe('hold')
  })

  it('the settings sheet names the angle unit MRAD on REAL', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const sheet = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(sheet).getByRole('button', { name: 'MRAD' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'MIL' })).not.toBeInTheDocument()
  })

  it('closes on Escape and gives the focus back to its tag', () => {
    open()
    const t = tag(/^Round:/)
    fireEvent.click(t)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(t).toHaveFocus()
  })

  it('truing acts only on what both boxes show: a bad distance after a good truing stores nothing more', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    type(within(cog).getByLabelText('Distance'), '800')
    type(within(cog).getByLabelText('Dial needed (MRAD)'), '4.9')
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    const first = JSON.stringify(stored().p7)
    expect(stored().p7.truedAtM).toBe(800)
    // Dirty text, never blurred, counts as what is shown; so does an invalid one.
    fireEvent.change(within(cog).getByLabelText('Distance'), { target: { value: 'abc' } })
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    expect(within(cog).getAllByRole('alert').map((a) => a.textContent)).toContain('Type the distance and the dial figure you read there.')
    expect(JSON.stringify(stored().p7)).toBe(first)
    fireEvent.change(within(cog).getByLabelText('Distance'), { target: { value: '' } })
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    expect(JSON.stringify(stored().p7)).toBe(first)
    fireEvent.change(within(cog).getByLabelText('Dial needed (MRAD)'), { target: { value: '' } })
    fireEvent.change(within(cog).getByLabelText('Distance'), { target: { value: '800' } })
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    expect(JSON.stringify(stored().p7)).toBe(first)
  })

  it('truing: a bad dial figure is flagged invalid, an empty one asks for it, and nothing is stored', () => {
    open()
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    const obs = within(cog).getByLabelText('Dial needed (MRAD)')
    type(obs, 'abc')
    expect(obs).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
    expect(within(cog).getAllByRole('alert').map((a) => a.textContent)).toContain('Type the distance and the dial figure you read there.')
    expect(stored().p7).toBeUndefined()
  })

  describe('imperial', () => {
    const imperial = () => open('#/real/workbench?p=p7&d=800&u=imperial')

    it('stores a sight height typed in inches as millimetres', () => {
      imperial()
      fireEvent.click(tag('Rifle details'))
      type(within(menu('Rifle details')).getByLabelText('Sight height'), '1.5')
      expect(stored().p7.sightHeightMm as number).toBeCloseTo(38.1, 6)
    })

    it('stores a mass typed in grains and a diameter typed in inches as they are', () => {
      imperial()
      fireEvent.click(tag(/^Round:/))
      const round = menu('Round')
      expect((within(round).getByLabelText('Bullet mass') as HTMLInputElement).value).toBe('250')
      type(within(round).getByLabelText('Bullet mass'), '240')
      type(within(round).getByLabelText('Bullet diameter'), '0.34')
      expect(stored().p7.massGr).toBe(240)
      expect(stored().p7.diameterIn as number).toBeCloseTo(0.34, 6)
    })

    it('reads the truing distance in yards: 600 yd is 548.64 m', () => {
      imperial()
      fireEvent.click(tag('Rifle details'))
      const cog = menu('Rifle details')
      type(within(cog).getByLabelText('Distance'), '600')
      type(within(cog).getByLabelText('Dial needed (MRAD)'), '2.3')
      fireEvent.click(within(cog).getByRole('button', { name: 'True it' }))
      expect(stored().p7.truedAtM as number).toBeCloseTo(548.64, 6)
      expect(within(cog).getByText(/^trued at 600\syd$/)).toBeInTheDocument()
    })
  })
})

describe('a shared link carries the preset\'s overrides (I3)', () => {
  const link = (o: Overrides) => `o=${writeLinkOverrides(o)}`
  const linkInUrl = () => readLinkOverrides(new URLSearchParams(window.location.hash.split('?')[1]).get('o'))
  const keep = (o: Record<string, Overrides>) => localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: o }))
  const note = () => screen.queryByText('Values from the shared link')
  const elevationNow = () => screen.getByTestId('real-dial-line').textContent

  it('shows the sender\'s MV and sight height, on top of the receiver\'s own values, without storing them', () => {
    keep({ p7: { sightHeightMm: 70, zeroM: 200 } })
    const before = localStorage.getItem('gb.real.profiles')
    open(`#/real/workbench?p=p7&d=1000&${link({ muzzleVelocityMs: 905, sightHeightMm: 65 })}`)
    expect(note()).toBeInTheDocument()
    const answer = elevationNow()
    fireEvent.click(tag('Rifle details'))
    expect(within(menu('Rifle details')).getByLabelText('Sight height')).toHaveValue('65')
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).getByLabelText('Muzzle velocity')).toHaveValue('905')
    expect(tag(/^Scope:/)).toHaveTextContent(/zero 200$/)
    expect(localStorage.getItem('gb.real.profiles')).toBe(before)
    expect(localStorage.getItem('gb.real.setup')).not.toContain('o=')
    // The answer is the one the sender's values give.
    cleanup()
    keep({ p7: { sightHeightMm: 65, zeroM: 200, muzzleVelocityMs: 905 } })
    open('#/real/workbench?p=p7&d=1000')
    expect(elevationNow()).toBe(answer)
    expect(note()).not.toBeInTheDocument()
  })

  it('tags the sender\'s values "from link", not yours; a field the link lacks keeps its tag (c)', () => {
    keep({ p7: { sightHeightMm: 70, zeroM: 200 } })
    open(`#/real/workbench?p=p7&d=1000&${link({ muzzleVelocityMs: 905, sightHeightMm: 65 })}`)
    const field = (m: HTMLElement, label: string) => within(m).getByLabelText(label).closest<HTMLElement>('.rm-field')!
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    expect(within(field(cog, 'Sight height')).getByText('from link')).toBeInTheDocument()
    expect(within(field(cog, 'Sight height')).queryByText('yours')).not.toBeInTheDocument()
    fireEvent.click(tag(/^Round:/))
    const round = menu('Round')
    expect(within(field(round, 'Muzzle velocity')).getByText('from link')).toBeInTheDocument()
    expect(within(field(round, 'Muzzle velocity')).queryByText('yours')).not.toBeInTheDocument()
    expect(within(round).getAllByText('from link')).toHaveLength(1)
    fireEvent.click(tag(/^Scope:/))
    const scope = menu('Scope and zero')
    expect(within(field(scope, 'Zero')).getByText('yours')).toBeInTheDocument()
  })

  it('a link value the receiver holds the same is not "from link"; after the first edit the merged set reads yours', () => {
    keep({ p7: { sightHeightMm: 65 } })
    open(`#/real/workbench?p=p7&d=1000&${link({ muzzleVelocityMs: 905, sightHeightMm: 65 })}`)
    fireEvent.click(tag('Rifle details'))
    const cog = menu('Rifle details')
    const sight = within(cog).getByLabelText('Sight height').closest<HTMLElement>('.rm-field')!
    expect(within(sight).getByText('yours')).toBeInTheDocument()
    type(within(cog).getByLabelText('Sight height'), '62')
    fireEvent.click(tag(/^Round:/))
    const mv = within(menu('Round')).getByLabelText('Muzzle velocity').closest<HTMLElement>('.rm-field')!
    expect(within(mv).getByText('yours')).toBeInTheDocument()
  })

  it('"Use my values" drops the link from the view and leaves storage alone (a)', () => {
    keep({ p7: { muzzleVelocityMs: 830, truedAtM: 600 } })
    const before = localStorage.getItem('gb.real.profiles')
    open(`#/real/workbench?p=p7&d=1000&${link({ muzzleVelocityMs: 800 })}`)
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).getByLabelText('Muzzle velocity')).toHaveValue('800')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Use my values' }))
    expect(note()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use my values' })).not.toBeInTheDocument()
    expect(linkInUrl()).toEqual({ muzzleVelocityMs: 830, truedAtM: 600 })
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).getByLabelText('Muzzle velocity')).toHaveValue('830')
    expect(within(menu('Round')).getByText(/^trued at 600\sm$/)).toBeInTheDocument()
    expect(localStorage.getItem('gb.real.profiles')).toBe(before)
    // An edit then stores only itself on top of the stored set.
    type(within(menu('Round')).getByLabelText('Muzzle velocity'), '835')
    expect(stored().p7).toEqual({ muzzleVelocityMs: 835 })
  })

  it('the first edit stores the merged set; the URL then carries the stored set and the note goes', () => {
    keep({ p7: { zeroM: 200 } })
    open(`#/real/workbench?p=p7&d=1000&${link({ muzzleVelocityMs: 905 })}`)
    fireEvent.click(tag('Rifle details'))
    type(within(menu('Rifle details')).getByLabelText('Sight height'), '62')
    expect(stored().p7).toEqual({ zeroM: 200, muzzleVelocityMs: 905, sightHeightMm: 62 })
    expect(linkInUrl()).toEqual(stored().p7)
    expect(note()).not.toBeInTheDocument()
  })

  it('a link\'s click and unit take the receiver\'s travel along: an edit doesn\'t bring an MOA travel back under MRAD', () => {
    keep({ p7: { clickValue: 0.125, travelUp: 20, scopeUnit: 'moa' } })
    open(`#/real/workbench?p=p7&d=1000&${link({ clickValue: 0.05, scopeUnit: 'mil' })}`)
    fireEvent.click(tag('Rifle details'))
    type(within(menu('Rifle details')).getByLabelText('Sight height'), '62')
    expect(stored().p7).toEqual({ clickValue: 0.05, scopeUnit: 'mil', sightHeightMm: 62 })
  })

  it('an edit to a field the link also has keeps the edit', () => {
    open(`#/real/workbench?p=p7&d=1000&${link({ muzzleVelocityMs: 905 })}`)
    fireEvent.click(tag(/^Round:/))
    type(within(menu('Round')).getByLabelText('Muzzle velocity'), '910')
    expect(stored().p7).toEqual({ muzzleVelocityMs: 910 })
    expect(within(menu('Round')).getByLabelText('Muzzle velocity')).toHaveValue('910')
    expect(linkInUrl()).toEqual({ muzzleVelocityMs: 910 })
  })

  it('reset to preset drops the link\'s values too', () => {
    keep({ p7: { zeroM: 200 } })
    open(`#/real/workbench?p=p7&d=1000&${link({ sightHeightMm: 65 })}`)
    fireEvent.click(tag('Rifle details'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to preset' }))
    expect(stored().p7).toBeUndefined()
    expect(linkInUrl()).toBeNull()
    expect(note()).not.toBeInTheDocument()
    expect(within(menu('Rifle details')).getByLabelText('Sight height')).toHaveValue('60')
  })

  it('o=garbage gives the stored values, or the preset\'s', () => {
    keep({ p7: { sightHeightMm: 70 } })
    open('#/real/workbench?p=p7&d=1000&o=garbage')
    expect(note()).not.toBeInTheDocument()
    fireEvent.click(tag('Rifle details'))
    expect(within(menu('Rifle details')).getByLabelText('Sight height')).toHaveValue('70')
    expect(linkInUrl()).toEqual({ sightHeightMm: 70 })
    cleanup()
    localStorage.clear()
    open('#/real/workbench?p=p7&d=1000&o=%%%')
    fireEvent.click(tag(/^Round:/))
    expect(within(menu('Round')).getByLabelText('Muzzle velocity')).toHaveValue('900')
    expect(linkInUrl()).toBeNull()
  })

  it('the owner\'s own URL is the link: it carries the current preset\'s stored overrides, and only that preset\'s', () => {
    keep({ p7: { sightHeightMm: 65 } })
    open('#/real/workbench?p=p7&d=800')
    expect(linkInUrl()).toEqual({ sightHeightMm: 65 })
    expect(note()).not.toBeInTheDocument()
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(within(menu('Rifle')).getByRole('button', { name: 'CZ BREN 2 14″' }))
    expect(window.location.hash).toContain('p=p1')
    expect(linkInUrl()).toBeNull()
    fireEvent.click(tag(/^Scope:/))
    fireEvent.click(within(menu('Scope and zero')).getByRole('button', { name: 'Zero: more' }))
    expect(linkInUrl()).toEqual({ zeroM: 125 })
    cleanup()
    open('')
    expect(window.location.hash).toContain('p=p1')
    expect(linkInUrl()).toEqual({ zeroM: 125 })
  })
})
