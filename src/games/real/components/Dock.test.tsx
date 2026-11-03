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
