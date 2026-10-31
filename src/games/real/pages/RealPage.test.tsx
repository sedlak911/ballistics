import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'

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
    expect(screen.queryByText(/from the side moves the hit/)).not.toBeInTheDocument()
    cleanup()
    open('#/real/workbench?p=p7&d=1000&ws=0')
    expect(columns()).not.toBeInTheDocument()
    expect(screen.getByText(/^1\sm\/s from the side moves the hit \d+\scm \(0\.\d\d\sMRAD\)$/)).toBeInTheDocument()
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
    expect(screen.getByRole('group', { name: 'Target' })).toBeInTheDocument()
    cleanup()
    onPhone(() => {
      open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
      expect(screen.queryByTestId('real-hit')).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Target' })).not.toBeInTheDocument()
      expect(within(screen.getByTestId('real-dock')).getByLabelText('Distance')).toBeInTheDocument()
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
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { custom: { muzzleVelocityMs: 300, bc: 0.15, dragModel: 'G1' } } }))
    open('#/real/workbench?p=custom&d=2500')
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
    const slope = screen.getByLabelText('Slope')
    fireEvent.change(slope, { target: { value: '5' } })
    fireEvent.keyDown(slope, { key: 'Enter' })
    expect(hash()).toContain('sl=5')
  })

  it('steps the wind in the chosen unit and stores it in m/s', () => {
    open('#/real/workbench?p=p7&d=1000&ws=0')
    const wind = screen.getByRole('group', { name: 'Wind speed' })
    fireEvent.click(within(wind).getByRole('button', { name: 'Wind speed: more' }))
    expect(within(wind).getByRole('status')).toHaveTextContent('0.5 m/s')
    expect(hash()).toContain('ws=0.5')
    cleanup()
    profile({ windUnit: 'km/h' })
    open('#/real/workbench?p=p7&d=1000&ws=0')
    expect(screen.getByText(/^5\skm\/h from the side moves the hit \d+(\.\d)?\scm/)).toBeInTheDocument()
    const kmh = screen.getByRole('group', { name: 'Wind speed' })
    fireEvent.click(within(kmh).getByRole('button', { name: 'Wind speed: more' }))
    expect(within(kmh).getByRole('status')).toHaveTextContent('2 km/h')
    expect(hash()).toContain('ws=0.556')
    fireEvent.click(within(kmh).getByRole('button', { name: 'Wind speed: more' }))
    expect(within(kmh).getByRole('status')).toHaveTextContent('4 km/h')
    expect(hash()).toContain('ws=1.111')
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

  it('steps the target diameter by 5 cm on a large screen', () => {
    open('#/real/workbench?p=p7&d=1000')
    fireEvent.click(within(screen.getByRole('group', { name: 'Target' })).getByRole('button', { name: 'Target: more' }))
    expect(hash()).toContain('tg=55')
    expect(screen.getByTestId('real-hit')).toHaveTextContent(/^55 cm target/)
  })
})
