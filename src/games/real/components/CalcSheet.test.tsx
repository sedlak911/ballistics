import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'
import * as solveModule from '../solve'

// Pass-through: every test runs the real solver; R9's test reads what the page asked it for.
vi.mock('../solve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../solve')>()
  return { ...actual, solveReal: vi.fn(actual.solveReal) }
})
const solveSpy = vi.mocked(solveModule.solveReal)

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

const calcButton = () => screen.getByRole('button', { name: 'How it’s calculated' })
const sheetOf = () => screen.getByRole('dialog', { name: /How it’s calculated/ })

function openSheet(hash: string) {
  open(hash)
  fireEvent.click(calcButton())
  return sheetOf()
}

/** A step (or a line after the steps) by its heading. */
const step = (sheet: HTMLElement, name: string) => within(sheet).getByRole('heading', { name }).closest<HTMLElement>('.calc-step')!

function onPhone(run: () => void) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
  try {
    run()
  } finally {
    vi.unstubAllGlobals()
  }
}

const P7_1000_WIND = '#/real/workbench?p=p7&d=1000&ws=3&wc=9'

afterEach(cleanup)

describe('CalcSheet: the steps', () => {
  it('lists ten numbered steps, in the order of the calculation', () => {
    const sheet = openSheet(P7_1000_WIND)
    const steps = within(sheet).getAllByRole('listitem')
    expect(steps).toHaveLength(10)
    expect(steps.map((li) => li.querySelector('.calc-n')!.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    expect(steps.map((li) => within(li).getByRole('heading').textContent)).toEqual([
      'Air', 'Muzzle velocity', 'Flight', 'Elevation', 'Wind', 'Spin drift', 'Coriolis and Eötvös', 'Aerodynamic jump',
      'Earth’s curvature', 'Hit chance',
    ])
  })

  it('shows P7’s figures at 1000 m with 3 m/s from 9, the answer’s own', () => {
    const sheet = openSheet(P7_1000_WIND)
    expect(step(sheet, 'Air')).toHaveTextContent('ρ 1.225 kg/m³')
    expect(step(sheet, 'Muzzle velocity')).toHaveTextContent('900 + 0 · (15 − 15) = 900 m/s')
    expect(step(sheet, 'Flight')).toHaveTextContent(/1\.536 s · 472 m\/s/)
    expect(step(sheet, 'Flight')).toHaveTextContent('Mach 1.39 at the target')
    // The hero says ↑8.4 MRAD with 84 clicks.
    expect(step(sheet, 'Elevation')).toHaveTextContent('↑8.4 MRAD · 84 clicks')
    expect(step(sheet, 'Elevation')).toHaveTextContent('8.37 m / 1000 m = 8.37 MRAD')
    expect(step(sheet, 'Elevation')).toHaveTextContent(/zeroed with the reference MV \(900 m\/s\) in today’s air/)
    // The same left-over figure as the answer's dial line, whole cm.
    const leftOver = screen.getByTestId('real-dial-line').textContent!.match(/\d+\scm left over/)![0].replace(/\s/g, ' ')
    expect(step(sheet, 'Elevation')).toHaveTextContent(`84 clicks of 0.1 MRAD`)
    expect(step(sheet, 'Elevation')).toHaveTextContent(leftOver)
    expect(step(sheet, 'Elevation')).not.toHaveTextContent(/\d\.\d cm left over/)
    expect(step(sheet, 'Wind')).toHaveTextContent('→127 cm · 1.27 MRAD')
    expect(step(sheet, 'Wind')).toHaveTextContent('lag rule: 3.0 m/s · (1.536 − 1000/900) s = 3.0 · 0.425 = 1.27 m')
    expect(step(sheet, 'Spin drift')).toHaveTextContent('→26 cm · 0.26 MRAD')
    expect(step(sheet, 'Spin drift')).toHaveTextContent('Sg 2.55')
    expect(step(sheet, 'Coriolis and Eötvös')).toHaveTextContent('→7.7 cm · 0.08 MRAD')
    expect(step(sheet, 'Aerodynamic jump')).toHaveTextContent('↓9.1 cm · 0.09 MRAD')
    expect(step(sheet, 'Windage total')).toHaveTextContent('→127 + →26 + →7.7 = →161 cm')
    expect(step(sheet, 'Windage total')).toHaveTextContent('hold ←1.6 MRAD')
    expect(step(sheet, 'Hit chance')).toHaveTextContent('≈ 35')
    expect(step(sheet, 'Hit chance')).toHaveTextContent(/our estimate for prone with a rest/)
    expect(step(sheet, 'Cant')).toHaveTextContent('1° = 17 cm')
  })

  it('the earth’s curvature step reads 0.0 cm at 300 m', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=300')
    expect(step(sheet, 'Earth’s curvature')).toHaveTextContent('0.0 cm')
    expect(step(sheet, 'Earth’s curvature')).not.toHaveTextContent(/[-−]0[.,]0/)
  })

  it('names the source of every input: P7’s sight height is an estimate', () => {
    const sheet = openSheet(P7_1000_WIND)
    const tag = within(step(sheet, 'Elevation')).getByTitle('estimate: nobody publishes the sight height')
    expect(tag).toHaveTextContent('estimate')
    expect(within(step(sheet, 'Flight')).getByText('preset · Lapua')).toBeInTheDocument()
    expect(within(step(sheet, 'Air')).getAllByText('standard').length).toBeGreaterThan(0)
  })

  it('an effect without its input says what is missing (P8 has no bullet length)', () => {
    const sheet = openSheet('#/real/workbench?p=p8&d=1000&ws=3&wc=9')
    expect(step(sheet, 'Spin drift')).toHaveTextContent('missing: bullet length')
    expect(step(sheet, 'Aerodynamic jump')).toHaveTextContent('missing: bullet length')
    for (const name of ['Spin drift', 'Aerodynamic jump']) {
      expect(step(sheet, name)).toHaveClass('off')
      const sw = within(sheet).getByRole('switch', { name })
      expect(sw).toBeDisabled()
      expect(sw).toHaveAccessibleDescription('missing: bullet length')
    }
    expect(within(sheet).getByRole('switch', { name: 'Coriolis and Eötvös' })).toBeEnabled()
  })

  it('shows the rifleman’s rule only on a slope', () => {
    expect(within(openSheet(P7_1000_WIND)).queryByRole('heading', { name: 'Slope' })).not.toBeInTheDocument()
    cleanup()
    const sheet = openSheet('#/real/workbench?p=p7&d=1000&sl=10')
    const slope = step(sheet, 'Slope')
    expect(slope).toHaveTextContent(/rifleman’s rule, the level answer at 985 m/)
    expect(slope).toHaveTextContent(/hits 8\.3 cm low/)
    expect(slope).toHaveTextContent('rule ↓8.3 cm · 0.08 MRAD')
  })

  it('out of range, it still shows what went in: the air and the muzzle velocity', () => {
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { custom: { muzzleVelocityMs: 300, bc: 0.15, dragModel: 'G1' } } }))
    const sheet = openSheet('#/real/workbench?p=custom&d=2500')
    expect(within(sheet).getAllByRole('listitem').map((li) => within(li).getByRole('heading').textContent)).toEqual(['Air', 'Muzzle velocity'])
    expect(step(sheet, 'Muzzle velocity')).toHaveTextContent('300 m/s')
    expect(within(sheet).getByText(/^Out of range for this load/)).toBeInTheDocument()
  })

  it('flags a stand-in drag curve in plain sight (P9: the NATO reference round), in both languages', () => {
    const sheet = openSheet('#/real/workbench?p=p9&d=1000')
    expect(step(sheet, 'Flight')).toHaveTextContent('measured Cd curve')
    expect(step(sheet, 'Flight')).toHaveTextContent(/McCoy’s measured curve for the NATO reference round, not the army’s Nammo\/RUAG ammo/)
    cleanup()
    open('#/real/workbench?l=cs&p=p9&d=1000')
    fireEvent.click(screen.getByRole('button', { name: 'Jak se to počítá' }))
    expect(step(screen.getByRole('dialog', { name: /Jak se to počítá/ }), 'Let')).toHaveTextContent(/referenční náboj NATO/)
  })

  it('tags a value the shared link brought "from link", not yours (c)', () => {
    const o = btoa(JSON.stringify({ muzzleVelocityMs: 905 })).replace(/=+$/, '')
    const sheet = openSheet(`${P7_1000_WIND}&o=${o}`)
    expect(within(sheet).getAllByText('from link').length).toBeGreaterThan(0)
    expect(within(sheet).queryByText('yours')).not.toBeInTheDocument()
  })

  it('lists the MV spread with its value and source, or says it is unknown', () => {
    expect(step(openSheet(P7_1000_WIND), 'Hit chance')).toHaveTextContent('MV spread (SD) unknown, left out')
    cleanup()
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { mvSdMs: 12 } } }))
    const hit = step(openSheet(P7_1000_WIND), 'Hit chance')
    expect(hit).toHaveTextContent('MV spread (SD) 12 m/s')
    expect(within(hit).getAllByText('yours').length).toBeGreaterThan(0)
    expect(hit).toHaveTextContent(/σ up and down \d+ cm: rifle 12 · MV spread \d/)
  })

  it('shows the air it computed: 25 °C at 500 m is thinner than the standard', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({ v: 1, tempC: { value: 25, source: 'manual' }, altitudeM: { value: 500, source: 'manual' } }))
    const air = step(openSheet(P7_1000_WIND), 'Air')
    // ISA pressure at 500 m is 954.6 hPa: ρ = 95460 / (287.06 · 298.15) = 1.115; the standard ρ 1.225 is at 0 m.
    expect(air).toHaveTextContent('ρ 1.115 kg/m³')
    expect(air).toHaveTextContent('station pressure 954.6 hPa')
    // c = 20.05 · √298.15 = 346.2 m/s; the ISA altitude of that density is about 970 m.
    expect(air).toHaveTextContent('speed of sound 346.2 m/s')
    expect(air).toHaveTextContent(/density altitude 9[67]0 m/)
  })

  it('never prints a negative zero', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=100&ws=0')
    expect(sheet.textContent).not.toMatch(/[-−]0(?:[.,]0+)?(?![\d.,])/)
  })

  it('speaks Czech, with decimal commas in the working', () => {
    open('#/real/workbench?l=cs&p=p7&d=1000&ws=3&wc=9')
    fireEvent.click(screen.getByRole('button', { name: 'Jak se to počítá' }))
    const sheet = screen.getByRole('dialog', { name: /Jak se to počítá/ })
    expect(within(sheet).getAllByRole('listitem').map((li) => within(li).getByRole('heading').textContent)).toEqual([
      'Vzduch', 'Úsťová rychlost', 'Let', 'Výška', 'Vítr', 'Spin drift', 'Coriolis a Eötvös', 'Aerodynamický skok',
      'Zakřivení Země', 'Šance na zásah',
    ])
    expect(step(sheet, 'Vítr')).toHaveTextContent('pravidlo zpoždění: 3,0 m/s · (1,536 − 1000/900) s = 3,0 · 0,425 = 1,27 m')
    expect(step(sheet, 'Do strany celkem')).toHaveTextContent('→127 + →26 + →7,7 = →161 cm')
    fireEvent.click(within(step(sheet, 'Vítr')).getByRole('button', { name: 'Vysvětlení: Vítr' }))
    expect(step(sheet, 'Vítr')).toHaveTextContent(/ve vakuu/)
  })
})

describe('CalcSheet: switches and explanations', () => {
  it('switching spin drift off changes the hero windage, and greys the step with its would-be share', () => {
    const sheet = openSheet(P7_1000_WIND)
    expect(screen.getByTestId('real-windage')).toHaveTextContent('←1.6MRAD')
    const sw = within(sheet).getByRole('switch', { name: 'Spin drift' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(sw)
    expect(within(sheetOf()).getByRole('switch', { name: 'Spin drift' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('real-windage')).toHaveTextContent('←1.4MRAD')
    expect(step(sheetOf(), 'Spin drift')).toHaveClass('off')
    expect(step(sheetOf(), 'Spin drift')).toHaveTextContent('→26 cm')
    expect(step(sheetOf(), 'Windage total')).toHaveTextContent('→127 + →7.7 = →135 cm')
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).effects.spinDrift).toBe(false)
  })

  it('humidity and powder temperature have their switches in steps 1 and 2', () => {
    const sheet = openSheet(P7_1000_WIND)
    expect(within(step(sheet, 'Air')).getByRole('switch', { name: 'Humidity' })).toHaveAttribute('aria-checked', 'true')
    expect(within(step(sheet, 'Muzzle velocity')).getByRole('switch', { name: 'Powder temperature' })).toBeInTheDocument()
    for (const name of ['Coriolis and Eötvös', 'Aerodynamic jump', 'Earth’s curvature']) expect(within(sheet).getByRole('switch', { name })).toBeInTheDocument()
    expect(within(sheet).getAllByRole('switch')).toHaveLength(6)
  })

  it('the ⓘ of step 5 reveals the lag-rule explanation', () => {
    const sheet = openSheet(P7_1000_WIND)
    const q = within(step(sheet, 'Wind')).getByRole('button', { name: 'About: Wind' })
    expect(q).toHaveAttribute('aria-expanded', 'false')
    const id = q.getAttribute('aria-controls')!
    expect(document.getElementById(id)).toBeNull()
    fireEvent.click(q)
    expect(q).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(id)).toHaveTextContent(/lag rule/)
    expect(document.getElementById(id)).toHaveTextContent(/in a vacuum/)
  })
})

describe('CalcSheet: the dialog', () => {
  it('takes the focus; Escape closes it and the focus returns to the button', () => {
    open(P7_1000_WIND)
    const btn = calcButton()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    const sheet = sheetOf()
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(sheet.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /How it’s calculated/ })).not.toBeInTheDocument()
    expect(btn).toHaveFocus()
  })

  it('keeps Tab inside the sheet', () => {
    const sheet = openSheet(P7_1000_WIND)
    const focusable = within(sheet).getAllByRole('button').concat(within(sheet).getAllByRole('switch'))
    const all = [...sheet.querySelectorAll<HTMLElement>('button')]
    expect(focusable.length).toBe(all.length)
    all[all.length - 1].focus()
    fireEvent.keyDown(all[all.length - 1], { key: 'Tab' })
    expect(all[0]).toHaveFocus()
    fireEvent.keyDown(all[0], { key: 'Tab', shiftKey: true })
    expect(all[all.length - 1]).toHaveFocus()
  })

  it('the close button closes it', () => {
    const sheet = openSheet(P7_1000_WIND)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: /How it’s calculated/ })).not.toBeInTheDocument()
    expect(calcButton()).toHaveFocus()
  })
})

describe('CalcSheet: what the page computes (R9)', () => {
  it('the main screen asks for no shares while the sheet is closed, and for shares and the hit chance while it is open', () => {
    solveSpy.mockClear()
    open('#/real/workbench?p=p7&d=1000')
    expect(solveSpy).toHaveBeenCalled()
    expect(solveSpy.mock.calls.every((c) => c[5].shares === false)).toBe(true)
    expect(solveSpy.mock.lastCall![5]).toEqual({ shares: false, hit: true })
    fireEvent.click(calcButton())
    expect(solveSpy.mock.lastCall![5]).toEqual({ shares: true, hit: true })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(solveSpy.mock.lastCall![5]).toEqual({ shares: false, hit: true })
  })

  it('on a phone the hit chance is computed only for the sheet, which ends with it', () => {
    onPhone(() => {
      solveSpy.mockClear()
      open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
      expect(solveSpy.mock.lastCall![5]).toEqual({ shares: false, hit: false })
      fireEvent.click(calcButton())
      expect(solveSpy.mock.lastCall![5]).toEqual({ shares: true, hit: true })
      expect(step(sheetOf(), 'Hit chance')).toHaveTextContent(/≈ 35/)
    })
  })
})
