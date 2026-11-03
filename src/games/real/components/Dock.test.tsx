import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHONE } from '../../../components/useMedia'
import type { UnitSystem } from '../../../engine/units'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { Dock } from './Dock'

const NOW = Date.now()
const latest = { current: DEFAULT_SETUP }

function Page({ start, system }: { start?: Partial<RealSetup>; system: UnitSystem }) {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, distanceM: 600, windMs: 4, windClock: 9, windSet: true, ...start })
  useEffect(() => { latest.current = setup })
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <button type="button">elsewhere</button>
      <Dock setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch }))} system={system} windUnit="m/s" now={NOW} />
    </SettingsProvider>
  )
}

const mount = (start?: Partial<RealSetup>, system: UnitSystem = 'metric') => render(<Page start={start} system={system} />)
const shotButton = () => screen.getByRole('button', { name: /^Distance \d/ })
const windButton = () => screen.getByRole('button', { name: /^Wind \d/ })
const seedStation = (azimuth: number | null, withModel = false) => localStorage.setItem('gb.real.station', JSON.stringify({
  v: 1,
  heightAboveGroundM: { value: 1, source: 'manual' },
  ...(azimuth === null ? {} : { azimuthDeg: { value: azimuth, source: 'manual' } }),
  ...(withModel ? { model: { time: '2026-11-03T12:00', fetchedAt: NOW, windMs10: 3.1, windFromDeg: 180 } } : {}),
}))

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/real/workbench'
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the closed dock', () => {
  it('holds two collapsed buttons with the distance and the wind, and no field', () => {
    mount()
    expect(shotButton()).toHaveAttribute('aria-expanded', 'false')
    expect(shotButton()).toHaveTextContent('600 m')
    expect(windButton()).toHaveAttribute('aria-expanded', 'false')
    expect(windButton()).toHaveTextContent('4 m/s · 9 h')
    expect(screen.queryByLabelText('Slope')).toBeNull()
    expect(screen.queryByLabelText('Direction')).toBeNull()
    expect(screen.queryByLabelText('Wind speed')).toBeNull()
    expect(screen.queryByTestId('real-panel')).toBeNull()
  })

  it('shows only the speed while the wind is unset', () => {
    mount({ windSet: false, windMs: 0 })
    expect(windButton()).toHaveTextContent(/Wind 0 m\/s/)
    expect(windButton()).not.toHaveTextContent('·')
  })
})

describe('The shot panel', () => {
  it('opens as a region the button controls, holds the shot fields and takes the focus', () => {
    mount()
    fireEvent.click(shotButton())
    expect(shotButton()).toHaveAttribute('aria-expanded', 'true')
    const region = screen.getByRole('region', { name: 'The shot' })
    expect(shotButton().getAttribute('aria-controls')).toBe(region.id)
    expect(within(region).getByRole('button', { name: 'Distance: more' })).toBeInTheDocument()
    expect(within(region).getByLabelText('Slope')).toBeInTheDocument()
    expect(within(region).getByText(/^\+ uphill/)).toBeInTheDocument()
    expect(within(region).getByLabelText('Direction')).toBeInTheDocument()
    expect(region).toHaveFocus()
  })

  it('stays open while a value changes, and the button follows', () => {
    mount()
    fireEvent.click(shotButton())
    fireEvent.click(screen.getByRole('button', { name: 'Distance: more' }))
    expect(screen.getByRole('region', { name: 'The shot' })).toBeInTheDocument()
    expect(shotButton()).toHaveTextContent('610 m')
  })

  it('reads the distance in yards for imperial', () => {
    mount({ distanceM: 548.64 }, 'imperial')
    expect(shotButton()).toHaveTextContent('600 yd')
    fireEvent.click(shotButton())
    expect(within(screen.getByRole('region')).getByLabelText('Distance')).toHaveValue('600')
    expect(within(screen.getByRole('region')).getByText('yd')).toBeInTheDocument()
  })
})

describe('The wind panel', () => {
  it('replaces the shot panel and holds the clock, the speed, the uncertainty and the hint', () => {
    seedStation(null, true)
    mount()
    fireEvent.click(shotButton())
    fireEvent.click(windButton())
    expect(screen.queryByRole('region', { name: 'The shot' })).toBeNull()
    const region = screen.getByRole('region', { name: 'Wind' })
    expect(windButton().getAttribute('aria-controls')).toBe(region.id)
    expect(within(region).getByRole('slider')).toBeInTheDocument()
    expect(within(region).getByLabelText('Wind speed')).toBeInTheDocument()
    expect(within(region).getByRole('group', { name: 'Wind uncertainty' })).toBeInTheDocument()
    expect(within(region).getByText(/^Forecast/)).toBeInTheDocument()
    expect(within(region).getByText(/^Read it out to half the distance/)).toBeInTheDocument()
    expect(region).toHaveFocus()
    expect(region.querySelector('[data-cardinal]')).toBeNull()
  })

  it('writes the compass letters once the direction is known', () => {
    seedStation(270)
    mount()
    fireEvent.click(windButton())
    const letters = [...screen.getByRole('region').querySelectorAll('[data-cardinal]')].map((e) => e.getAttribute('data-cardinal'))
    expect(letters).toEqual(['W', 'N', 'E', 'S'].sort((a, b) => 'NESW'.indexOf(a) - 'NESW'.indexOf(b)))
  })

  it('sends the forecast hint to the shot panel and its direction field', () => {
    seedStation(null, true)
    mount()
    fireEvent.click(windButton())
    fireEvent.click(screen.getByRole('button', { name: 'Set the shooting direction to get the hour.' }))
    expect(screen.getByRole('region', { name: 'The shot' })).toBeInTheDocument()
    expect(screen.getByLabelText('Direction')).toHaveFocus()
  })
})

describe('the wind follows the direction', () => {
  const type = (input: HTMLElement, text: string) => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.keyDown(input, { key: 'Enter' })
  }
  const seedModel = () => localStorage.setItem('gb.real.station', JSON.stringify({
    v: 1,
    heightAboveGroundM: { value: 1, source: 'manual' },
    azimuthDeg: { value: 180, source: 'manual' },
    model: { time: '2026-11-03T12:00', fetchedAt: NOW, windMs10: 3.1, windFromDeg: 125 },
  }))

  it('a new direction turns the hour, lights it up for a moment and says so', () => {
    vi.useFakeTimers()
    try {
      seedStation(180)
      mount({ windSet: true, windClock: 10 })
      fireEvent.click(shotButton())
      type(screen.getByLabelText('Direction'), '274')
      expect(windButton()).toHaveTextContent('· 7 h')
      const hour = windButton().querySelector('em')
      expect(hour).toHaveClass('real-hour-flash')
      expect(screen.getByRole('status')).toHaveTextContent('Wind now from 7 o’clock')
      act(() => { vi.advanceTimersByTime(1300) })
      expect(windButton().querySelector('em')).not.toHaveClass('real-hour-flash')
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not flash when the hour stays', () => {
    mount({ windSet: false, windMs: 0 })
    fireEvent.click(shotButton())
    type(screen.getByLabelText('Direction'), '90')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(windButton().querySelector('em')).toBeNull()
  })

  it('Use remembers where the forecast wind blows from, and a later direction turns it', () => {
    seedModel()
    mount({ windSet: false, windMs: 0 })
    fireEvent.click(windButton())
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(JSON.parse(localStorage.getItem('gb.real.wind') ?? 'null')).toMatchObject({ source: 'forecast', fromDeg: 125 })
    fireEvent.click(shotButton())
    type(screen.getByLabelText('Direction'), '274')
    expect(windButton()).toHaveTextContent('7 h')
  })
})

describe('closing', () => {
  it('the close button returns the focus to its dock button', () => {
    mount()
    fireEvent.click(windButton())
    fireEvent.click(within(screen.getByRole('region')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(windButton()).toHaveFocus()
    expect(windButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape closes it and returns the focus', () => {
    mount()
    fireEvent.click(shotButton())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(shotButton()).toHaveFocus()
  })

  it('the open button closes it', () => {
    mount()
    fireEvent.click(shotButton())
    fireEvent.click(shotButton())
    expect(screen.queryByTestId('real-panel')).toBeNull()
  })

  it('a press outside closes it without moving the focus', () => {
    mount()
    fireEvent.click(shotButton())
    const panel = screen.getByTestId('real-panel')
    fireEvent.pointerDown(within(panel).getByLabelText('Slope'))
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
    screen.getByText('elsewhere').focus()
    act(() => { fireEvent.pointerDown(document.body) })
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(screen.getByText('elsewhere')).toHaveFocus()
  })

  it('keeps a typed distance when the press outside closes the panel', () => {
    mount()
    fireEvent.click(shotButton())
    const field = within(screen.getByTestId('real-panel')).getByLabelText('Distance')
    field.focus()
    fireEvent.change(field, { target: { value: '650' } })
    act(() => { fireEvent.pointerDown(document.body) })
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(shotButton()).toHaveTextContent('650 m')
    expect(latest.current.distanceM).toBe(650)
  })

  it('keeps a typed wind speed when the press outside closes the panel', () => {
    mount()
    fireEvent.click(windButton())
    const field = within(screen.getByTestId('real-panel')).getByLabelText('Wind speed')
    field.focus()
    fireEvent.change(field, { target: { value: '7' } })
    act(() => { fireEvent.pointerDown(document.body) })
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(latest.current.windMs).toBe(7)
  })
})

describe('Aim in the shot panel', () => {
  const stubOrientation = () => vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
  const fire = (a: { webkitCompassHeading?: number | null; beta?: number | null }) => {
    const e = new Event('deviceorientation')
    Object.assign(e, { alpha: 0, gamma: 0, absolute: false, ...a })
    act(() => { window.dispatchEvent(e) })
  }
  /** One event per 50 ms, so twenty of them are one second. */
  const steady = (n = 20, heading = 274, beta = -4) => {
    for (let i = 0; i < n; i++) {
      fire({ webkitCompassHeading: heading, beta })
      act(() => { vi.advanceTimersByTime(50) })
    }
  }
  const aimButton = () => screen.getByRole('button', { name: 'Aim' })
  const startAiming = () => {
    stubOrientation()
    seedStation(180)
    mount({ windSet: true, windClock: 10 })
    fireEvent.click(shotButton())
    fireEvent.click(aimButton())
  }
  const heard = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c) => c[0] === 'deviceorientation').length
  const azimuth = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}').azimuthDeg

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('has no Compass button, and no Aim without the orientation events', () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    mount()
    fireEvent.click(shotButton())
    expect(screen.queryByRole('button', { name: 'Compass' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aim' })).toBeNull()
  })

  it('puts Aim after Direction with its note, and no Compass', () => {
    stubOrientation()
    mount()
    fireEvent.click(shotButton())
    const region = screen.getByRole('region', { name: 'The shot' })
    expect(within(region).getByText("Point the phone's top edge at the target, a step away from the rifle.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compass' })).toBeNull()
    const direction = within(region).getByLabelText('Direction')
    expect(direction.compareDocumentPosition(aimButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the live reading in locked fields, and Use writes it and turns the wind', () => {
    startAiming()
    steady()
    const slope = screen.getByLabelText('Slope')
    const direction = screen.getByLabelText('Direction')
    expect(slope).toHaveValue('-4')
    expect(slope).toBeDisabled()
    expect(direction).toHaveValue('274')
    expect(direction).toBeDisabled()
    expect(latest.current.slopeDeg).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth()).toEqual({ value: 274, source: 'manual' })
    expect(windButton()).toHaveTextContent('· 7 h')
    // The panel stays open, the Aim button is back, and the fields hold the new values.
    expect(aimButton()).toBeInTheDocument()
    expect(screen.getByLabelText('Slope')).toHaveValue('-4')
    expect(screen.getByLabelText('Slope')).toBeEnabled()
    expect(screen.getByLabelText('Direction')).toHaveValue('274')
  })

  it('Use with a moving phone says so, stays live and writes nothing', () => {
    startAiming()
    for (let i = 0; i < 20; i++) {
      fire({ webkitCompassHeading: 100 + i * 8, beta: -4 })
      act(() => { vi.advanceTimersByTime(50) })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The phone was moving. Hold it still and try again.')
    expect(screen.getByRole('button', { name: 'Use' })).toBeInTheDocument()
    expect(latest.current.slopeDeg).toBe(0)
    expect(azimuth().value).toBe(180)
    expect(windButton()).toHaveTextContent('· 10 h')
  })

  it('Cancel writes nothing, and later events change nothing', () => {
    startAiming()
    steady()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(aimButton()).toBeInTheDocument()
    steady()
    expect(screen.getByLabelText('Slope')).toHaveValue('0')
    expect(screen.getByLabelText('Direction')).toHaveValue('180')
    expect(latest.current.slopeDeg).toBe(0)
  })

  it('the first Escape ends the aiming and keeps the panel, the second closes it', () => {
    startAiming()
    steady()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
    expect(aimButton()).toBeInTheDocument()
    expect(screen.getByLabelText('Slope')).toHaveValue('0')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('real-panel')).toBeNull()
  })

  it('closing the panel with the close button stops listening', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    startAiming()
    steady(2)
    remove.mockClear()
    fireEvent.click(within(screen.getByTestId('real-panel')).getByRole('button', { name: 'Close' }))
    expect(heard(remove)).toBeGreaterThan(0)
  })

  it('a press outside, and the Wind panel, stop listening and write nothing', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    startAiming()
    steady(2)
    remove.mockClear()
    act(() => { fireEvent.pointerDown(document.body) })
    expect(heard(remove)).toBeGreaterThan(0)
    fireEvent.click(shotButton())
    fireEvent.click(aimButton())
    steady(2)
    remove.mockClear()
    fireEvent.click(windButton())
    expect(heard(remove)).toBeGreaterThan(0)
    expect(latest.current.slopeDeg).toBe(0)
  })

  it('the page becoming hidden stops it', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    startAiming()
    steady(2)
    remove.mockClear()
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    hidden.mockRestore()
    expect(heard(remove)).toBeGreaterThan(0)
    expect(aimButton()).toBeInTheDocument()
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
  })

  it('only empty events for 5 s say that the phone gave nothing, and Aim is back', () => {
    startAiming()
    for (let i = 0; i < 5; i++) {
      fire({ webkitCompassHeading: null, beta: null })
      act(() => { vi.advanceTimersByTime(1000) })
    }
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByRole('alert')).toHaveTextContent("No reading from the phone's sensors.")
    expect(aimButton()).toBeInTheDocument()
  })

  it('with the wind unset, Use writes the direction and the wind stays unset', () => {
    stubOrientation()
    mount({ windSet: false, windMs: 0 })
    fireEvent.click(shotButton())
    fireEvent.click(aimButton())
    steady()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(azimuth().value).toBe(274)
    expect(latest.current.windSet).toBe(false)
    expect(latest.current.slopeDeg).toBe(-4)
  })
})
