import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'

const HASH = '#/real/workbench?p=p7&d=1000&ws=0'
const MIN = 60_000

function open(hash = HASH) {
  window.location.hash = hash
  return render(<App />)
}

const lineButton = () => screen.getByRole('button', { name: /^Atmosphere:/ })
const sheet = () => screen.getByRole('dialog', { name: 'Atmosphere' })
const openSheet = () => { fireEvent.click(lineButton()); return sheet() }
const byLocation = () => within(sheet()).getByRole('button', { name: /^(By location|Refresh)$/ })
const stored = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}')
const type = (el: HTMLElement, text: string) => {
  fireEvent.change(el, { target: { value: text } })
  fireEvent.blur(el)
}

const origGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
const getPosition = vi.fn()
function position(accuracy = 12) {
  getPosition.mockImplementation((ok: (p: unknown) => void) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy } }))
}
function positionError(code: number) {
  getPosition.mockImplementation((_ok: unknown, err: (e: { code: number }) => void) => err({ code }))
}
const weatherJson = (over: Record<string, unknown> = {}) => ({
  current: { time: '2026-10-31T14:05', temperature_2m: 10, relative_humidity_2m: 76, surface_pressure: 1003.5, wind_speed_10m: 3.1, wind_direction_10m: 180, ...over },
})
function network(opts: { status?: number; reject?: boolean; forecast?: Record<string, unknown> } = {}) {
  const f = vi.fn(async (url: string) => {
    if (opts.reject) throw new TypeError('net')
    if (opts.status) return { ok: false, status: opts.status, json: async () => ({}) }
    if (url.includes('/elevation')) return { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
    return { ok: true, json: async () => weatherJson(opts.forecast) }
  })
  vi.stubGlobal('fetch', f)
  return f
}
const seedCache = (ageMin: number, over: Record<string, unknown> = {}) =>
  localStorage.setItem('gb.real.weather', JSON.stringify({
    cell: { lat: 50.09, lon: 14.42 }, elevationM: 300, tempC: 4, humidityPct: 60, stationPressureHPa: 980,
    modelTime: '2026-10-31T11:00', fetchedAt: Date.now() - ageMin * MIN, ...over,
  }))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('isSecureContext', true)
  getPosition.mockReset()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (origGeo) Object.defineProperty(navigator, 'geolocation', origGeo)
  else delete (navigator as unknown as Record<string, unknown>).geolocation
})

describe('By location', () => {
  it('lights By location on a standard station', () => {
    open()
    openSheet()
    expect(byLocation()).toHaveClass('glow-want')
  })

  it('asks for nothing on page load or when the sheet opens', () => {
    const f = network()
    open()
    openSheet()
    expect(f).not.toHaveBeenCalled()
    expect(getPosition).not.toHaveBeenCalled()
  })

  it('the first tap shows the note and makes no request; Cancel closes it without a request', () => {
    const f = network()
    position()
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(within(sheet()).getByText(/rounded to about 1 km and sent to Open-Meteo/)).toBeInTheDocument()
    expect(within(sheet()).getByText(/keeps its logs for 90 days/)).toBeInTheDocument()
    expect(getPosition).not.toHaveBeenCalled()
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cancel' }))
    expect(within(sheet()).queryByText(/rounded to about 1 km/)).toBeNull()
    expect(getPosition).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('gb.real.profile') ?? '{}').locationNoteSeen).not.toBe(true)
  })

  it('Continue fills the model fields, the line reads model, and later taps skip the note', async () => {
    const f = network()
    position()
    open()
    openSheet()
    fireEvent.click(byLocation())
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(lineButton()).toHaveTextContent(/model 14:05/))
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls.every(([u]) => String(u).startsWith('https://api.open-meteo.com/v1/'))).toBe(true)
    expect(f.mock.calls.map(([u]) => String(u)).join()).not.toMatch(/50\.0851|pressure_msl/)
    expect(lineButton()).toHaveTextContent(/^10\s°C · 1004\shPa · 76\s% · 208\sm · model 14:05$/)
    const st = stored()
    expect(st.tempC).toEqual({ value: 10, source: 'model' })
    expect(st.pressureHPa).toEqual({ value: 1003.5, source: 'model' })
    expect(st.pressureKind).toBe('station')
    expect(st.altitudeM).toEqual({ value: 208, source: 'model' })
    expect(st.latitudeDeg).toEqual({ value: 50.09, source: 'location' })
    expect(JSON.stringify(st)).not.toContain('50.0851')
    expect(localStorage.getItem('gb.real.weather') ?? '').not.toContain('50.0851')
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).locationNoteSeen).toBe(true)
    // the next tap goes straight on
    getPosition.mockClear()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Refresh' }))
    expect(within(sheet()).queryByText(/rounded to about 1 km/)).toBeNull()
    expect(getPosition).toHaveBeenCalledTimes(1)
  })

  it('shows Locating… and then Loading weather… while it runs', async () => {
    let answer: (p: unknown) => void = () => {}
    getPosition.mockImplementation((ok: (p: unknown) => void) => { answer = ok })
    const pending: Record<string, (v: unknown) => void> = {}
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise((res) => {
      pending[url.includes('/elevation') ? 'elevation' : 'forecast'] = () => res(url.includes('/elevation')
        ? { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
        : { ok: true, json: async () => weatherJson() })
    })))
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(within(sheet()).getByRole('button', { name: 'Locating…' })).toBeDisabled()
    answer({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } })
    await waitFor(() => expect(pending.elevation).toBeDefined())
    expect(within(sheet()).getByRole('button', { name: 'Loading weather…' })).toBeDisabled()
    pending.elevation!(null)
    await waitFor(() => expect(pending.forecast).toBeDefined())
    expect(within(sheet()).getByRole('button', { name: 'Loading weather…' })).toBeDisabled()
    pending.forecast!(null)
    await waitFor(() => expect(within(sheet()).getByRole('button', { name: 'Refresh' })).toBeEnabled())
  })

  it('the attribution links to Open-Meteo, with Copernicus for the altitude', async () => {
    network()
    position()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    const link = await within(sheet()).findByRole('link', { name: 'Open-Meteo.com' })
    expect(link).toHaveAttribute('href', 'https://open-meteo.com/')
    expect(link.parentElement).toHaveTextContent('Weather data by Open-Meteo.com')
    expect(within(sheet()).getByText('Elevation: Copernicus DEM GLO-90')).toBeInTheDocument()
  })

  it('a manual temperature survives a refresh, and the other fields update', async () => {
    network()
    position()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    type(within(sheet()).getByLabelText('Temperature'), '-3')
    fireEvent.click(byLocation())
    await waitFor(() => expect(stored().altitudeM).toEqual({ value: 208, source: 'model' }))
    expect(stored().tempC).toEqual({ value: -3, source: 'manual' })
    expect(stored().humidityPct).toEqual({ value: 76, source: 'model' })
    fireEvent.click(byLocation())
    await waitFor(() => expect(within(sheet()).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    expect(stored().tempC).toEqual({ value: -3, source: 'manual' })
  })

  it('a second refresh within 30 minutes makes no request', async () => {
    const f = network()
    position()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    await waitFor(() => expect(stored().model).toBeTruthy())
    expect(f).toHaveBeenCalledTimes(2)
    fireEvent.click(byLocation())
    await waitFor(() => expect(getPosition).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(sheet()).getByRole('button', { name: 'Refresh' })).toBeEnabled())
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a coarse position (accuracy over 1 km) marks the altitude as approximate', async () => {
    network()
    position(5000)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText('approximate position: check the altitude')).toBeInTheDocument()
  })

  it('denied shows its text, and a second tap calls neither geolocation nor the API', async () => {
    const f = network()
    positionError(1)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    const text = 'Location access is blocked. Allow it in the site settings, or enter the values by hand.'
    expect(await within(sheet()).findByText(text)).toBeInTheDocument()
    expect(getPosition).toHaveBeenCalledTimes(1)
    fireEvent.click(byLocation())
    expect(within(sheet()).getByText(text)).toBeInTheDocument()
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(f).not.toHaveBeenCalled()
    // manual entry still works
    type(within(sheet()).getByLabelText('Temperature'), '7')
    expect(stored().tempC).toEqual({ value: 7, source: 'manual' })
  })

  it('an insecure context says so', async () => {
    network()
    vi.stubGlobal('isSecureContext', false)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText('Location works only over HTTPS.')).toBeInTheDocument()
  })

  it('an unavailable position offers Try again', async () => {
    network()
    positionError(2)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText("The position couldn't be found.")).toBeInTheDocument()
    positionError(2)
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(getPosition).toHaveBeenCalledTimes(2))
  })

  it('a 503 shows the service text and leaves the station as it was', async () => {
    network({ status: 503 })
    position()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText("The weather service isn't answering.")).toBeInTheDocument()
    expect(lineButton()).toHaveTextContent(/standard$/)
  })

  it('offline with a cache says no connection, uses the last weather with its age and does not claim the standard atmosphere', async () => {
    network({ reject: true })
    position()
    seedCache(90)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText('No connection.')).toBeInTheDocument()
    expect(within(sheet()).getByText(/Using the last weather instead \(1 h old\)/)).toBeInTheDocument()
    expect(within(sheet()).queryByText(/standard atmosphere for your altitude/)).toBeNull()
    expect(stored().altitudeM).toEqual({ value: 300, source: 'model' })
    expect(lineButton()).toHaveTextContent(/model 11:00 · 1 h old$/)
  })

  it('service with a cache applies the cached values and shows their age', async () => {
    network({ status: 503 })
    position()
    seedCache(100)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText("The weather service isn't answering.")).toBeInTheDocument()
    expect(within(sheet()).getByText(/\(1 h old\)/)).toBeInTheDocument()
    expect(stored().tempC).toEqual({ value: 4, source: 'model' })
    expect(stored().pressureHPa).toEqual({ value: 980, source: 'model' })
  })

  describe('offline without a cache', () => {
    const seedStale = (temp: Record<string, unknown> = { value: 10, source: 'model' }) =>
      localStorage.setItem('gb.real.station', JSON.stringify({
        v: 1, tempC: temp,
        pressureHPa: { value: 1003.5, source: 'model' }, pressureKind: 'station',
        humidityPct: { value: 76, source: 'model' }, altitudeM: { value: 208, source: 'model' },
        latitudeDeg: { value: 50.09, source: 'location' },
        model: { time: '2026-10-31T14:05', fetchedAt: Date.now() - 4 * 60 * MIN },
      }))
    const run = async () => {
      network({ reject: true })
      position()
      localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
      open()
      openSheet()
      fireEvent.click(byLocation())
      expect(await within(sheet()).findByText('Using the standard atmosphere for your altitude.')).toBeInTheDocument()
    }

    it('puts the model weather back to standard, keeps the altitude, and drops the stale warning', async () => {
      seedStale()
      await run()
      expect(within(sheet()).getByText('No connection.')).toBeInTheDocument()
      const st = stored()
      expect(st.tempC.source).toBe('standard')
      expect(st.humidityPct.source).toBe('standard')
      expect(st.pressureHPa.source).toBe('standard')
      expect(st.pressureKind).toBe('qnh')
      expect(st.altitudeM).toEqual({ value: 208, source: 'model' })
      expect(st.latitudeDeg).toEqual({ value: 50.09, source: 'location' })
      expect(st.model ?? null).toBeNull()
      expect(screen.queryByText(/The weather from your location is more than 3 hours old/)).toBeNull()
      expect(lineButton()).not.toHaveTextContent(/stale/)
    })

    it('keeps a manual temperature', async () => {
      seedStale({ value: -3, source: 'manual' })
      await run()
      expect(stored().tempC).toEqual({ value: -3, source: 'manual' })
      expect(stored().humidityPct.source).toBe('standard')
    })
  })
})

describe('the automatic refresh switch', () => {
  it('is hidden before the location note was seen, shown after, and toggling it stores the choice', () => {
    open()
    openSheet()
    expect(within(sheet()).queryByRole('switch')).toBeNull()
    cleanup()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    const sw = within(sheet()).getByRole('switch', { name: 'Refresh by itself every 15 min' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).weatherAutoRefresh).toBe(false)
    fireEvent.click(sw)
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).weatherAutoRefresh).toBe(true)
  })
})

describe('the pressure kind on a model pressure', () => {
  const seed = () =>
    localStorage.setItem('gb.real.station', JSON.stringify({
      v: 1, tempC: { value: 10, source: 'model' },
      pressureHPa: { value: 1003.5, source: 'model' }, pressureKind: 'station',
      humidityPct: { value: 76, source: 'model' }, altitudeM: { value: 208, source: 'model' },
      model: { time: '2026-10-31T14:05', fetchedAt: Date.now() - MIN },
    }))
  const elevation = () => screen.getByTestId('real-elevation').textContent

  it('converts through the altitude, keeps the source and the air, and converts back', () => {
    seed()
    open()
    const before = elevation()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'QNH' }))
    expect(Number((within(s).getByLabelText('Pressure') as HTMLInputElement).value)).toBeCloseTo(1028.6, 0)
    expect(stored().pressureHPa.source).toBe('model')
    expect(stored().pressureKind).toBe('qnh')
    expect(elevation()).toBe(before)
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    expect(stored().pressureHPa.value).toBeCloseTo(1003.5, 6)
    expect(stored().pressureHPa.source).toBe('model')
    expect(elevation()).toBe(before)
  })
})

describe('a value the forecast dropped (I1)', () => {
  it('a stale model pressure the refresh lacks goes back to standard, is named, and the rest updates', async () => {
    localStorage.setItem('gb.real.station', JSON.stringify({
      v: 1, tempC: { value: 5, source: 'model' },
      pressureHPa: { value: 960, source: 'model' }, pressureKind: 'station',
      humidityPct: { value: 60, source: 'model' }, altitudeM: { value: 208, source: 'model' },
      latitudeDeg: { value: 50.09, source: 'location' },
      model: { time: '2026-10-30T08:00', fetchedAt: Date.now() - 30 * 60 * MIN },
    }))
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    network({ forecast: { surface_pressure: 0 } })
    position()
    open()
    expect(lineButton()).toHaveTextContent(/stale weather$/)
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText('The forecast had no pressure: using the standard one.')).toBeInTheDocument()
    const st = stored()
    expect(st.pressureHPa).toEqual({ value: 1013.25, source: 'standard' })
    expect(st.pressureKind).toBe('qnh')
    expect(st.tempC).toEqual({ value: 10, source: 'model' })
    expect(st.humidityPct).toEqual({ value: 76, source: 'model' })
    // No model time on a pressure that wasn't refreshed: the line names it standard.
    expect(lineButton()).toHaveTextContent(/^10\s°C · QNH 1013\shPa · 76\s% · 208\sm · model 14:05 · standard$/)
    expect(screen.queryByText(/more than 3 hours old/)).toBeNull()
    // Typing the pressure makes the line untrue, so it goes.
    type(within(sheet()).getByLabelText('Pressure'), '1020')
    expect(within(sheet()).queryByText(/The forecast had no/)).toBeNull()
  })

  it('names two dropped values in one line, in Czech too', async () => {
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    network({ forecast: { temperature_2m: null, relative_humidity_2m: 140 } })
    position()
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText('The forecast had no temperature or humidity: using the standard values.')).toBeInTheDocument()
    expect(stored().pressureHPa).toEqual({ value: 1003.5, source: 'model' })
    cleanup()
    localStorage.removeItem('gb.real.weather')
    localStorage.removeItem('gb.real.station')
    open('#/real/workbench?l=cs&p=p7&d=1000&ws=0')
    fireEvent.click(screen.getByRole('button', { name: /^Atmosféra:/ }))
    const cs = screen.getByRole('dialog', { name: 'Atmosféra' })
    fireEvent.click(within(cs).getByRole('button', { name: 'Podle polohy' }))
    expect(await within(cs).findByText('Předpověď neměla teplotu ani vlhkost: používám standardní hodnoty.')).toBeInTheDocument()
    cleanup()
    localStorage.removeItem('gb.real.weather')
    localStorage.removeItem('gb.real.station')
    network({ forecast: { surface_pressure: null } })
    open('#/real/workbench?l=cs&p=p7&d=1000&ws=0')
    fireEvent.click(screen.getByRole('button', { name: /^Atmosféra:/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Atmosféra' })).getByRole('button', { name: 'Podle polohy' }))
    expect(await screen.findByText('Předpověď neměla tlak: používám standardní.')).toBeInTheDocument()
  })
})

describe('the altitude and the model weather (C1)', () => {
  const seen = () => localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
  const elevation = () => screen.getByTestId('real-elevation').textContent
  const altitude = () => within(sheet()).getByLabelText('Altitude')
  const located = async () => {
    seen()
    open()
    openSheet()
    fireEvent.click(byLocation())
    await waitFor(() => expect(stored().model).toBeTruthy())
  }

  it('an altitude edit after By location moves the model pressure, and both tap orders give the same answer', async () => {
    const run = async (qnhFirst: boolean) => {
      network()
      position(5000)
      await located()
      if (qnhFirst) fireEvent.click(within(sheet()).getByRole('button', { name: 'QNH' }))
      type(altitude(), '400')
      const out = { elevation: elevation(), line: lineButton().textContent, st: stored() }
      cleanup()
      localStorage.clear()
      return out
    }
    const a = await run(false)
    expect(a.line).toMatch(/^9\s°C · 981\shPa · 76\s% · 400\sm · model 14:05$/)
    expect(a.st.pressureHPa.source).toBe('model')
    expect(a.st.pressureHPa.value).toBeCloseTo(980.76, 2)
    expect(a.st.tempC.value).toBeCloseTo(8.752, 6)
    expect(a.st.altitudeM).toEqual({ value: 400, source: 'manual' })
    const b = await run(true)
    expect(b.line).toMatch(/QNH 1029\shPa/)
    expect(b.elevation).toBe(a.elevation)
  })

  it('toggling the kind after an altitude edit neither moves the air nor clamps it', async () => {
    network()
    position()
    await located()
    type(altitude(), '1500')
    const before = elevation()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'QNH' }))
    expect(Number((within(sheet()).getByLabelText('Pressure') as HTMLInputElement).value)).toBeCloseTo(1028.6, 0)
    expect(stored().pressureHPa.source).toBe('model')
    expect(elevation()).toBe(before)
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Station' }))
    expect(elevation()).toBe(before)
  })

  it('a manual altitude typed before By location is the forecast elevation: no grid request, and it stays manual', async () => {
    const f = network()
    position()
    seen()
    open()
    openSheet()
    type(altitude(), '600')
    fireEvent.click(byLocation())
    await waitFor(() => expect(stored().model).toBeTruthy())
    expect(f).toHaveBeenCalledTimes(1)
    expect(String(f.mock.calls[0]![0])).toContain('/v1/forecast?latitude=50.09&longitude=14.42&elevation=600&')
    expect(stored().altitudeM).toEqual({ value: 600, source: 'manual' })
    // The answer is the model's pressure at 600 m, as it came.
    expect(stored().pressureHPa).toEqual({ value: 1003.5, source: 'model' })
  })
})

describe('a later tap after a denial (M4)', () => {
  const origPerm = Object.getOwnPropertyDescriptor(navigator, 'permissions')
  const permission = (query: () => Promise<unknown>) => {
    const q = vi.fn(query)
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: q } })
    return q
  }
  afterEach(() => {
    if (origPerm) Object.defineProperty(navigator, 'permissions', origPerm)
    else delete (navigator as unknown as Record<string, unknown>).permissions
  })
  const deniedOnce = async () => {
    network()
    positionError(1)
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    await within(sheet()).findByText(/Location access is blocked/)
    expect(getPosition).toHaveBeenCalledTimes(1)
  }
  const settle = () => act(async () => { await Promise.resolve() })

  it('asks the permission state, and a state still denied calls nothing', async () => {
    await deniedOnce()
    const q = permission(async () => ({ state: 'denied' }))
    fireEvent.click(byLocation())
    await waitFor(() => expect(q).toHaveBeenCalledWith({ name: 'geolocation' }))
    await settle()
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(within(sheet()).getByText(/Location access is blocked/)).toBeInTheDocument()
  })

  it('a query that throws calls nothing', async () => {
    await deniedOnce()
    const q = permission(async () => { throw new TypeError('no') })
    fireEvent.click(byLocation())
    await waitFor(() => expect(q).toHaveBeenCalled())
    await settle()
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(within(sheet()).getByText(/Location access is blocked/)).toBeInTheDocument()
  })

  it('granted (allowed in the site settings since) tries again: one call', async () => {
    await deniedOnce()
    permission(async () => ({ state: 'granted' }))
    position()
    fireEvent.click(byLocation())
    await waitFor(() => expect(stored().model).toBeTruthy())
    expect(getPosition).toHaveBeenCalledTimes(2)
    expect(within(sheet()).queryByText(/Location access is blocked/)).toBeNull()
  })

  it('prompt (a dismissed prompt Chrome reported as a denial) tries again', async () => {
    await deniedOnce()
    permission(async () => ({ state: 'prompt' }))
    fireEvent.click(byLocation())
    await waitFor(() => expect(getPosition).toHaveBeenCalledTimes(2))
  })
})

describe('more failures', () => {
  const seen = () => localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))

  it('denied has no Try again', async () => {
    network()
    positionError(1)
    seen()
    open()
    openSheet()
    fireEvent.click(byLocation())
    await within(sheet()).findByText(/Location access is blocked/)
    expect(within(sheet()).queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('a timeout shows the position text with Try again', async () => {
    network()
    positionError(3)
    seen()
    open()
    openSheet()
    fireEvent.click(byLocation())
    expect(await within(sheet()).findByText("The position couldn't be found.")).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('the Standard atmosphere reset clears the failure and the approximate-position note', async () => {
    network()
    position(5000)
    seen()
    open()
    openSheet()
    fireEvent.click(byLocation())
    await within(sheet()).findByText('approximate position: check the altitude')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Standard atmosphere' }))
    expect(within(sheet()).queryByText('approximate position: check the altitude')).toBeNull()
    localStorage.removeItem('gb.real.weather')
    network({ reject: true })
    fireEvent.click(byLocation())
    await within(sheet()).findByText('No connection.')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Standard atmosphere' }))
    expect(within(sheet()).queryByText('No connection.')).toBeNull()
  })

  it('a failure with a cache clears an earlier approximate-position note', async () => {
    network()
    position(5000)
    seen()
    open()
    openSheet()
    fireEvent.click(byLocation())
    await within(sheet()).findByText('approximate position: check the altitude')
    localStorage.removeItem('gb.real.weather')
    network({ reject: true })
    fireEvent.click(byLocation())
    await within(sheet()).findByText('No connection.')
    expect(within(sheet()).queryByText('approximate position: check the altitude')).toBeNull()
  })
})

describe('the attribution', () => {
  it('sits after the model fields with the licence link', async () => {
    network()
    position()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    openSheet()
    fireEvent.click(byLocation())
    const cc = await within(sheet()).findByRole('link', { name: 'CC BY 4.0' })
    expect(cc).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    const attr = cc.closest('.st-attr')!
    expect(attr.closest('.st-slot')).toBeNull()
    const lat = within(sheet()).getByLabelText('Latitude')
    expect(lat.compareDocumentPosition(attr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the buttons: By location and Cancel ghost, Continue primary', () => {
    network()
    open()
    openSheet()
    expect(byLocation()).toHaveClass('ghost')
    fireEvent.click(byLocation())
    expect(within(sheet()).getByRole('button', { name: 'Continue' })).toHaveClass('primary')
    expect(within(sheet()).getByRole('button', { name: 'Cancel' })).toHaveClass('ghost')
  })
})

describe('the age of the model', () => {
  const seedStation = (ageMin: number) =>
    localStorage.setItem('gb.real.station', JSON.stringify({
      v: 1,
      tempC: { value: 10, source: 'model' },
      pressureHPa: { value: 1003.5, source: 'model' }, pressureKind: 'station',
      humidityPct: { value: 76, source: 'model' }, altitudeM: { value: 208, source: 'model' },
      latitudeDeg: { value: 50.09, source: 'location' },
      model: { time: '2026-10-31T14:05', fetchedAt: Date.now() - ageMin * MIN },
    }))

  it('a fresh model shows only its time, an aging one its age', () => {
    seedStation(10)
    open()
    expect(lineButton()).toHaveTextContent(/model 14:05$/)
    cleanup()
    seedStation(130)
    open()
    expect(lineButton()).toHaveTextContent(/model 14:05 · 2 h old$/)
    expect(screen.queryByText(/stale/i)).toBeNull()
  })

  it('a stale model warns on the main screen and on the line', () => {
    seedStation(4 * 60)
    open()
    expect(lineButton()).toHaveTextContent(/stale weather$/)
    expect(screen.getByText(/The weather from your location is more than 3 hours old/)).toBeInTheDocument()
  })

  it('a refresh while stale clears the warning at once', async () => {
    seedStation(4 * 60)
    network()
    position()
    localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true }))
    open()
    expect(screen.getByText(/The weather from your location is more than 3 hours old/)).toBeInTheDocument()
    fireEvent.click(lineButton())
    fireEvent.click(byLocation())
    await waitFor(() => expect(screen.queryByText(/The weather from your location is more than 3 hours old/)).toBeNull())
    expect(lineButton()).not.toHaveTextContent(/stale/)
  })

  it('an altitude-only model station shows no stale warning', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({ v: 1, altitudeM: { value: 208, source: 'model' }, model: { time: '2026-10-31T14:05', fetchedAt: Date.now() - 5 * 60 * MIN } }))
    open()
    expect(screen.queryByText(/more than 3 hours old/)).toBeNull()
    expect(lineButton()).not.toHaveTextContent(/stale|model 14:05/)
  })

  // M1: model fields whose model block is unusable count as stale, not timeless.
  it('model fields with no usable model block are stale: on the line, on the main screen and on the button', () => {
    const fields = {
      v: 1, tempC: { value: 10, source: 'model' }, pressureHPa: { value: 1003.5, source: 'model' }, pressureKind: 'station',
      humidityPct: { value: 76, source: 'model' }, altitudeM: { value: 208, source: 'model' },
    }
    for (const model of [
      { time: '2026-10-31T14:05', fetchedAt: Date.now() + 60 * MIN },
      { time: '', fetchedAt: Date.now() - MIN },
      undefined,
    ]) {
      localStorage.setItem('gb.real.station', JSON.stringify({ ...fields, model }))
      open()
      expect(lineButton()).toHaveTextContent(/^10\s°C · 1004\shPa · 76\s% · 208\sm · model · stale weather$/)
      expect(screen.getByText(/The weather from your location is more than 3 hours old/)).toBeInTheDocument()
      openSheet()
      expect(within(sheet()).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('no warning when the model fields were all typed over', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({ v: 1, tempC: { value: 10, source: 'manual' }, model: { time: 'x', fetchedAt: Date.now() - 5 * 60 * MIN } }))
    open()
    expect(screen.queryByText(/The weather from your location is more than 3 hours old/)).toBeNull()
  })
})
