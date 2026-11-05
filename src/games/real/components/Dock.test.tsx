import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHONE } from '../../../components/useMedia'
import type { UnitSystem } from '../../../engine/units'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import type { WindUnit } from '../profile'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { Dock } from './Dock'

const NOW = Date.now()
const latest = { current: DEFAULT_SETUP }

function Page({ start, system, windUnit = 'm/s' }: { start?: Partial<RealSetup>; system: UnitSystem; windUnit?: WindUnit }) {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, distanceM: 600, windMs: 4, windClock: 9, windSet: true, ...start })
  useEffect(() => { latest.current = setup })
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <button type="button">elsewhere</button>
      {[250, 450, 650, 950, 1250, 1600].map((d) => <button key={d} type="button" onClick={() => setSetup((s) => ({ ...s, distanceM: d }))}>to {d}</button>)}
      <Dock setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch, windSet: s.windSet || 'windMs' in patch || 'windClock' in patch }))} system={system} windUnit={windUnit} now={NOW} weights={[48, 37, 15]} />
    </SettingsProvider>
  )
}

const mount = (start?: Partial<RealSetup>, system: UnitSystem = 'metric', windUnit: WindUnit = 'm/s') => render(<Page start={start} system={system} windUnit={windUnit} />)
const shotButton = () => screen.getByRole('button', { name: /^Distance \d/ })
const label = (el: HTMLElement) => el.getAttribute('aria-label')!.replace(/\u00a0/g, ' ')
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
    expect(within(region).getByLabelText('Distance')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Distance: more' })).toBeNull()
    expect(region.querySelector('.ruler')).not.toBeNull()
    expect(within(region).getByLabelText('Slope')).toBeInTheDocument()
    expect(within(region).getByText(/^\+ uphill/)).toBeInTheDocument()
    expect(within(region).getByLabelText('Direction')).toBeInTheDocument()
    expect(region).toHaveFocus()
  })

  it('stays open while a value changes, and the button follows', () => {
    mount()
    fireEvent.click(shotButton())
    fireEvent.keyDown(screen.getByLabelText('Distance'), { key: 'ArrowRight' })
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
  const steady = (n = 22, heading = 274, beta = -4) => {
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

  it('offers the camera by a lens icon before the shot panel\'s ✕, only where the phone reads its orientation', () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    const { unmount } = mount()
    fireEvent.click(shotButton())
    expect(screen.queryByRole('button', { name: 'Measure with the camera' })).toBeNull()
    unmount()
    stubOrientation()
    mount()
    fireEvent.click(shotButton())
    const panel = screen.getByRole('region', { name: 'The shot' })
    const lens = within(panel).getByRole('button', { name: 'Measure with the camera' })
    expect(lens).toHaveClass('icon-btn')
    expect(lens.compareDocumentPosition(within(panel).getByRole('button', { name: 'Close' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(windButton())
    expect(screen.queryByRole('button', { name: 'Measure with the camera' })).toBeNull()
  })

  it('puts Aim after Direction with its note, and no Compass', () => {
    stubOrientation()
    mount()
    fireEvent.click(shotButton())
    const region = screen.getByRole('region', { name: 'The shot' })
    expect(within(region).getByText('Hold the phone flat, screen up, and point its top edge at the target, a step away from the rifle.')).toBeInTheDocument()
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

  it('a phone tilted past the slope range keeps the slope, does not lock and says to hold it flat', () => {
    stubOrientation()
    mount({ slopeDeg: 12 })
    fireEvent.click(shotButton())
    fireEvent.click(aimButton())
    // Held up to read the screen: the top edge points 70 degrees up.
    steady(30, 274, 70)
    const panel = screen.getByRole('region', { name: 'The shot' })
    expect(within(panel).getByText('Hold the phone flat, screen up')).toBeInTheDocument()
    expect(within(panel).queryByText('Hold still')).toBeNull()
    // The stored slope, not a reading: disabled, but not in the live accent.
    expect(screen.getByLabelText('Slope')).toHaveValue('12')
    expect(screen.getByLabelText('Slope')).toBeDisabled()
    expect(screen.getByLabelText('Slope').closest('.real-tool')).not.toHaveClass('real-live')
    expect(screen.getByRole('button', { name: 'Use' })).toHaveAttribute('aria-disabled', 'true')
    // Flat again, it reads and locks as usual.
    steady()
    expect(screen.getByLabelText('Slope')).toHaveValue('-4')
    expect(within(panel).getByText('Measured')).toBeInTheDocument()
  })

  it('Use before the lock writes nothing and stays live; after the lock it writes the lock', () => {
    startAiming()
    for (let i = 0; i < 22; i++) {
      fire({ webkitCompassHeading: 100 + i * 8, beta: -4 })
      act(() => { vi.advanceTimersByTime(50) })
    }
    const use = screen.getByRole('button', { name: 'Use' })
    expect(use).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Hold still')).toBeInTheDocument()
    fireEvent.click(use)
    expect(screen.getByRole('button', { name: 'Use' })).toBeInTheDocument()
    expect(latest.current.slopeDeg).toBe(0)
    expect(azimuth().value).toBe(180)
    expect(windButton()).toHaveTextContent('· 10 h')
    steady()
    expect(screen.getByRole('button', { name: 'Use' })).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByText('Measured')).toBeInTheDocument()
    expect(latest.current.slopeDeg).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth().value).toBe(274)
  })

  it('while locked the figures show the lock, not the latest sample', () => {
    startAiming()
    steady()
    fire({ webkitCompassHeading: 300, beta: -4 })
    expect(screen.getByLabelText('Direction')).toHaveValue('274')
    expect(screen.getByLabelText('Slope')).toHaveValue('-4')
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

describe('The wind zones', () => {
  // The zones start at 1000 m: every mount here is at 1500 m unless a test says otherwise.
  const mountZoned = (start?: Partial<RealSetup>, system: UnitSystem = 'metric', windUnit: WindUnit = 'm/s') =>
    mount({ distanceM: 1500, ...start }, system, windUnit)
  const openWind = () => {
    fireEvent.click(windButton())
    return screen.getByRole('region', { name: /^Wind/ })
  }
  const zonesIcon = (panel: HTMLElement) => within(panel).queryByRole('button', { name: 'Wind zones' })
  const cells = (panel: HTMLElement) => within(panel).getAllByRole('button', { name: /^(Near|Middle|Far)/ })
  const own = { zonesOn: true, windMid: { ms: 3, clock: 9 } }

  it('offers the ? always and the zones icon only from 1000 m', () => {
    mountZoned({ distanceM: 950 })
    let panel = openWind()
    expect(within(panel).getByRole('button', { name: 'How to read the wind' })).toBeInTheDocument()
    expect(zonesIcon(panel)).toBeNull()
    cleanup()
    mountZoned({ distanceM: 1000 })
    panel = openWind()
    expect(within(panel).getByRole('button', { name: 'How to read the wind' })).toBeInTheDocument()
    expect(zonesIcon(panel)).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns the zones on and off with the icon', () => {
    mountZoned()
    const panel = openWind()
    fireEvent.click(zonesIcon(panel)!)
    expect(latest.current.zonesOn).toBe(true)
    expect(zonesIcon(panel)).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByText('Wind · zones')).toBeInTheDocument()
    fireEvent.click(zonesIcon(panel)!)
    expect(latest.current.zonesOn).toBe(false)
    expect(within(panel).queryByRole('group', { name: 'Wind · zones' })).toBeNull()
  })

  it('shows the hint with one wind and the strip instead of it with zones', () => {
    mountZoned()
    const panel = openWind()
    expect(within(panel).getByText(/^Read it out to half the distance/)).toBeInTheDocument()
    fireEvent.click(zonesIcon(panel)!)
    expect(within(panel).queryByText(/^Read it out to half the distance/)).toBeNull()
  })

  it('draws a cell for each zone, with its weight, wind and range', () => {
    mountZoned(own)
    const panel = openWind()
    const [near, mid, far] = cells(panel)
    expect(near).toHaveTextContent('Near48 %4 · 9 h0–500 m')
    expect(mid).toHaveTextContent('Middle37 %3 · 9 h500–1000 m')
    expect(far).toHaveTextContent('Far15 %same as near1000–1500 m')
    expect(near).toHaveAttribute('aria-pressed', 'true')
    expect(mid).toHaveAttribute('aria-pressed', 'false')
  })

  it('edits the selected zone and leaves the near wind alone', () => {
    mountZoned(own)
    const panel = openWind()
    fireEvent.click(cells(panel)[1])
    expect(cells(panel)[1]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(panel).getByRole('button', { name: 'Wind speed: more' }))
    expect(latest.current.windMid).toEqual({ ms: 3.5, clock: 9 })
    expect(latest.current.windMs).toBe(4)
  })

  it('gives a zone with no wind of its own the near hour, then its own on a clock edit', () => {
    mountZoned({ zonesOn: true })
    const panel = openWind()
    fireEvent.click(cells(panel)[2])
    fireEvent.keyDown(within(panel).getByRole('slider'), { key: 'ArrowRight' })
    expect(latest.current.windFar).toEqual({ ms: 4, clock: 10 })
    expect(latest.current.windClock).toBe(9)
  })

  it('returns an own zone to the near wind with Same as near', () => {
    mountZoned({ zonesOn: true, windFar: { ms: 2, clock: 3 } })
    const panel = openWind()
    expect(within(panel).queryByRole('button', { name: 'Same as near' })).toBeNull()
    fireEvent.click(cells(panel)[2])
    fireEvent.click(within(panel).getByRole('button', { name: 'Same as near' }))
    expect(latest.current.windFar).toBeNull()
    expect(cells(panel)[2]).toHaveTextContent('same as near')
    expect(within(panel).queryByRole('button', { name: 'Same as near' })).toBeNull()
  })

  it('shows no reset on the near zone or on a zone that follows it', () => {
    mountZoned(own)
    const panel = openWind()
    expect(within(panel).queryByRole('button', { name: 'Same as near' })).toBeNull()
    fireEvent.click(cells(panel)[2])
    expect(within(panel).queryByRole('button', { name: 'Same as near' })).toBeNull()
  })

  it('crosses the thresholds with the panel open', () => {
    seedStation(180, true)
    mountZoned({ zonesOn: true, windFar: { ms: 2, clock: 3 } })
    const panel = openWind()
    expect(within(panel).getByText(/all zones/)).toBeInTheDocument()
    fireEvent.click(cells(panel)[1])
    fireEvent.click(screen.getByRole('button', { name: 'to 1250' }))
    expect(within(panel).getByText(/all zones/)).toBeInTheDocument()
    expect(cells(panel)).toHaveLength(2)
    expect(cells(panel)[0]).toHaveAttribute('aria-pressed', 'true')
    expect(cells(panel)[1]).toHaveTextContent('Far')
    expect(cells(panel)[1]).toHaveTextContent('630–1250 m')
    expect(windButton()).toHaveTextContent('2 zones')

    fireEvent.click(screen.getByRole('button', { name: 'to 950' }))
    expect(within(panel).queryByRole('group', { name: 'Wind · zones' })).toBeNull()
    expect(within(panel).getByText('Wind')).toBeInTheDocument()
    expect(within(panel).getByText(/^Read it out to half the distance/)).toBeInTheDocument()
    expect(within(panel).queryByText(/all zones/)).toBeNull()
    expect(windButton()).toHaveTextContent('4 m/s · 9 h')
    expect(zonesIcon(panel)).toBeNull()
    expect(latest.current.zonesOn).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'to 1600' }))
    expect(cells(panel)).toHaveLength(3)
    expect(cells(panel)[0]).toHaveAttribute('aria-pressed', 'true')
    expect(cells(panel)[2]).toHaveTextContent('2 · 3 h')
  })

  it('reads 3 zones on the closed dock button', () => {
    mountZoned(own)
    expect(windButton()).toHaveTextContent('3 zones')
  })

  it('keeps the hour in every cell: the speed is shown without its unit, in full in the cell\'s name', () => {
    mountZoned({ zonesOn: true, windMs: 4.5, windClock: 10, windMid: { ms: 16.2 / 3.6, clock: 12 } }, 'metric', 'km/h')
    const panel = openWind()
    const [near, mid] = cells(panel)
    expect(near).toHaveTextContent('16.2 · 10 h')
    expect(mid).toHaveTextContent('16.2 · 12 h')
    expect(label(near)).toBe('Near, 48 %, 16.2 km/h · 10 h, 0–500 m')
    expect(label(cells(panel)[2])).toBe('Far, 15 %, same as near, 1000–1500 m')
  })

  it('shows the ranges in yards and the speeds converted to the wind unit with imperial units', () => {
    mountZoned({ ...own, windMs: 4.5, windClock: 10 }, 'imperial', 'mph')
    const panel = openWind()
    const [near, mid, far] = cells(panel)
    expect(near).toHaveTextContent('0–550 yd')
    expect(mid).toHaveTextContent('550–1090 yd')
    expect(far).toHaveTextContent('1090–1640 yd')
    expect(near).toHaveTextContent('10.1 · 10 h')
    expect(mid).toHaveTextContent('6.7 · 9 h')
    expect(label(near)).toBe('Near, 48 %, 10.1 mph · 10 h, 0–550 yd')
  })

  it('goes back to Near when the zones are turned off and on again', () => {
    mountZoned(own)
    const panel = openWind()
    fireEvent.click(cells(panel)[1])
    fireEvent.click(zonesIcon(panel)!)
    fireEvent.click(zonesIcon(panel)!)
    expect(cells(panel)[0]).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('what glows until it is set', () => {
  const labelOf = (name: string) => screen.getByLabelText(name).closest('.number-field')!.querySelector('label')!

  it('lights the whole Wind button while the wind is unset, and not once it is', () => {
    seedStation(90)
    mount({ windSet: false, windMs: 0 })
    expect(windButton()).toHaveClass('glow-want')
    fireEvent.click(windButton())
    fireEvent.click(screen.getByRole('button', { name: "Wind speed: more" }))
    expect(windButton()).not.toHaveClass('glow-want')
    expect(screen.getByRole('button', { name: /^Wind \d/ })).toBe(windButton())
  })

  it('does not light the Wind button when the wind is set', () => {
    mount()
    expect(windButton()).not.toHaveClass('glow-want')
  })

  it('lights only the Distance chevron until there is a direction', () => {
    mount()
    expect(shotButton()).not.toHaveClass('glow-want')
    expect(shotButton().querySelector('.real-dock-chevron')).toHaveClass('glow-want')
    cleanup()
    seedStation(90)
    mount()
    expect(shotButton().querySelector('.real-dock-chevron')).not.toHaveClass('glow-want')
  })

  it('lights Aim where the phone has a compass, else the Direction label', () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    const { unmount } = mount()
    fireEvent.click(shotButton())
    expect(screen.getByRole('button', { name: 'Aim' })).toHaveClass('glow-want')
    expect(labelOf('Direction')).not.toHaveClass('glow-want')
    unmount()
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    mount()
    fireEvent.click(shotButton())
    expect(labelOf('Direction')).toHaveClass('glow-want')
  })

  it('lights Use when the forecast can be used, else the Wind speed label', () => {
    seedStation(90, true)
    const { unmount } = mount({ windSet: false, windMs: 0 })
    fireEvent.click(windButton())
    expect(screen.getByRole('button', { name: 'Use' })).toHaveClass('glow-want')
    expect(screen.getByLabelText('Wind speed')).not.toHaveClass('glow-want')
    unmount()
    localStorage.clear()
    seedStation(null)
    mount({ windSet: false, windMs: 0 })
    fireEvent.click(windButton())
    expect(screen.getByLabelText('Wind speed')).toHaveClass('glow-want')
  })

  it('shows the wind whole from 10 in km/h', () => {
    mount({ windMs: 15 / 3.6 }, 'metric', 'km/h')
    expect(windButton()).toHaveTextContent('15 km/h · 9 h')
    cleanup()
    mount({ windMs: 2.6 }, 'metric', 'km/h')
    expect(windButton()).toHaveTextContent('9.4 km/h')
  })
})
