import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
      <ForecastLine setup={setup} update={update} now={NOW} onNeedDirection={needDirection} />
    </>
  )
}

function Direction(props: { inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const [setup, setSetup] = useState<RealSetup>(DEFAULT_SETUP)
  useEffect(() => { latest.current = setup })
  return <DirectionField setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch }))} {...props} />
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
    mount(<Direction />)
    const input = screen.getByLabelText('Direction')
    type(input, '270')
    expect(stored().azimuthDeg).toEqual({ value: 270, source: 'manual' })
    expect(screen.getByText(/^°\s·\sW$/)).toBeInTheDocument()
  })

  it('clearing stores null and shows the placeholder', () => {
    mount(<Direction />)
    const input = screen.getByLabelText('Direction')
    type(input, '270')
    type(input, '')
    expect(stored().azimuthDeg).toBeNull()
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', 'unknown')
  })

  it('carries the note', () => {
    mount(<Direction />)
    expect(screen.getByText("Bearing to the target; rough is enough. Sets the compass points on the wind clock and the forecast's hour. Empty: Coriolis is horizontal only.")).toBeInTheDocument()
  })

  it('forwards inputRef to the number input', () => {
    const ref = { current: null as HTMLInputElement | null }
    mount(<Direction inputRef={ref} />)
    expect(ref.current).toBe(screen.getByLabelText('Direction'))
  })

  it('with a live heading shows it in the accent and locks the field', () => {
    const [setup, update] = [DEFAULT_SETUP, () => {}]
    mount(<DirectionField setup={setup} update={update} live={274} />)
    const input = screen.getByLabelText('Direction')
    expect(input).toHaveValue('274')
    expect(input).toBeDisabled()
    expect(screen.getByText(/^°\s·\sW$/)).toBeInTheDocument()
  })

  it('has no Compass button', () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    mount(<Direction />)
    expect(screen.queryByRole('button', { name: 'Compass' })).not.toBeInTheDocument()
  })
})

describe('SlopeTool with a live reading', () => {
  it('shows the reading, locks the field and the steppers, and writes nothing', () => {
    const update = vi.fn()
    mount(<SlopeTool setup={DEFAULT_SETUP} update={update} hint="line" live={-4} />)
    const input = screen.getByLabelText('Slope')
    expect(input).toHaveValue('-4')
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: /Slope: less|less/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Slope: more|more/i })).toBeDisabled()
    expect(update).not.toHaveBeenCalled()
  })

  it('goes back to the setup value when the reading ends', () => {
    const { rerender } = mount(<SlopeTool setup={{ ...DEFAULT_SETUP, slopeDeg: 3 }} update={() => {}} hint="line" live={-4} />)
    rerender(<Page><SlopeTool setup={{ ...DEFAULT_SETUP, slopeDeg: 3 }} update={() => {}} hint="line" /></Page>)
    expect(screen.getByLabelText('Slope')).toHaveValue('3')
    expect(screen.getByLabelText('Slope')).toBeEnabled()
  })
})

describe('DirectionField turns the wind', () => {
  const memory = () => JSON.parse(localStorage.getItem('gb.real.wind') ?? 'null')
  const Wind = ({ start }: { start: Partial<RealSetup> }) => {
    const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, ...start })
    useEffect(() => { latest.current = setup })
    return <DirectionField setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch }))} />
  }

  it('keeps where the wind blows from while the direction is typed', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({ v: 1, heightAboveGroundM: { value: 1, source: 'manual' }, azimuthDeg: { value: 180, source: 'manual' } }))
    mount(<Wind start={{ windSet: true, windMs: 3, windClock: 10 }} />)
    type(screen.getByLabelText('Direction'), '274')
    expect(latest.current.windClock).toBe(7)
    expect(memory()).toMatchObject({ fromDeg: 120, hour: 7, source: 'hand' })
  })

  it('does not turn an unset wind and leaves no hour change', () => {
    mount(<Wind start={{ windSet: false }} />)
    type(screen.getByLabelText('Direction'), '90')
    expect(latest.current.windClock).toBe(DEFAULT_SETUP.windClock)
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

  const follow = (hour: number, speedMs: number) => {
    localStorage.setItem('gb.real.profile', JSON.stringify({ forecastWind: 'auto' }))
    localStorage.setItem('gb.real.wind', JSON.stringify({ fromDeg: 180, hour, speedMs, source: 'forecast' }))
  }

  it('following with a cleared direction shows the normal offer and the ask, never an empty hour', () => {
    seed({ azimuth: null })
    follow(9, 2)
    mount(<Tools start={{ windSet: true, windMs: 2, windClock: 9 }} />)
    expect(screen.getByText('Forecast near the ground: ≈ 2 m/s from S')).toBeTruthy()
    expect(screen.queryByText(/o’clock\)/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Set the shooting direction to get the hour.' })).toBeTruthy()
  })

  it('following says the hour; a calm following says calm', () => {
    seed()
    follow(9, 2)
    const a = mount(<Tools start={{ windSet: true, windMs: 2, windClock: 9 }} />)
    expect(screen.getByText('Wind from the forecast near the ground: ≈ 2 m/s from S (9 o’clock)')).toBeTruthy()
    a.unmount()
    seed({ wind: 0.6, azimuth: null })
    follow(4, 0)
    mount(<Tools start={{ windSet: true, windMs: 0, windClock: 4 }} />)
    expect(screen.getByText('Wind from the forecast near the ground: calm')).toBeTruthy()
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
