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
/** Chromium still made a tap (and focused the field) of a 14 px swipe on the 0.1.8 number. */
const TAP_SLOP_PX = 15

const latest = { current: DEFAULT_SETUP }
const NOW = Date.now()
const needDirection = vi.fn()

function Page({ children }: { children: React.ReactNode }) {
  const [route, navigate] = useRoute()
  return <SettingsProvider route={route} navigate={navigate}>{children}</SettingsProvider>
}

function Tools({ start, system = 'metric', wheel, ruler, hint = 'line', windUnit = 'm/s' }: {
  start?: Partial<RealSetup>; system?: UnitSystem; wheel?: boolean; ruler?: boolean; hint?: 'line' | 'title'; windUnit?: WindUnit
}) {
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, ...start })
  useEffect(() => { latest.current = setup })
  const update = (patch: Partial<RealSetup>) => setSetup((s) => ({ ...s, ...patch }))
  return (
    <>
      <DistanceTool setup={setup} update={update} system={system} wheel={wheel} ruler={ruler} />
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

  describe('with the ruler', () => {
    const drag = (from: number, to: number) => {
      const ruler = document.querySelector<HTMLElement>('.ruler')!
      fireEvent.pointerDown(ruler, { pointerId: 1, clientX: from, clientY: 0 })
      fireEvent.pointerMove(ruler, { pointerId: 1, clientX: to, clientY: 0 })
      fireEvent.pointerUp(ruler, { pointerId: 1, clientX: to, clientY: 0 })
    }

    it('has no more and less buttons', () => {
      mount(<Tools start={{ distanceM: 300 }} ruler />)
      expect(screen.queryByRole('button', { name: 'Distance: more' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Distance: less' })).toBeNull()
      expect(document.querySelector('.ruler')).not.toBeNull()
    })

    it('keeps more and less without it', () => {
      mount(<Tools start={{ distanceM: 300 }} />)
      expect(document.querySelector('.ruler')).toBeNull()
    })

    it('ArrowRight in the field is 10 more, ArrowLeft 10 less', () => {
      mount(<Tools start={{ distanceM: 300 }} ruler />)
      fireEvent.keyDown(screen.getByLabelText('Distance'), { key: 'ArrowRight' })
      expect(latest.current.distanceM).toBe(310)
      fireEvent.keyDown(screen.getByLabelText('Distance'), { key: 'ArrowLeft' })
      fireEvent.keyDown(screen.getByLabelText('Distance'), { key: 'ArrowLeft' })
      expect(latest.current.distanceM).toBe(290)
    })

    it('ArrowRight is left to the caret without the ruler', () => {
      mount(<Tools start={{ distanceM: 300 }} />)
      fireEvent.keyDown(screen.getByLabelText('Distance'), { key: 'ArrowRight' })
      expect(latest.current.distanceM).toBe(300)
    })

    it('typing still commits', () => {
      mount(<Tools start={{ distanceM: 300 }} ruler />)
      type(screen.getByLabelText('Distance'), '845')
      expect(latest.current.distanceM).toBe(845)
    })

    it('a 60 px drag left is 100 m farther', () => {
      mount(<Tools start={{ distanceM: 300 }} ruler />)
      drag(200, 140)
      expect(latest.current.distanceM).toBe(400)
      expect(screen.getByLabelText('Distance')).toHaveValue('400')
    })

    it('in yards a 60 px drag is 100 yd, and the setup keeps metres', () => {
      mount(<Tools start={{ distanceM: 457.2 }} system="imperial" ruler />)
      expect(screen.getByLabelText('Distance')).toHaveValue('500')
      drag(200, 140)
      expect(screen.getByLabelText('Distance')).toHaveValue('600')
      expect(latest.current.distanceM).toBeCloseTo(548.64, 3)
    })

    describe('a touch on the box', () => {
      // jsdom has no pointer capture: a stand-in that records where a handler sets it.
      beforeEach(() => {
        Element.prototype.setPointerCapture = vi.fn()
        Element.prototype.releasePointerCapture = vi.fn()
      })
      afterEach(() => {
        delete (Element.prototype as Partial<Element>).setPointerCapture
        delete (Element.prototype as Partial<Element>).releasePointerCapture
      })
      const captures = () => vi.mocked(Element.prototype.setPointerCapture).mock.contexts as Element[]

      /**
       * A touch on `el` from (200, 100) through `moves` (dx, dy), as a phone's browser sends it: the pressed element holds
       * the touch until a handler takes the capture, and loses it (a bubbling lostpointercapture) before the next event. A
       * touch that stays within the tap slop then gets the browser's mousedown, which focuses the field unless prevented.
       */
      function touch(el: HTMLElement, moves: [number, number][] = []) {
        let holder: Element = el
        const earlier = captures().length
        const at = ([dx, dy]: [number, number]) => ({ pointerId: 1, pointerType: 'touch', clientX: 200 + dx, clientY: 100 + dy })
        const send = (type: 'pointerMove' | 'pointerUp', point: [number, number]) => {
          const to = captures().slice(earlier).at(-1)
          if (to && to !== holder) {
            fireEvent.lostPointerCapture(holder, at(point))
            holder = to
          }
          fireEvent[type](holder, at(point))
        }
        fireEvent.pointerDown(el, at([0, 0]))
        for (const point of moves) send('pointerMove', point)
        send('pointerUp', moves.at(-1) ?? [0, 0])
        if (moves.every(([dx, dy]) => Math.hypot(dx, dy) <= TAP_SLOP_PX) && fireEvent.mouseDown(el) && el instanceof HTMLInputElement) el.focus()
      }
      const box = () => document.querySelector<HTMLElement>('.real-distance')!
      const field = () => screen.getByLabelText('Distance')

      it('a sideways swipe that starts on the number moves the distance', () => {
        mount(<Tools start={{ distanceM: 300 }} ruler />)
        touch(field(), [[-10, 0], [-30, 0], [-60, 0]])
        expect(latest.current.distanceM).toBe(400)
        expect(field()).toHaveValue('400')
      })

      it('a slanted swipe on the box moves it by 10 steps, not 1', () => {
        mount(<Tools start={{ distanceM: 300 }} ruler />)
        touch(box().querySelector('.ruler-scale svg')!, [[-8, 3], [-30, 12], [-60, 25]])
        expect(latest.current.distanceM).toBe(400)
      })

      it('a tap on the number focuses it and leaves the value', () => {
        mount(<Tools start={{ distanceM: 300 }} ruler />)
        touch(field())
        expect(field()).toHaveFocus()
        expect(latest.current.distanceM).toBe(300)
      })

      it('a short swipe that starts on the number moves it and does not focus it', () => {
        mount(<Tools start={{ distanceM: 300 }} ruler />)
        touch(field(), [[-7, 0], [-12, 0]])
        expect(latest.current.distanceM).toBe(320)
        expect(field()).not.toHaveFocus()
      })

      it('a swipe that starts on the number while it has the focus leaves it unfocused', () => {
        mount(<Tools start={{ distanceM: 300 }} ruler />)
        field().focus()
        touch(field(), [[-10, 0], [-60, 0]])
        expect(latest.current.distanceM).toBe(400)
        expect(field()).not.toHaveFocus()
      })

      it('a mostly vertical move on the box changes nothing', () => {
        mount(<Tools start={{ distanceM: 300 }} ruler />)
        touch(box().querySelector('.ruler-scale svg')!, [[-3, 8], [-20, 40], [-30, 60]])
        touch(field(), [[2, -10], [10, -50]])
        expect(latest.current.distanceM).toBe(300)
        expect(field()).toHaveValue('300')
      })

      it('in yards a swipe on the number steps 10 yd, and the setup keeps metres', () => {
        mount(<Tools start={{ distanceM: 457.2 }} system="imperial" ruler />)
        touch(field(), [[-10, 0], [-60, 0]])
        expect(field()).toHaveValue('600')
        expect(latest.current.distanceM).toBeCloseTo(548.64, 3)
      })
    })
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

  it('with zones active ends in (all zones), and Use clears both zones', () => {
    seed()
    mount(<Tools start={{ zonesOn: true, distanceM: 1600, windMid: { ms: 5, clock: 2 }, windFar: { ms: 7, clock: 3 } }} />)
    expect(screen.getByText('Forecast near the ground: ≈ 2 m/s from S (9 o’clock) (all zones)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current).toMatchObject({ windMid: null, windFar: null, windClock: 9 })
  })

  it('adds the suffix to the line without an hour and to a calm too', () => {
    const start = { zonesOn: true, distanceM: 1600 }
    seed({ azimuth: null })
    mount(<Tools start={start} />)
    expect(screen.getByText('Forecast near the ground: ≈ 2 m/s from S (all zones)')).toBeTruthy()
    cleanup()
    seed({ wind: 0.6 })
    mount(<Tools start={start} />)
    expect(screen.getByText('Forecast near the ground: calm (all zones)')).toBeTruthy()
  })

  // No zone value is lost without the user's action (spec anti-goal): under 1000 m the zones aren't on screen.
  it('under 1000 m has no suffix, and Use sets the near wind and keeps both zones', () => {
    seed()
    mount(<Tools start={{ zonesOn: true, distanceM: 950, windMid: { ms: 5, clock: 2 }, windFar: { ms: 7, clock: 3 } }} />)
    expect(screen.getByText('Forecast near the ground: ≈ 2 m/s from S (9 o’clock)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current).toMatchObject({ windMs: 2, windClock: 9, windMid: { ms: 5, clock: 2 }, windFar: { ms: 7, clock: 3 } })
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
    expect(screen.getByText('Read it out to half the distance: that part makes about two thirds of the drift.')).toBeTruthy()
  })
})
