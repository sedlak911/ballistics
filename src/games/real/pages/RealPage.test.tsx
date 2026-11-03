import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'
import { translate, type TKey } from '../../../i18n'
import { writeLinkOverrides } from '../profiles'
import { incompleteFields, UNSET_ORDER } from '../selection'

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

const profile = (p: object) => localStorage.setItem('gb.real.profile', JSON.stringify(p))
const elevation = () => screen.getByTestId('real-elevation')
const windage = () => screen.getByTestId('real-windage')
const columns = () => screen.queryByRole('list', { name: 'Hold for less, the same and more wind' })
const hash = () => window.location.hash

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

afterEach(cleanup)

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

describe('RealPage: the answer in dial mode', () => {
  it('opens on REAL from a bare URL, with the elevation key', () => {
    open('')
    const nav = screen.getByRole('navigation', { name: 'Game' })
    expect(within(nav).getByRole('link', { name: 'REAL' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Elevation')).toBeInTheDocument()
    expect(screen.getByText('Windage')).toBeInTheDocument()
  })

  it('gives P7 at 1000 m about 8.3 MRAD up, with the clicks and what is left over', () => {
    open('#/real/workbench?p=p7&d=1000')
    expect(elevation()).toHaveTextContent(/^↑8\.\dMRAD$/)
    expect(screen.getByTestId('real-dial-line')).toHaveTextContent(/^8\d clicks up · \d+ cm left over$/)
  })

  it('holds left with three wind columns for 3 m/s from 9; with no wind, says what 1 m/s does instead', () => {
    open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
    expect(windage()).toHaveTextContent(/^←1\.\dMRAD$/)
    expect(screen.getByText(/^target on the 1\.\d mark right of centre$/)).toBeInTheDocument()
    const items = within(columns()!).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items.map((li) => li.querySelector('.real-col-speed')!.textContent)).toEqual(['2\u00a0m/s', '3\u00a0m/s', '4\u00a0m/s'])
    expect(items[1]).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText(/from the side moves the hit/).closest('[aria-hidden="true"]')).not.toBeNull()
    cleanup()
    open('#/real/workbench?p=p7&d=1000&ws=0')
    expect(columns()).not.toBeInTheDocument()
    expect(screen.getByText(/^1\sm\/s from the side moves the hit \d+\scm \(0\.\d\d\sMRAD\)$/)).toBeInTheDocument()
  })

  it("keeps the wind columns' place when the wind is calm", () => {
    const { container } = open('#/real/workbench?p=p7&d=1000&ws=0')
    const cols = container.querySelector('.real-cols')
    expect(cols).not.toBeNull()
    expect(cols).toHaveAttribute('aria-hidden', 'true')
    // The answer's block has its own class (the dock's wind tool keeps `real-wind`), and the hidden state is a class.
    expect(cols).toHaveClass('is-hidden')
    expect(cols!.parentElement).toHaveClass('real-answer-wind')
    expect(cols!.parentElement).not.toHaveClass('real-wind')
    expect(cols!.querySelectorAll('li')).toHaveLength(3)
    expect(columns()).not.toBeInTheDocument()
    cleanup()
    const windy = open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
    expect(columns()).toBeInTheDocument()
    expect(windy.container.querySelector('.real-cols')).not.toHaveAttribute('aria-hidden')
    expect(windy.container.querySelector('.real-cols')).not.toHaveClass('is-hidden')
    expect(windy.container.querySelector('.real-answer-wind .real-sub')).toHaveClass('is-hidden')
  })

  // M2: a wind step per unit that moves the hit visibly, and a tenth of a cm below 10 cm.
  it('with no wind says what 5 km/h does at 200 m, in tenths of a cm; in Czech with a decimal comma', () => {
    profile({ windUnit: 'km/h' })
    open('#/real/workbench?p=p7&d=200&ws=0')
    expect(screen.getByText(/^5\skm\/h from the side moves the hit 1\.8\scm \(0\.09\sMRAD\)$/)).toBeInTheDocument()
    cleanup()
    open('#/real/workbench?l=cs&p=p7&d=200&ws=0')
    expect(screen.getByText(/^5\skm\/h z boku posune zásah o 1,8\scm \(0,09\sMRAD\)$/)).toBeInTheDocument()
    cleanup()
    profile({ windUnit: 'mph' })
    open('#/real/workbench?p=p7&d=1000&ws=0')
    expect(screen.getByText(/^2\smph from the side moves the hit 38\scm \(0\.38\sMRAD\)$/)).toBeInTheDocument()
    profile({})
  })

  it('never prints a negative zero: at the zero distance the answer is a plain 0', () => {
    open('#/real/workbench?p=p7&d=100&ws=0')
    expect(elevation()).toHaveTextContent(/^0MRAD$/)
    expect(screen.getByTestId('real-dial-line')).toHaveTextContent(/^0 clicks · \d+ cm left over$/)
    // The answer, not the bar: there a − button sits next to the wind's 0.
    expect(document.querySelector('.real-grid')!.textContent).not.toMatch(/[-−]0(\.0+)?(?!\d)/)
    expect(windage()).toHaveTextContent(/^0MRAD$/)
    expect(screen.getByText('target on the centre')).toBeInTheDocument()
  })

  it('shows the hit chance, the biggest error and the group, and the target control, on a large screen only', () => {
    open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
    expect(screen.getByTestId('real-hit')).toHaveTextContent(/^50 cm target: ≈ \d+ %\. The wind guess costs the most\./)
    expect(screen.getByTestId('real-hit')).toHaveTextContent(/group ≈ \d+ × \d+ cm/)
    expect(screen.queryByRole('group', { name: 'Target' })).not.toBeInTheDocument()
    cleanup()
    onPhone(() => {
      open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
      expect(screen.queryByTestId('real-hit')).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Target' })).not.toBeInTheDocument()
      expect(within(screen.getByTestId('real-dock')).getByRole('button', { name: /^Distance\s\d+\sm/ })).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('lists only the warnings that apply, as estimate notes', () => {
    open('#/real/workbench?p=p1&d=800')
    expect(screen.getByText(/^Subsonic at the target/)).toBeInTheDocument()
    expect(screen.queryByText(/^Transonic at the target/)).not.toBeInTheDocument()
    cleanup()
    open('#/real/workbench?p=p7&d=1000')
    expect(screen.queryByText(/^Subsonic at the target/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Transonic at the target/)).not.toBeInTheDocument()
  })

  it('says the load is out of range and shows no figure when the bullet does not get there', () => {
    localStorage.setItem('gb.real.library', JSON.stringify(SLOW_LOAD))
    open('#/real/workbench?cr=u-round&cf=u-rifle&d=2500')
    expect(screen.getByText('Out of range for this load')).toBeInTheDocument()
    expect(screen.queryByTestId('real-elevation')).not.toBeInTheDocument()
    // In the answer: the scope tag in the header names the unit (I5).
    const answer = within(document.querySelector<HTMLElement>('.real-grid')!)
    expect(answer.queryByText('MRAD')).not.toBeInTheDocument()
    expect(answer.queryByText(/clicks/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('real-hit')).not.toBeInTheDocument()
  })

  it('renders the calculation button, which opens the sheet', () => {
    open('#/real/workbench')
    const btn = screen.getByRole('button', { name: 'How it’s calculated' })
    expect(btn).toBeEnabled()
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('speaks Czech', () => {
    open('#/real/workbench?l=cs&p=p7&d=1000&ws=3&wc=9')
    expect(screen.getByText('Výška')).toBeInTheDocument()
    expect(screen.getByText('· natoč')).toBeInTheDocument()
    expect(screen.getByTestId('real-dial-line')).toHaveTextContent(/^8\d kliků nahoru · zbývá \d+ cm$/)
    expect(screen.getByText(/^terč na značku 1,\d vpravo od středu$/)).toBeInTheDocument()
    expect(screen.getByTestId('real-hit')).toHaveTextContent(/^Terč 50 cm: zásah ≈ \d+ %\. Nejvíc chyby dělá odhad větru\./)
    expect(screen.getByRole('button', { name: /Jak se to počítá/ })).toBeInTheDocument()
  })
})

describe('RealPage: hold mode', () => {
  it('puts the round target in the reticle, with both holds under it', () => {
    profile({ mode: 'hold' })
    open('#/real/workbench?p=p7&d=600&ws=3&wc=9')
    const scope = screen.getByRole('img', { name: /MRAD/ })
    expect(within(scope).getByTestId('disc')).toBeInTheDocument()
    expect(within(scope).getByTestId('spread')).toBeInTheDocument()
    expect(scope).toHaveTextContent(/HOLD ↑\d\.\d/)
    expect(scope).toHaveTextContent(/HOLD LEFT \d\.\d/)
    expect(elevation()).toHaveTextContent(/^↑\d\.\dMRAD$/)
    expect(windage()).toHaveTextContent(/^←\d\.\dMRAD$/)
    expect(screen.getAllByText('· hold')).toHaveLength(2)
    expect(screen.queryByText(/Beyond the reticle/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('real-dial-line')).not.toBeInTheDocument()
  })

  it('says when the hold is beyond the reticle and gives the dial instead (P3 at 1500 m)', () => {
    profile({ mode: 'hold' })
    open('#/real/workbench?p=p3&d=1500')
    expect(screen.getByRole('img', { name: /MRAD/ })).toHaveTextContent(/Beyond the reticle/)
    expect(screen.getByTestId('real-dial-line')).toHaveTextContent(/^Dial instead: \d+ clicks up · \d+ cm left over$/)
  })
})

describe('RealPage: the bottom bar', () => {
  it('keeps the last distance when the typed one is not a number', () => {
    open('#/real/workbench?p=p7&d=1000')
    const before = elevation().textContent
    const field = screen.getByLabelText('Distance')
    fireEvent.change(field, { target: { value: 'abc' } })
    fireEvent.blur(field)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Type a distance from 25 to 2500 m')
    expect(hash()).toContain('d=1000')
    expect(elevation().textContent).toBe(before)
    fireEvent.change(field, { target: { value: '800' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(hash()).toContain('d=800')
  })

  it('steps the distance by 10 m, or by 10 yd in yards', () => {
    open('#/real/workbench?p=p7&d=1000')
    fireEvent.click(screen.getByRole('button', { name: 'Distance: more' }))
    expect(hash()).toContain('d=1010')
    fireEvent.click(screen.getByRole('button', { name: 'Distance: less' }))
    fireEvent.click(screen.getByRole('button', { name: 'Distance: less' }))
    expect(hash()).toContain('d=990')
    cleanup()
    open('#/real/workbench?p=p7&d=914.4&u=imperial')
    expect(screen.getByLabelText('Distance')).toHaveValue('1000')
    fireEvent.click(screen.getByRole('button', { name: 'Distance: more' }))
    expect(screen.getByLabelText('Distance')).toHaveValue('1010')
    expect(hash()).toContain('d=923.544')
  })

  it('shows 25 m in yards unflagged, though 27 yd is under what the box accepts', () => {
    open('#/real/workbench?p=p7&d=25&u=imperial')
    expect(screen.getByLabelText('Distance')).toHaveValue('27')
    expect(screen.getByLabelText('Distance')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // M1: whole yards, a tenth of a metre, and the steps land on tens in the unit shown.
  it('shows 1000 m as 1094 yd, + goes to 1100 yd (1005.84 m), and metric then shows 1005.8', () => {
    const d = () => new URLSearchParams(hash().split('?')[1]).get('d')
    const field = () => screen.getByLabelText('Distance')
    open('#/real/workbench?p=p7&d=1000&u=imperial')
    expect(field()).toHaveValue('1094')
    // Tabbing through commits nothing: the shown 1094 yd is not 1000.39 m.
    fireEvent.focus(field())
    fireEvent.blur(field())
    expect(d()).toBe('1000')
    fireEvent.click(screen.getByRole('button', { name: 'Distance: more' }))
    expect(field()).toHaveValue('1100')
    expect(d()).toBe('1005.84')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Units' })).getByRole('button', { name: 'm' }))
    expect(field()).toHaveValue('1005.8')
    fireEvent.blur(field())
    expect(d()).toBe('1005.84')
    fireEvent.click(screen.getByRole('button', { name: 'Distance: less' }))
    expect(d()).toBe('1000')
    fireEvent.click(screen.getByRole('button', { name: 'Distance: less' }))
    expect(d()).toBe('990')
  })

  it('the distance field\'s arrow keys step like its buttons: 1094 yd up is 1100, down is 1090', () => {
    const d = () => new URLSearchParams(hash().split('?')[1]).get('d')
    const field = () => screen.getByLabelText('Distance')
    open('#/real/workbench?p=p7&d=1000&u=imperial')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field()).toHaveValue('1100')
    expect(d()).toBe('1005.84')
    cleanup()
    open('#/real/workbench?p=p7&d=1000&u=imperial')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field()).toHaveValue('1090')
  })

  it('sets the slope by typing', () => {
    open('#/real/workbench?p=p7&d=1000')
    const slope = screen.getByRole('textbox', { name: 'Slope' })
    fireEvent.change(slope, { target: { value: '5' } })
    fireEvent.keyDown(slope, { key: 'Enter' })
    expect(hash()).toContain('sl=5')
  })

  it('steps the wind in the chosen unit and stores it in m/s', () => {
    open('#/real/workbench?p=p7&d=1000&ws=0')
    const field = () => screen.getByLabelText('Wind speed') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: more' }))
    expect(field().value).toBe('0.5')
    expect(hash()).toContain('ws=0.5')
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: less' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: less' }))
    expect(field().value).toBe('0')
    cleanup()
    profile({ windUnit: 'km/h' })
    open('#/real/workbench?p=p7&d=1000&ws=0')
    expect(screen.getByText(/^5\skm\/h from the side moves the hit \d+(\.\d)?\scm/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: more' }))
    expect(field().value).toBe('2')
    expect(hash()).toContain('ws=0.556')
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: more' }))
    expect(field().value).toBe('4')
    expect(hash()).toContain('ws=1.111')
    profile({})
  })

  it('goes from 3.2 m/s to 3.5 with +', () => {
    open('#/real/workbench?p=p7&d=1000&ws=3.2')
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: more' }))
    expect(hash()).toContain('ws=3.5')
    expect((screen.getByLabelText('Wind speed') as HTMLInputElement).value).toBe('3.5')
  })

  it('takes a typed wind with a Czech decimal comma as 3.5 m/s', () => {
    open('#/real/workbench?l=cs&p=p7&d=1000&ws=0')
    const field = screen.getByLabelText('Rychlost větru')
    fireEvent.change(field, { target: { value: '3,5' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(hash()).toContain('ws=3.5')
    expect((screen.getByLabelText('Rychlost větru') as HTMLInputElement).value).toBe('3.5')
  })

  it('rounds a typed wind to one decimal in the owner\'s unit before solving', () => {
    open('#/real/workbench?p=p7&d=1000&ws=0')
    const field = screen.getByLabelText('Wind speed')
    fireEvent.change(field, { target: { value: '3,25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(hash()).toContain('ws=3.3')
    expect((screen.getByLabelText('Wind speed') as HTMLInputElement).value).toBe('3.3')
  })

  it('writes the limit in the invalid-wind message with the Czech decimal comma', () => {
    profile({ windUnit: 'mph' })
    open('#/real/workbench?l=cs&p=p7&d=1000&ws=3')
    const field = screen.getByLabelText('Rychlost větru')
    fireEvent.change(field, { target: { value: '99' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent(/do 55,9\smph$/)
    profile({})
  })

  it('refuses a wind above the limit with the message', () => {
    open('#/real/workbench?p=p7&d=1000&ws=3')
    const field = screen.getByLabelText('Wind speed')
    fireEvent.change(field, { target: { value: '40' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('Type a wind speed from 0 to 25')
    expect(hash()).toContain('ws=3')
  })

  it('in knots shows what was typed after the m/s round trip', () => {
    profile({ windUnit: 'kn' })
    open('#/real/workbench?p=p7&d=1000&ws=0')
    const field = screen.getByLabelText('Wind speed') as HTMLInputElement
    fireEvent.change(field, { target: { value: '7' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    cleanup()
    open(hash())
    expect((screen.getByLabelText('Wind speed') as HTMLInputElement).value).toBe('7')
    profile({})
  })

  it('sets where the wind blows from on the clock', () => {
    open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
    fireEvent.click(screen.getByRole('button', { name: /Wind direction: from 9 o’clock/ }))
    const dial = within(screen.getByRole('dialog', { name: 'Wind direction' })).getByRole('slider', { name: 'Wind blows from' })
    expect(dial).toHaveAttribute('aria-valuetext', '9 o’clock, 3\u00a0m/s')
    fireEvent.keyDown(dial, { key: 'ArrowRight' })
    expect(hash()).toContain('wc=10')
    expect(screen.getByRole('button', { name: /Wind direction: from 10 o’clock/ })).toBeInTheDocument()
  })

  it('reads a stored tg=120 as the fixed 50 cm target', () => {
    localStorage.setItem('gb.real.setup', 'p=p7&d=1000&ws=3&wc=9&tg=120')
    open('#/real/workbench')
    expect(screen.getByTestId('real-hit')).toHaveTextContent(/^50 cm target/)
    cleanup()
    localStorage.removeItem('gb.real.setup')
  })
})

describe('RealPage: the big figure', () => {
  const text = (id: string) => screen.getByTestId(id).textContent!.replace(/\u00a0/g, ' ')
  const writeO = (o: object) => `o=${writeLinkOverrides(o)}`

  // As in 0.1.0: the clicks sit in the small dial line under the angle, with no line of their own.
  it('value: the angle is the hero, the dial line gives the clicks and what is left over', () => {
    open('#/real/workbench?p=p7&d=300&ws=0')
    expect(text('real-elevation')).toBe('↑1.0MRAD')
    expect(screen.queryByTestId('real-clicks')).not.toBeInTheDocument()
    expect(text('real-dial-line')).toBe('10 clicks up · 0 cm left over')
  })

  it('clicks: the clicks are the hero with their word as the unit, the angle moves to the dial line', () => {
    profile({ primary: 'clicks' })
    open('#/real/workbench?p=p7&d=300&ws=0')
    expect(text('real-elevation')).toBe('↑10clicks')
    expect(screen.queryByTestId('real-clicks')).not.toBeInTheDocument()
    expect(text('real-dial-line')).toBe('1.0 MRAD · 0 cm left over')
  })

  it('clicks, dialling down: the hero has the arrow, the dial line has no minus sign', () => {
    profile({ primary: 'clicks' })
    open(`#/real/workbench?p=p7&d=100&ws=0&${writeO({ zeroM: 300 })}`)
    expect(text('real-elevation')).toMatch(/^↓\d+clicks?$/)
    expect(text('real-dial-line')).toMatch(/^\d+\.\d MRAD · /)
  })

  it('speaks the Czech plural of the word', () => {
    profile({ primary: 'clicks' })
    open('#/real/workbench?l=cs&p=p7&d=300&ws=0')
    expect(text('real-elevation')).toBe('↑10kliků')
  })

  it('at the zero distance there is no direction', () => {
    open('#/real/workbench?p=p7&d=100&ws=0')
    expect(text('real-dial-line')).toMatch(/^0 clicks · \d+ cm left over$/)
  })

  it('on a capped turret, clicks makes the dialled clicks the hero, with the dial-and-hold sentence', () => {
    profile({ primary: 'clicks' })
    open(`#/real/workbench?p=p7&d=1500&ws=0&${writeO({ travelUp: 1, scopeUnit: 'mil' })}`)
    expect(text('real-elevation')).toBe('↑10clicks')
    expect(text('real-dial-line')).toMatch(/^dial 1\.0 \(10 clicks\), hold ↑\d+\.\d in the reticle$/)
  })

  it('hold mode ignores it', () => {
    profile({ mode: 'hold', primary: 'clicks' })
    open('#/real/workbench?p=p7&d=300&ws=0')
    expect(text('real-elevation')).toBe('↑1.0MRAD')
    expect(screen.queryByTestId('real-clicks')).not.toBeInTheDocument()
  })
})

describe('RealPage: a custom selection', () => {
  const ROUND = 'u-round-1'
  const seed = (round: object) => localStorage.setItem('gb.real.library', JSON.stringify({ v: 1, rifles: [], rounds: [{ id: ROUND, rifleId: 'axsr', ...round }], scopes: [] }))
  const roundTag = () => within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Round:/ })
  afterEach(() => localStorage.removeItem('gb.real.library'))

  it('answers for a custom round on the AXSR, and still opens an incomplete one', () => {
    seed({ name: 'Handload 250', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880, massGr: 250 })
    open(`#/real/workbench?p=p7&cr=${ROUND}&d=1000`)
    expect(roundTag()).toHaveAccessibleName('Round: Handload 250')
    expect(elevation()).toHaveTextContent(/^↑\d+\.\dMRAD$/)
    cleanup()
    seed({ name: 'No mass', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880 })
    open(`#/real/workbench?p=p7&cr=${ROUND}&d=1000`)
    expect(roundTag()).toHaveAccessibleName('Round: No mass')
  })
})

describe('RealPage: what is missing', () => {
  const RIFLE = 'u-rifle-1'
  const ROUND = 'u-round-1'
  const HANDLOAD = { name: 'Handload', massGr: 168, bc: 0.243, dragModel: 'G7', muzzleVelocityMs: 800 }
  const seed = (lib: { rifles?: object[]; rounds: object[] }) =>
    localStorage.setItem('gb.real.library', JSON.stringify({ v: 1, rifles: [], scopes: [], ...lib }))
  /** A custom round on a custom rifle that has only the required fields: every optional one is empty. */
  const bare = () => seed({ rifles: [{ id: RIFLE, name: 'SSG 69' }], rounds: [{ id: ROUND, rifleId: RIFLE, ...HANDLOAD }] })
  const noMass = () => seed({ rounds: [{ id: ROUND, rifleId: 'axsr', name: 'No mass', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880 }] })
  const sheet = () => screen.getByRole('dialog', { name: 'Settings' })
  const header = (title: 'Rifle' | 'Round' | 'Scope') =>
    within(within(sheet()).getByRole('region', { name: title })).getByRole('button', { name: new RegExp(`^${title}( \\d+ yours)?$`) })
  const toCompute = () => screen.queryByText(/^To compute, add:/)
  const addMore = () => screen.queryByText(/^For a more precise answer, add:/)
  const windNote = () => screen.queryByText('Wind not set: calm assumed')

  it('shows only what is missing for an incomplete round, and opens its section on a tap', () => {
    noMass()
    open(`#/real/workbench?cr=${ROUND}&d=1000&ws=0`)
    const line = screen.getByRole('button', { name: 'To compute, add: bullet mass' })
    expect(screen.queryByTestId('real-elevation')).not.toBeInTheDocument()
    expect(screen.queryByTestId('real-windage')).not.toBeInTheDocument()
    expect(screen.queryByTestId('real-hit')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'How it’s calculated' })).not.toBeInTheDocument()
    // The tags, the station and the bar stay.
    expect(within(screen.getByTestId('real-strip')).getByRole('button', { name: 'Round: No mass' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Atmosphere: / })).toBeInTheDocument()
    expect(screen.getByTestId('real-bar')).toBeInTheDocument()
    fireEvent.click(line)
    expect(header('Round')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Rifle')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(line).toHaveFocus()
  })

  it("gives the focus to the section's tag when the line that opened the sheet is gone", () => {
    noMass()
    open(`#/real/workbench?cr=${ROUND}&d=1000&ws=0`)
    fireEvent.click(screen.getByRole('button', { name: 'To compute, add: bullet mass' }))
    const mass = within(within(sheet()).getByRole('region', { name: 'Round' })).getByLabelText('Bullet mass')
    fireEvent.change(mass, { target: { value: '16.2' } })
    fireEvent.blur(mass)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(toCompute()).not.toBeInTheDocument()
    expect(elevation()).toBeInTheDocument()
    expect(within(screen.getByTestId('real-strip')).getByRole('button', { name: 'Round: No mass' })).toHaveFocus()
  })

  it("lists at most four fields to add, in order, and opens the first one's section", () => {
    bare()
    open(`#/real/workbench?cr=${ROUND}&d=600&ws=0`)
    expect(elevation()).toHaveTextContent(/^↑\d+\.\dMRAD$/)
    const line = screen.getByRole('button', { name: 'For a more precise answer, add: SD, powder sensitivity, MV temperature, accuracy' })
    expect(line.closest('.real-warnings')).not.toBeNull()
    expect(line).toHaveClass('est')
    fireEvent.click(line)
    expect(header('Round')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Rifle')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(line).toHaveFocus()
  })

  it('says nothing to add for a built-in preset', () => {
    // Its turret travel is unknown until you enter it, but a built-in value never counts as not set.
    open('#/real/workbench?p=p7&d=1000&ws=0')
    expect(elevation()).toBeInTheDocument()
    expect(addMore()).not.toBeInTheDocument()
    expect(toCompute()).not.toBeInTheDocument()
    expect(windNote()).not.toBeInTheDocument()
  })

  it("says the wind isn't set on a bare page, and stops once the wind is stepped", () => {
    open('')
    expect(windNote()).toBeInTheDocument()
    expect(windNote()!.closest('.real-warnings')).not.toBeNull()
    expect(hash()).toMatch(/[?&]d=/)
    expect(hash()).not.toMatch(/[?&](ws|wc)=/)
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: more' }))
    expect(windNote()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: less' }))
    expect(hash()).toMatch(/[?&]ws=0(&|$)/)
    expect(windNote()).not.toBeInTheDocument()
  })

  it('counts a typed 0 as set', () => {
    open('#/real/workbench?p=p7&d=1000')
    expect(windNote()).toBeInTheDocument()
    const field = screen.getByLabelText('Wind speed')
    // Tabbing through the box sets nothing.
    fireEvent.focus(field)
    fireEvent.blur(field)
    expect(windNote()).toBeInTheDocument()
    // The box shows the calm 0, so typing 0 means clearing it first.
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(hash()).toMatch(/[?&]ws=0(&|$)/)
    expect(windNote()).not.toBeInTheDocument()
  })

  it('shows at most two of the new lines', () => {
    // Incomplete, with optional fields empty too, and no wind: the incomplete line takes the add line's place.
    noMass()
    open(`#/real/workbench?cr=${ROUND}&d=1000`)
    expect(toCompute()).toBeInTheDocument()
    expect(windNote()).toBeInTheDocument()
    expect(addMore()).not.toBeInTheDocument()
    cleanup()
    bare()
    open(`#/real/workbench?cr=${ROUND}&d=600`)
    expect(addMore()).toBeInTheDocument()
    expect(windNote()).toBeInTheDocument()
    expect(toCompute()).not.toBeInTheDocument()
  })

  it('closes the calculation sheet when the selection turns incomplete (the browser goes back to one)', async () => {
    seed({ rounds: [
      { id: ROUND, rifleId: 'axsr', ...HANDLOAD },
      { id: 'u-round-2', rifleId: 'axsr', name: 'No mass', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880 },
    ] })
    open(`#/real/workbench?cr=${ROUND}&d=1000&ws=0`)
    fireEvent.click(screen.getByRole('button', { name: 'How it’s calculated' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => {
      window.location.hash = '#/real/workbench?cr=u-round-2&d=1000&ws=0'
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'To compute, add: bullet mass' })).toBeInTheDocument()
    // Closed, not hidden: forward to the complete round, the sheet stays shut.
    await act(async () => {
      window.location.hash = `#/real/workbench?cr=${ROUND}&d=1000&ws=0`
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(elevation()).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has a name in both languages for every field a line can list', () => {
    const keys = [...(['rifle', 'round', 'scope'] as const).flatMap((kind) => incompleteFields(kind, {}).map((f) => f.key)), ...UNSET_ORDER]
    for (const key of keys) for (const lang of ['en', 'cs'] as const) expect(translate(lang, `lib.f.${key}` as TKey), `${lang} ${key}`).toMatch(/\S/)
  })

  it('speaks Czech', () => {
    bare()
    open(`#/real/workbench?l=cs&cr=${ROUND}&d=600`)
    expect(screen.getByRole('button', { name: 'Pro přesnější výpočet doplň: SD, citlivost prachu, teplota rychlosti, přesnost' })).toBeInTheDocument()
    expect(screen.getByText('Vítr nezadán: počítá se bezvětří')).toBeInTheDocument()
    cleanup()
    noMass()
    open(`#/real/workbench?l=cs&cr=${ROUND}&d=1000&ws=0`)
    expect(screen.getByRole('button', { name: 'Pro výpočet doplň: hmotnost střely' })).toBeInTheDocument()
  })
})

describe('RealPage: the desktop bar', () => {
  const seedStation = (azimuth: number | null) => localStorage.setItem('gb.real.station', JSON.stringify({
    v: 1,
    heightAboveGroundM: { value: 1, source: 'manual' },
    ...(azimuth === null ? {} : { azimuthDeg: { value: azimuth, source: 'manual' } }),
    model: { time: '2026-11-03T12:00', fetchedAt: Date.now(), windMs10: 3.1, windFromDeg: 180 },
  }))
  const bar = () => screen.getByTestId('real-bar')

  afterEach(() => localStorage.clear())

  it('holds two groups: the shot, with the slope hint as its description and no compass button, and the wind', () => {
    open('#/real/workbench?p=p7&d=600&ws=4&wc=9')
    const shot = within(bar()).getByRole('group', { name: 'The shot' })
    expect(within(shot).getByLabelText('Distance')).toBeInTheDocument()
    const slope = within(shot).getByRole('group', { name: 'Slope' })
    expect(slope).toHaveAccessibleDescription('+ uphill, − downhill (say, down from a building)')
    expect(within(shot).getByLabelText('Direction')).toBeInTheDocument()
    expect(within(shot).queryByRole('button', { name: 'Compass' })).not.toBeInTheDocument()
    const wind = within(bar()).getByRole('group', { name: 'Wind' })
    expect(within(wind).getByLabelText('Wind speed')).toBeInTheDocument()
    expect(within(wind).getByRole('button', { name: /^Wind direction: from 9/ })).toBeInTheDocument()
    expect(within(wind).getByRole('group', { name: 'Wind uncertainty' })).toBeInTheDocument()
    expect(within(wind).getByText(/^Read it out to half the distance/)).toBeInTheDocument()
    expect(screen.queryByTestId('real-dock')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Target' })).not.toBeInTheDocument()
  })

  it('puts the forecast offer on the wind group, and Use applies it', () => {
    seedStation(270)
    open('#/real/workbench?p=p7&d=600&ws=4&wc=9')
    const wind = within(bar()).getByRole('group', { name: 'Wind' })
    expect(within(wind).getByText(/^Forecast/)).toBeInTheDocument()
    fireEvent.click(within(wind).getByRole('button', { name: 'Use' }))
    expect(hash()).toMatch(/ws=2/)
  })

  it('wheels the distance by a step', () => {
    open('#/real/workbench?p=p7&d=600&ws=4&wc=9')
    fireEvent.wheel(within(bar()).getByLabelText('Distance'), { deltaY: -100 })
    expect(within(bar()).getByLabelText('Distance')).toHaveValue('610')
  })

  it('turns the clock button with a typed direction', () => {
    seedStation(0)
    open('#/real/workbench?p=p7&d=600&ws=4&wc=3')
    const input = within(bar()).getByLabelText('Direction')
    fireEvent.change(input, { target: { value: '90' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(within(bar()).getByRole('button', { name: /from 12 o’clock/ })).toBeInTheDocument()
  })

  it('sends the forecast hint to the Direction field', () => {
    seedStation(null)
    open('#/real/workbench?p=p7&d=600&ws=4&wc=9')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Set the shooting direction to get the hour.' }))
    expect(within(bar()).getByLabelText('Direction')).toHaveFocus()
  })

  it('writes the compass letters on the clock popover once the direction is known', () => {
    seedStation(270)
    open('#/real/workbench?p=p7&d=600&ws=4&wc=9')
    fireEvent.click(within(bar()).getByRole('button', { name: /^Wind direction/ }))
    const letters = [...screen.getByRole('dialog').querySelectorAll('[data-cardinal]')].map((e) => e.getAttribute('data-cardinal'))
    expect(letters.sort()).toEqual(['E', 'N', 'S', 'W'])
  })
})

describe('RealPage: Aim on a phone', () => {
  const seed = (azimuth: number) => localStorage.setItem('gb.real.station', JSON.stringify({
    v: 1,
    heightAboveGroundM: { value: 1, source: 'manual' },
    azimuthDeg: { value: azimuth, source: 'manual' },
    model: { time: '2026-11-03T12:00', fetchedAt: Date.now(), windMs10: 3.1, windFromDeg: 180 },
  }))
  const aimAt = (heading: number, beta: number) => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    fireEvent.click(screen.getByRole('button', { name: /^Distance \d/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Aim' }))
    for (let i = 0; i < 6; i++) {
      const e = new Event('deviceorientation')
      Object.assign(e, { alpha: 0, gamma: 0, absolute: false, webkitCompassHeading: heading, beta })
      act(() => { window.dispatchEvent(e) })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
  }

  afterEach(() => localStorage.clear())

  it('Use writes the slope and the direction together, and the wind stays unset', () => {
    seed(180)
    onPhone(() => {
      open('#/real/workbench?p=p7&d=600')
      aimAt(274, -4)
      expect(hash()).toMatch(/sl=-4/)
      expect(hash()).not.toMatch(/ws=/)
      expect(JSON.parse(localStorage.getItem('gb.real.station') ?? '{}').azimuthDeg.value).toBe(274)
    })
  })

  it('with the forecast wind on Automatic, the wind becomes the forecast at the new hour', () => {
    seed(180)
    profile({ forecastWind: 'auto' })
    onPhone(() => {
      open('#/real/workbench?p=p7&d=600')
      const before = hash().match(/wc=(\d+)/)?.[1]
      aimAt(274, -4)
      const after = hash().match(/wc=(\d+)/)?.[1]
      expect(hash()).toMatch(/sl=-4/)
      expect(after).toBe('9')
      expect(after).not.toBe(before)
      expect(hash()).toMatch(/ws=/)
    })
  })
})

describe('RealPage: the forecast follow on a link with missing items', () => {
  const seed = () => localStorage.setItem('gb.real.station', JSON.stringify({
    v: 1,
    heightAboveGroundM: { value: 1, source: 'manual' },
    azimuthDeg: { value: 270, source: 'manual' },
    model: { time: '2026-11-03T12:00', fetchedAt: Date.now(), windMs10: 3.1, windFromDeg: 180 },
  }))
  afterEach(() => localStorage.clear())

  it('keeps the link-missing note and the unknown id; with no unknown id the forecast applies', () => {
    seed()
    profile({ forecastWind: 'auto' })
    open('#/real/workbench?p=p7&cr=u-x&d=600')
    expect(screen.getByText("This link uses a custom round you don't have here.")).toBeInTheDocument()
    expect(hash()).toMatch(/cr=u-x/)
    expect(hash()).not.toMatch(/ws=/)
    cleanup()
    open('#/real/workbench?p=p7&d=600')
    expect(hash()).toMatch(/ws=/)
  })
})
