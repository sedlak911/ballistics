import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'
import * as solveModule from '../solve'
import { PRESETS } from '../data/presets'
import { DEFAULT_REAL_PROFILE } from '../profile'
import { resolvePreset, type Overrides } from '../profiles'
import { DEFAULT_SETUP } from '../setup'
import { STANDARD_STATION } from '../station'
import { translate } from '../../../i18n'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { CalcSheet } from './CalcSheet'

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

/** A custom rifle and round with the old Custom preset's values (a .308 175 gr), slow and draggy: it doesn't reach 2500 m. */
const SLOW_LOAD = {
  v: 1,
  rifles: [{ id: 'u-rifle', name: 'Custom', twistIn: 10, accuracyMoa: 1 }],
  rounds: [{
    id: 'u-round', rifleId: 'u-rifle', name: 'Custom', massGr: 175, diameterIn: 0.308, lengthMm: 31.5, mvRefTempC: 15, powderSensMsPerC: 0,
    muzzleVelocityMs: 300, bc: 0.15, dragModel: 'G1',
  }],
  scopes: [],
}

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
    expect(step(sheet, 'Spin drift')).toHaveTextContent("Off: the bullet length isn't set.")
    expect(step(sheet, 'Aerodynamic jump')).toHaveTextContent("Off: the bullet length isn't set.")
    for (const name of ['Spin drift', 'Aerodynamic jump']) {
      expect(step(sheet, name)).toHaveClass('off')
      const sw = within(sheet).getByRole('switch', { name })
      expect(sw).toBeDisabled()
      expect(sw).toHaveAccessibleDescription("Off: the bullet length isn't set.")
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
    localStorage.setItem('gb.real.library', JSON.stringify(SLOW_LOAD))
    const sheet = openSheet('#/real/workbench?cr=u-round&cf=u-rifle&d=2500')
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
    // The distance and the wind by hand are yours; the muzzle velocity is the link's.
    expect(within(step(sheet, 'Muzzle velocity')).queryByText('yours')).not.toBeInTheDocument()
  })

  it('lists the MV spread with its value and source, or says it is unknown', () => {
    expect(step(openSheet(P7_1000_WIND), 'Hit chance')).toHaveTextContent("Off: the MV SD isn't set, so it adds nothing to the hit chance.")
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

  it('the ⓘ shows the explanation, then the working: the formula, then with the numbers; the body stays', () => {
    const mv = step(openSheet(P7_1000_WIND), 'Muzzle velocity')
    const q = within(mv).getByRole('button', { name: 'About: Muzzle velocity' })
    fireEvent.click(q)
    const why = document.getElementById(q.getAttribute('aria-controls')!)!
    expect(why).toHaveClass('calc-why')
    expect(why.querySelector('.calc-why-text')).toHaveTextContent(translate('en', 'calc.why.mv'))
    const work = why.querySelector('.calc-work')!
    expect(why.querySelector('.calc-why-text')!.nextElementSibling).toBe(work)
    const lines = [...work.querySelectorAll('p')]
    expect(lines[0]).toHaveClass('calc-w', 'calc-w-symbols')
    expect(lines[0]).toHaveTextContent('v = v_ref + sens · (t_powder − t_ref)')
    expect(lines[1]).toHaveClass('calc-w', 'calc-w-numbers')
    expect(lines[1]).toHaveTextContent('v = 900 + 0 · (15 − 15) = 900 m/s')
    // The step's body keeps its own line.
    expect([...mv.querySelectorAll('.calc-d')].some((p) => /900 \+ 0 · \(15 − 15\) = 900\sm\/s/.test(p.textContent!))).toBe(true)
  })

  it('the working ends on the body’s own figures: the Litz drift, the hold, the hit chance', () => {
    const sheet = openSheet(P7_1000_WIND)
    const workOf = (name: string) => {
      const st = step(sheet, name)
      fireEvent.click(within(st).getByRole('button', { name: `About: ${name}` }))
      return { st, lines: [...st.querySelectorAll('.calc-work p')].map((p) => p.textContent!) }
    }
    const spin = workOf('Spin drift')
    const inches = [...spin.st.querySelectorAll('.calc-d')].map((p) => p.textContent!).find((l) => l.startsWith('Litz'))!.match(/= ([\d.]+)\sin$/)![1]
    expect(spin.lines.at(-1)).toMatch(new RegExp(`= ${inches.replace('.', '\\.')}\\sin = `))
    const windage = workOf('Windage total')
    const hold = windage.st.querySelector('.calc-v')!.textContent!.replace(/^hold /, '')
    expect(windage.lines.at(-1)!.endsWith(`= ${hold}`)).toBe(true)
    const hit = workOf('Hit chance')
    expect(hit.lines.at(-1)).toContain(hit.st.querySelector('.calc-v')!.textContent!)
  })

  it('one yours rule: step 8’s crosswind and calibres are green in the body as W and L are in its working', () => {
    // A wind by link (by hand) and a round of your own, whose length you typed.
    localStorage.setItem('gb.real.library', JSON.stringify({ ...SLOW_LOAD, rounds: [{ ...SLOW_LOAD.rounds[0], muzzleVelocityMs: 800, bc: 0.243, dragModel: 'G7' }] }))
    const jump = step(openSheet('#/real/workbench?cr=u-round&cf=u-rifle&d=600&ws=3&wc=9'), 'Aerodynamic jump')
    fireEvent.click(within(jump).getByRole('button', { name: 'About: Aerodynamic jump' }))
    const body = [...jump.querySelectorAll('.calc-d b.calc-yours')].map((b) => b.textContent)
    // 31.5 mm on .308: 4.0 calibres.
    expect(body).toEqual([translate('en', 'calc.in.crossLeft', { s: '3.0 m/s' }), translate('en', 'calc.in.calibres', { l: '4.0' })])
    const [L, W, ...rest] = [...jump.querySelectorAll('.calc-work b.calc-yours')].map((b) => b.textContent!)
    // The working's L and W, with any decimals it adds to keep J's arithmetic true.
    expect([L, W, rest]).toEqual([expect.stringMatching(/^4\.0\d*$/), expect.stringMatching(/^6\.7\d* mph$/), []])
  })

  it('your values in the working are green', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({ v: 1, tempC: { value: 12, source: 'manual' } }))
    const air = step(openSheet(P7_1000_WIND), 'Air')
    fireEvent.click(within(air).getByRole('button', { name: 'About: Air' }))
    const yours = [...air.querySelectorAll('.calc-work b.calc-yours')].map((b) => b.textContent)
    expect(yours).toContain('12')
    expect(yours).not.toContain('0.00')
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

describe('CalcSheet: says what is off', () => {
  type Nulls = Partial<Record<'twistIn' | 'mvRefTempC' | 'powderSensMsPerC' | 'accuracyMoa' | 'mvSdMs' | 'travelUp', null>> & { diameterIn?: null; lengthMm?: null }

  /** P7 with some optional inputs left out, its sheet rendered directly, in `lang`. */
  function sheetWith(nulls: Nulls, o: Overrides = {}, { lang = 'en', customScope = false, azimuth = false } = {}) {
    const base = resolvePreset(PRESETS.find((x) => x.id === 'p7')!, o)
    const { diameterIn, lengthMm, ...top } = nulls
    const p = {
      ...base,
      ...top,
      bullet: { ...base.bullet, ...(diameterIn === null ? { diameterIn: null } : {}), ...(lengthMm === null ? { lengthMm: null } : {}) },
    }
    const setup = { ...DEFAULT_SETUP, distanceM: 800, windMs: 3, windClock: 9 }
    const station = { ...STANDARD_STATION, tempC: { value: 35, source: 'manual' as const }, ...(azimuth ? { azimuthDeg: { value: 90, source: 'manual' as const } } : {}) }
    const s = solveModule.solveReal(p, setup, DEFAULT_REAL_PROFILE, station, 'mil', { shares: true, hit: true })
    const route = { game: 'real', page: 'workbench' as const, params: new URLSearchParams(`l=${lang}`) }
    render(
      <SettingsProvider route={route} navigate={() => {}}>
        <CalcSheet solution={s} customScope={customScope} onClose={() => {}} returnFocus={{ current: null }} />
      </SettingsProvider>,
    )
    return screen.getByRole('dialog')
  }
  const text = (sheet: HTMLElement, name: string) => step(sheet, name).textContent

  it('says the powder temperature is off without the sensitivity', () => {
    const sheet = sheetWith({ powderSensMsPerC: null })
    expect(sheet).toHaveTextContent("Off: the powder sensitivity isn't set.")
    cleanup()
    expect(sheetWith({ powderSensMsPerC: null }, {}, { lang: 'cs' })).toHaveTextContent('Vypnuto: chybí citlivost prachu na teplotu.')
  })

  it('says the powder temperature is off without the reference temperature', () => {
    expect(sheetWith({ mvRefTempC: null }, { powderSensMsPerC: 1.5 })).toHaveTextContent("Off: the MV's reference temperature isn't set.")
    cleanup()
    expect(sheetWith({ mvRefTempC: null }, { powderSensMsPerC: 1.5 }, { lang: 'cs' })).toHaveTextContent('Vypnuto: chybí teplota, pro kterou platí rychlost.')
  })

  it.each([
    ['twist', { twistIn: null }, "Off: the twist isn't set.", 'Vypnuto: chybí stoupání drážek.'],
    ['length', { lengthMm: null }, "Off: the bullet length isn't set.", 'Vypnuto: chybí délka střely.'],
    ['diameter', { diameterIn: null }, "Off: the bullet diameter isn't set.", 'Vypnuto: chybí průměr střely.'],
  ] as const)('says spin drift and the jump are off without the %s', (_n, nulls, en, cs) => {
    const sheet = sheetWith(nulls)
    for (const name of ['Spin drift', 'Aerodynamic jump']) {
      expect(text(sheet, name)).toContain(en)
      expect(within(sheet).getByRole('switch', { name })).toBeDisabled()
    }
    expect(within(step(sheet, 'Spin drift')).queryByText(/^Sg /)).not.toBeInTheDocument()
    cleanup()
    const sheetCs = sheetWith(nulls, {}, { lang: 'cs' })
    expect(text(sheetCs, 'Spin drift')).toContain(cs)
    expect(text(sheetCs, 'Aerodynamický skok')).toContain(cs)
  })

  it('names the first missing of twist, length and diameter', () => {
    expect(text(sheetWith({ twistIn: null, lengthMm: null, diameterIn: null }), 'Spin drift')).toContain("Off: the twist isn't set.")
  })

  it('says the SD is left out of the hit chance', () => {
    expect(text(sheetWith({ mvSdMs: null }), 'Hit chance')).toContain("Off: the MV SD isn't set, so it adds nothing to the hit chance.")
    cleanup()
    expect(text(sheetWith({ mvSdMs: null }, {}, { lang: 'cs' }), 'Šance na zásah')).toContain('Vypnuto: chybí SD rychlosti, do šance na zásah nevstupuje.')
  })

  it("says the rifle's accuracy is left out", () => {
    expect(text(sheetWith({ accuracyMoa: null }), 'Hit chance')).toContain("Off: the rifle's accuracy isn't set, so it adds nothing to the hit chance.")
    cleanup()
    expect(text(sheetWith({ accuracyMoa: null }, {}, { lang: 'cs' }), 'Šance na zásah')).toContain('Vypnuto: chybí přesnost pušky, do šance na zásah nevstupuje.')
  })

  it('says the whole elevation is dialled without the travel (a built-in preset with unknown travel shows it too)', () => {
    expect(text(sheetWith({}), 'Elevation')).toContain("Off: the turret travel isn't set, so the whole elevation is dialled.")
    cleanup()
    expect(text(sheetWith({}, {}, { lang: 'cs' }), 'Výška')).toContain('Vypnuto: chybí zdvih věžičky, točí se celá výška.')
    cleanup()
    const set = text(sheetWith({}, { travelUp: 20, scopeUnit: 'mil' }), 'Elevation')
    expect(set).toMatch(/turret travel 20\sMRAD/)
    expect(set).not.toContain('Off:')
  })

  it('says magnification has no model, only for a custom scope', () => {
    expect(text(sheetWith({}, {}, { customScope: true }), 'Hit chance')).toContain('Off: magnification has no model yet.')
    cleanup()
    expect(text(sheetWith({}, {}, { customScope: true, lang: 'cs' }), 'Šance na zásah')).toContain('Vypnuto: zvětšení zatím nemá model.')
    cleanup()
    expect(text(sheetWith({}), 'Hit chance')).not.toContain('magnification')
  })

  it('says the vertical Coriolis is off without the azimuth', () => {
    expect(text(sheetWith({}), 'Coriolis and Eötvös')).toContain("Off: the shooting direction isn't set, so the vertical part of Coriolis is left out.")
    cleanup()
    expect(text(sheetWith({}, {}, { lang: 'cs' }), 'Coriolis a Eötvös')).toContain('Vypnuto: není zadaný směr střelby, svislá část Coriolise se nepočítá.')
    cleanup()
    expect(text(sheetWith({}, {}, { azimuth: true }), 'Coriolis and Eötvös')).not.toContain("direction isn't set")
  })

  it("keeps the effect's switch disabled with the sentence as its description", () => {
    const sheet = sheetWith({ powderSensMsPerC: null, twistIn: null })
    for (const [name, sentence] of [['Powder temperature', "Off: the powder sensitivity isn't set."], ['Spin drift', "Off: the twist isn't set."]]) {
      const sw = within(sheet).getByRole('switch', { name })
      expect(sw).toBeDisabled()
      expect(sw).toHaveAccessibleDescription(sentence)
    }
  })
})

describe('CalcSheet: wind zones', () => {
  it('with zones active drops the lag line and gives one line per shown zone', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=1500&ws=3&wc=9&zn=1&zf=5,9')
    const wind = step(sheet, 'Wind')
    expect(within(wind).queryByText(/lag rule/)).toBeNull()
    expect(wind).toHaveTextContent(/Near: 3 m\/s from 9 o’clock/)
    expect(wind).toHaveTextContent(/Near: crosswind 3\.0\sm\/s from the left, makes →\d+ cm of the drift/)
    expect(wind).toHaveTextContent(/Middle: crosswind 3\.0\sm\/s from the left/)
    expect(wind).toHaveTextContent(/Far: crosswind 5\.0\sm\/s from the left/)
    expect(wind.textContent!.match(/of the drift/g)).toHaveLength(3)
  })

  /** The zone lines of the Wind step's body, and the crosswinds marked yours in its working. */
  function zonesOf(hash: string) {
    const wind = step(openSheet(hash), 'Wind')
    fireEvent.click(within(wind).getByRole('button', { name: 'About: Wind' }))
    const zone = (name: string) => within(wind).getAllByText(new RegExp(`^${name}:.*of the drift`)).at(-1)!.closest('.calc-i')!
    const working = [...wind.querySelectorAll('.calc-work .calc-w-numbers b.calc-yours')].map((b) => b.textContent)
    return { zone, working }
  }

  it('with the near wind set by hand every zone is yours, one that follows it too', () => {
    // The link's wind counts as set by hand; the middle zone follows it, the far one has its own.
    const { zone, working } = zonesOf('#/real/workbench?p=p7&d=1500&ws=3&wc=9&zn=1&zf=5,9')
    for (const name of ['Near', 'Middle', 'Far']) {
      expect(zone(name).querySelector('b')).toHaveClass('calc-yours')
      expect(zone(name).querySelector('.tag')).toHaveClass('yours')
    }
    expect(working).toEqual(['3.0', '3.0', '5.0'])
  })

  it('with a forecast wind only a zone with a wind of its own is yours, in the body and the working', () => {
    localStorage.setItem('gb.real.wind', JSON.stringify({ fromDeg: 180, hour: 9, speedMs: 3, source: 'forecast' }))
    const { zone, working } = zonesOf('#/real/workbench?p=p7&d=1500&ws=3&wc=9&zn=1&zm=4,9')
    expect(zone('Middle').querySelector('b')).toHaveClass('calc-yours')
    expect(zone('Middle').querySelector('.tag')).toHaveClass('yours')
    for (const name of ['Near', 'Far']) {
      expect(zone(name).querySelector('b')).not.toHaveClass('calc-yours')
      expect(zone(name).querySelector('.tag')).toBeNull()
    }
    expect(working).toEqual(['4.0'])
  })

  it('opposing zones show their side and signed drift, adding up to the drift shown', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=1500&ws=3&wc=9&zn=1&zm=0,12&zf=3,3')
    const wind = step(sheet, 'Wind')
    expect(wind).toHaveTextContent(/Near: crosswind 3\.0\sm\/s from the left, makes →\d/)
    expect(wind).toHaveTextContent(/Middle: no crosswind, makes 0 of the drift/)
    expect(wind).toHaveTextContent(/Far: crosswind 3\.0\sm\/s from the right, makes ←\d/)
  })

  it('a calm near wind with a far wind of its own still takes the wind branch', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=1000&ws=0&wc=9&zn=1&zf=4,9')
    const wind = step(sheet, 'Wind')
    expect(wind).not.toHaveTextContent(/no wind/)
    expect(wind).toHaveTextContent(/Far: crosswind 4\.0\sm\/s from the left/)
  })

  it('zones on but every zone calm shows the no-wind branch like the view', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=1000&ws=0&wc=9&zn=1')
    const wind = step(sheet, 'Wind')
    expect(wind).toHaveTextContent(/no wind/)
    expect(wind).not.toHaveTextContent(/of the drift/)
  })
})

describe('CalcSheet: your values', () => {
  it('marks a typed temperature green, with a yours tag, and leaves the standard pressure alone', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({ v: 1, tempC: { value: 12, source: 'manual' } }))
    const air = step(openSheet(P7_1000_WIND), 'Air')
    const temp = within(air).getByText('temperature').closest('.calc-i')!
    expect(temp.querySelector('b')).toHaveClass('calc-yours')
    expect(temp.querySelector('.tag')).toHaveClass('yours')
    expect(temp.querySelector('.tag')).not.toHaveClass('acc')
    const press = within(air).getByText('station pressure').closest('.calc-i')!
    expect(press.querySelector('b')).not.toHaveClass('calc-yours')
  })

  it('shows the distance in Flight as yours', () => {
    const flight = step(openSheet(P7_1000_WIND), 'Flight')
    expect(flight).toHaveTextContent('distance 1000 m')
    const item = within(flight).getByText('distance').closest('.calc-i')!
    expect(item.querySelector('b')).toHaveClass('calc-yours')
    expect(item.querySelector('.tag')).toHaveTextContent('yours')
  })

  it('gives the distance in Flight in yards under imperial, the metres in brackets, still yours', () => {
    const sheet = openSheet('#/real/workbench?p=p7&d=800&u=imperial')
    expect(within(sheet).getByRole('heading', { level: 2 })).toHaveTextContent('875 yd')
    const flight = step(sheet, 'Flight')
    expect(flight).toHaveTextContent('distance 875 yd (800 m) yours')
    const item = within(flight).getByText('distance').closest('.calc-i')!
    expect(item.querySelector('b')).toHaveClass('calc-yours')
    expect(item.querySelector('.tag')).toHaveTextContent('yours')
    cleanup()
    expect(step(openSheet('#/real/workbench?p=p7&d=800'), 'Flight')).toHaveTextContent(/distance 800 m yours/)
  })

  it('marks the scope’s zero, click and travel green only once you set them, in the body and the working', () => {
    const scopeItems = (sheet: HTMLElement) => {
      const elevation = step(sheet, 'Elevation')
      const item = (word: RegExp) => within(elevation).getByText(word).closest('.calc-i')!
      return { elevation, zero: item(/^zero/), click: item(/clicks? of/) }
    }
    const plain = scopeItems(openSheet(P7_1000_WIND))
    expect(plain.zero.querySelector('b')).not.toHaveClass('calc-yours')
    expect(plain.click.querySelector('b')).not.toHaveClass('calc-yours')
    cleanup()
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { zeroM: 200, clickValue: 0.05, scopeUnit: 'mil' } } }))
    const set = scopeItems(openSheet(P7_1000_WIND))
    expect(set.zero).toHaveTextContent('zero 200 m')
    expect(set.zero.querySelector('b')).toHaveClass('calc-yours')
    expect(set.zero.querySelector('.tag')).toHaveTextContent('yours')
    expect(set.click.querySelector('b')).toHaveClass('calc-yours')
    expect(set.click.querySelector('.tag')).toHaveTextContent('yours')
    // The working's click c is green as the body's.
    fireEvent.click(within(set.elevation).getByRole('button', { name: 'About: Elevation' }))
    const mine = [...set.elevation.querySelectorAll('.calc-work b.calc-yours')].map((b) => b.textContent!.replace(/\s/g, ' '))
    expect(mine).toContain('0.05 MRAD')
    localStorage.clear()
  })

  it('says tvoje in Czech', () => {
    open('#/real/workbench?l=cs&p=p7&d=600')
    fireEvent.click(screen.getByRole('button', { name: 'Jak se to počítá' }))
    const flight = step(screen.getByRole('dialog', { name: /Jak se to počítá/ }), 'Let')
    expect(within(flight).getByText('vzdálenost').closest('.calc-i')!.querySelector('.tag')).toHaveTextContent('tvoje')
  })

  it('marks a wind set by hand, not a forecast wind', () => {
    const wind = step(openSheet(P7_1000_WIND), 'Wind')
    expect(wind.querySelector('.calc-i b')).toHaveClass('calc-yours')
    cleanup()
    localStorage.setItem('gb.real.wind', JSON.stringify({ fromDeg: 180, hour: 9, speedMs: 3, source: 'forecast' }))
    const forecast = step(openSheet(P7_1000_WIND), 'Wind')
    expect(forecast.querySelector('.calc-i b')).not.toHaveClass('calc-yours')
  })

  it('shows the slope as yours', () => {
    const slope = within(openSheet('#/real/workbench?p=p7&d=500&sl=10')).getByRole('heading', { name: /Slope|slope/ }).closest<HTMLElement>('.calc-step')!
    const first = slope.querySelector('.calc-i b')!
    expect(first).toHaveTextContent('10°')
    expect(first).toHaveClass('calc-yours')
  })
})
