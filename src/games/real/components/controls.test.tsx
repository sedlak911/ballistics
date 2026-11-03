import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import type { UnitSystem } from '../../../engine/units'
import { useRealProfile, type WindUnit } from '../profile'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { DirectionField, DistanceTool, ForecastLine, ReadingHint, SlopeTool, WindSigmaTool, WindSpeedTool } from './controls'

const type = (el: HTMLElement, text: string) => {
  fireEvent.change(el, { target: { value: text } })
  fireEvent.blur(el)
}
const stored = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}')
const orientation = (alpha: number) => {
  const e = new Event('deviceorientationabsolute') as Event & { alpha: number }
  e.alpha = alpha
  window.dispatchEvent(e)
}

const latest = { current: DEFAULT_SETUP }
const NOW = Date.now()
const needDirection = vi.fn()

function Page({ children }: { children: React.ReactNode }) {
  const [route, navigate] = useRoute()
  return <SettingsProvider route={route} navigate={navigate}>{children}</SettingsProvider>
}

function Tools({ start, system = 'metric', wheel, hint = 'line', windUnit = 'm/s' }: {
  start?: Partial<RealSetup>; system?: UnitSystem; wheel?: boolean; hint?: 'line' | 'title'; windUnit?: WindUnit
}) {
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, ...start })
  useEffect(() => { latest.current = setup })
  const update = (patch: Partial<RealSetup>) => setSetup((s) => ({ ...s, ...patch }))
  return (
    <>
      <DistanceTool setup={setup} update={update} system={system} wheel={wheel} />
      <SlopeTool setup={setup} update={update} hint={hint} />
      <WindSpeedTool setup={setup} update={update} windUnit={windUnit} />
      <ForecastLine update={update} now={NOW} onNeedDirection={needDirection} />
    </>
  )
}

const mount = (ui: React.ReactElement) => render(<Page>{ui}</Page>)

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/real/workbench'
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DistanceTool', () => {
  it('steps by ten with more and less', () => {
    mount(<Tools start={{ distanceM: 300 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Distance: more' }))
    expect(latest.current.distanceM).toBe(310)
    fireEvent.click(screen.getByRole('button', { name: 'Distance: less' }))
    fireEvent.click(screen.getByRole('button', { name: 'Distance: less' }))
    expect(latest.current.distanceM).toBe(290)
  })

  it('with wheel, one 100 px notch up adds 10', () => {
    mount(<Tools start={{ distanceM: 300 }} wheel />)
    fireEvent.wheel(screen.getByLabelText('Distance'), { deltaY: -100 })
    expect(latest.current.distanceM).toBe(310)
  })

  it('without wheel, the wheel changes nothing', () => {
    mount(<Tools start={{ distanceM: 300 }} />)
    fireEvent.wheel(screen.getByLabelText('Distance'), { deltaY: -100 })
    expect(latest.current.distanceM).toBe(300)
  })
})

describe('SlopeTool', () => {
  it('steps one degree within -45..45', () => {
    mount(<Tools start={{ slopeDeg: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Slope: more' }))
    expect(latest.current.slopeDeg).toBe(1)
    cleanup()
    mount(<Tools start={{ slopeDeg: -45 }} />)
    expect(screen.getByRole('button', { name: 'Slope: less' })).toBeDisabled()
  })

  it('takes a typed slope', () => {
    mount(<Tools />)
    type(screen.getByLabelText('Slope'), '-5')
    expect(latest.current.slopeDeg).toBe(-5)
  })

  it('hint line shows the text', () => {
    mount(<Tools hint="line" />)
    expect(screen.getByText('+ uphill, − downhill (say, down from a building)')).toBeVisible()
  })

  it('hint title puts it in the title and the description, not in the text', () => {
    const { container } = mount(<Tools hint="title" />)
    const text = '+ uphill, − downhill (say, down from a building)'
    const segment = container.querySelector('.real-slope') as HTMLElement
    expect(segment).toHaveAttribute('title', text)
    expect(segment).toHaveAccessibleDescription(text)
    expect(segment.querySelector('.real-hint')).toBeNull()
    expect(container.querySelector('.real-hint-vh')).toHaveTextContent(text)
    expect(container.querySelector('p')).toBeNull()
  })
})

describe('WindSigmaTool', () => {
  function Sigma() {
    const [p, setP] = useRealProfile()
    return (
      <>
        <button onClick={() => setP({ windUnit: 'km/h' })}>km/h</button>
        <span data-testid="sigma">{p.windSigmaMs}</span>
        <WindSigmaTool />
      </>
    )
  }

  it('moves 1 to 1.5 to 2 and shows the wind unit', () => {
    mount(<Sigma />)
    const g = screen.getByRole('group', { name: 'Wind uncertainty' })
    expect(within(g).getByRole('status')).toHaveTextContent('±1 m/s')
    fireEvent.click(within(g).getByRole('button', { name: 'Wind uncertainty: more' }))
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).windSigmaMs).toBe(1.5)
    fireEvent.click(within(g).getByRole('button', { name: 'Wind uncertainty: more' }))
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).windSigmaMs).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'km/h' }))
    expect(within(g).getByRole('status')).toHaveTextContent('±7.2 km/h')
  })

  it('shows 1 m/s as ±3.6 km/h', () => {
    localStorage.setItem('gb.real.profile', JSON.stringify({ windUnit: 'km/h' }))
    mount(<Sigma />)
    expect(within(screen.getByRole('group', { name: 'Wind uncertainty' })).getByRole('status')).toHaveTextContent('±3.6 km/h')
  })
})

describe('DirectionField', () => {
  it('is labelled Direction, stores a typed bearing and shows the cardinal', () => {
    mount(<DirectionField compass={false} />)
    const input = screen.getByLabelText('Direction')
    type(input, '270')
    expect(stored().azimuthDeg).toEqual({ value: 270, source: 'manual' })
    expect(screen.getByText(/^°\s·\sW$/)).toBeInTheDocument()
  })

  it('clearing stores null and shows the placeholder', () => {
    mount(<DirectionField compass={false} />)
    const input = screen.getByLabelText('Direction')
    type(input, '270')
    type(input, '')
    expect(stored().azimuthDeg).toBeNull()
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', 'unknown')
  })

  it('carries the note', () => {
    mount(<DirectionField compass={false} />)
    expect(screen.getByText("Bearing to the target; rough is enough. Sets the compass points on the wind clock and the forecast's hour. Empty: Coriolis is horizontal only.")).toBeInTheDocument()
  })

  it('forwards inputRef to the number input', () => {
    const ref = { current: null as HTMLInputElement | null }
    mount(<DirectionField compass={false} inputRef={ref} />)
    expect(ref.current).toBe(screen.getByLabelText('Direction'))
  })

  it('has no Compass button with compass false or without DeviceOrientationEvent', () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    mount(<DirectionField compass={false} />)
    expect(screen.queryByRole('button', { name: 'Compass' })).not.toBeInTheDocument()
    cleanup()
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    mount(<DirectionField compass />)
    expect(screen.queryByRole('button', { name: 'Compass' })).not.toBeInTheDocument()
  })

  it('Compass stores one reading as a manual bearing, rounded', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    mount(<DirectionField compass />)
    fireEvent.click(screen.getByRole('button', { name: 'Compass' }))
    expect(screen.getByRole('status')).toHaveTextContent('steel throws the compass off')
    await act(async () => orientation(90.4))
    expect(stored().azimuthDeg).toEqual({ value: 270, source: 'manual' })
  })

  it('iOS: asks permission then reads webkitCompassHeading', async () => {
    const ask = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class extends Event {}, { requestPermission: ask }))
    mount(<DirectionField compass />)
    fireEvent.click(screen.getByRole('button', { name: 'Compass' }))
    await act(async () => { await Promise.resolve() })
    await act(async () => {
      const e = new Event('deviceorientation') as Event & { webkitCompassHeading: number }
      e.webkitCompassHeading = 359.6
      window.dispatchEvent(e)
    })
    expect(stored().azimuthDeg).toEqual({ value: 0, source: 'manual' })
    expect(ask).toHaveBeenCalled()
  })

  it('no reading in time shows the failure alert', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
      mount(<DirectionField compass />)
      fireEvent.click(screen.getByRole('button', { name: 'Compass' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(5001) })
      expect(screen.getByRole('alert')).toHaveTextContent('No reading from the compass.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('unmounting drops a reading in progress', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    const { unmount } = mount(<DirectionField compass />)
    fireEvent.click(screen.getByRole('button', { name: 'Compass' }))
    unmount()
    await act(async () => orientation(90))
    expect(stored().azimuthDeg ?? null).toBeNull()
  })
})

describe('ForecastLine', () => {
  const seed = (over: { wind?: number; azimuth?: number | null; height?: number; age?: number; noModel?: boolean } = {}) =>
    localStorage.setItem('gb.real.station', JSON.stringify({
      v: 1,
      heightAboveGroundM: { value: over.height ?? 1, source: 'manual' },
      ...(over.azimuth === null ? {} : { azimuthDeg: { value: over.azimuth ?? 270, source: 'manual' } }),
      ...(over.noModel ? {} : { model: { time: '2026-11-03T12:00', fetchedAt: NOW - (over.age ?? 0), windMs10: over.wind ?? 3.1, windFromDeg: 180 } }),
    }))
  beforeEach(() => needDirection.mockClear())

  it('renders nothing without a model or with a stale one', () => {
    seed({ noModel: true })
    const a = mount(<Tools />)
    expect(screen.queryByText(/Forecast/)).toBeNull()
    a.unmount()
    seed({ age: 4 * 3600_000 })
    mount(<Tools />)
    expect(screen.queryByText(/Forecast/)).toBeNull()
  })

  it('says the wind, its source and its clock hour, and Use sets all three', () => {
    seed()
    mount(<Tools />)
    expect(screen.getByText('Forecast near the ground: ≈ 2 m/s from S (9 o’clock)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current).toMatchObject({ windMs: 2, windClock: 9, windSet: true })
  })

  it('without an azimuth has no Use and asks for the direction', () => {
    seed({ azimuth: null })
    mount(<Tools />)
    expect(screen.getByText('Forecast near the ground: ≈ 2 m/s from S')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Set the shooting direction to get the hour.' }))
    expect(needDirection).toHaveBeenCalledTimes(1)
  })

  it('names the height above 2 m', () => {
    seed({ height: 15 })
    mount(<Tools />)
    expect(screen.getByText('Forecast at 15 m: ≈ 3.5 m/s from S (9 o’clock)')).toBeTruthy()
  })

  it('names the height in feet in imperial', () => {
    window.location.hash = '#/real/workbench?u=imperial'
    seed({ height: 4.572 })
    mount(<Tools />)
    expect(screen.getByText(/Forecast at 15 ft/)).toBeTruthy()
  })

  it('speaks in the wind unit, and Use shows it in the field', () => {
    seed()
    localStorage.setItem('gb.real.profile', JSON.stringify({ windUnit: 'km/h' }))
    mount(<Tools windUnit="km/h" />)
    expect(screen.getByText(/≈ 6 km\/h/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect((screen.getByLabelText('Wind speed') as HTMLInputElement).value).toBe('6')
  })

  it('a calm Use keeps the clock even with a direction', () => {
    seed({ wind: 0.6, azimuth: 270 })
    mount(<Tools start={{ windMs: 3, windClock: 4 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current).toMatchObject({ windMs: 0, windClock: 4, windSet: true })
  })

  it('a calm offers Use even without a direction, and keeps the clock', () => {
    seed({ wind: 0.6, azimuth: null })
    mount(<Tools start={{ windMs: 3, windClock: 4 }} />)
    expect(screen.getByText('Forecast near the ground: calm')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /direction/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current).toMatchObject({ windMs: 0, windClock: 4, windSet: true })
  })

  it('reads in Czech', () => {
    window.location.hash = '#/real/workbench?l=cs'
    seed()
    mount(<Tools />)
    expect(screen.getByText('Předpověď u země: ≈ 2 m/s od J (9 h)')).toBeTruthy()
  })
})

describe('ReadingHint', () => {
  it('says why to read out to half the distance', () => {
    mount(<ReadingHint />)
    expect(screen.getByText('Read it out to half the distance: that part makes ≈ 70 % of the drift.')).toBeTruthy()
  })
})
