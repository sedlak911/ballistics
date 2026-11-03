import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { readHeading } from './compass'

function open(hash = '#/real/workbench?p=p7&d=1000&ws=0') {
  window.location.hash = hash
  return render(<App />)
}

const lineButton = () => screen.getByRole('button', { name: /^Atmosphere:/ })
const sheet = () => screen.getByRole('dialog', { name: 'Atmosphere' })
const openSheet = () => { fireEvent.click(lineButton()); return sheet() }
const elevation = () => screen.getByTestId('real-elevation').textContent
const dialLine = () => screen.getByTestId('real-dial-line').textContent
const type = (el: HTMLElement, text: string) => {
  fireEvent.change(el, { target: { value: text } })
  fireEvent.blur(el)
}
const stored = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}')

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the station line', () => {
  it('shows the standard atmosphere on a first visit as QNH, ending with the source', () => {
    open()
    expect(lineButton()).toHaveTextContent(/^15\s°C · QNH 1013\shPa · 0\s% · 0\sm · standard$/)
    // I2: what a beginner can read (a weather app, the news) is QNH, so manual entry starts there.
    expect(within(openSheet()).getByRole('button', { name: 'QNH' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the weakest source last and the entered numbers', () => {
    open()
    const s = openSheet()
    type(within(s).getByLabelText('Temperature'), '20')
    expect(lineButton()).toHaveTextContent(/^20\s°C .* · standard$/)
  })

  it('QNH 1013 at 500 m reads as QNH in the line, and a denser air changes the elevation', () => {
    open()
    const before = elevation()
    const s = openSheet()
    type(within(s).getByLabelText('Altitude'), '500')
    fireEvent.click(within(s).getByRole('button', { name: 'QNH' }))
    type(within(s).getByLabelText('Pressure'), '1013')
    expect(lineButton()).toHaveTextContent(/^15\s°C · QNH 1013\shPa · 0\s% · 500\sm · standard$/)
    type(within(s).getByLabelText('Pressure'), '1040')
    expect(elevation()).not.toBe(before)
  })

  it('the same number and altitude give another answer as QNH than as station pressure', () => {
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    type(within(s).getByLabelText('Altitude'), '800')
    type(within(s).getByLabelText('Pressure'), '1013')
    const asStation = elevation()
    fireEvent.click(within(s).getByRole('button', { name: 'QNH' }))
    expect(stored().pressureHPa.value).toBe(1013)
    expect(elevation()).not.toBe(asStation)
  })

  it('the source word follows the four fields in the line, not the latitude', () => {
    open()
    const s = openSheet()
    type(within(s).getByLabelText('Temperature'), '20')
    type(within(s).getByLabelText('Pressure'), '950')
    type(within(s).getByLabelText('Humidity'), '40')
    expect(lineButton()).toHaveTextContent(/ · standard$/)
    type(within(s).getByLabelText('Altitude'), '500')
    expect(lineButton()).toHaveTextContent(/ · manual$/)
    expect(stored().latitudeDeg.source).toBe('standard')
  })

  it('29.92 inHg stores about 1013.2 hPa', () => {
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'inHg' }))
    type(within(s).getByLabelText('Pressure'), '29.5')
    type(within(s).getByLabelText('Pressure'), '29.92')
    expect(stored().pressureHPa.value).toBeCloseTo(1013.2, 1)
    expect(stored().pressureHPa.source).toBe('manual')
    expect(lineButton()).toHaveTextContent('29.92 inHg')
  })

  it('an empty pressure keeps the last value', () => {
    open()
    const s = openSheet()
    type(within(s).getByLabelText('Pressure'), '950')
    type(within(s).getByLabelText('Pressure'), '')
    expect(stored().pressureHPa.value).toBe(950)
    expect(within(s).getByRole('alert')).toBeInTheDocument()
  })

  it('switching Station and QNH keeps a typed number', () => {
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    type(within(s).getByLabelText('Pressure'), '990')
    fireEvent.click(within(s).getByRole('button', { name: 'QNH' }))
    expect(stored().pressureHPa).toEqual({ value: 990, source: 'manual' })
    expect(stored().pressureKind).toBe('qnh')
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    expect(stored().pressureHPa).toEqual({ value: 990, source: 'manual' })
  })

  // I1: a pressure nobody typed only changes its kind; the air under it stays the ISA one for the altitude.
  it('QNH on a standard pressure at 500 m moves nothing: same answer, still standard, QNH 1013', () => {
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    type(within(s).getByLabelText('Altitude'), '500')
    const before = [elevation(), dialLine()]
    expect(lineButton()).toHaveTextContent(/ 955\shPa /)
    fireEvent.click(within(s).getByRole('button', { name: 'QNH' }))
    expect([elevation(), dialLine()]).toEqual(before)
    expect(stored().pressureKind).toBe('qnh')
    expect(stored().pressureHPa.source).toBe('standard')
    expect(lineButton()).toHaveTextContent(/ QNH 1013\shPa .* · 500\sm · standard$/)
    expect(within(s).getByLabelText('Pressure')).toHaveValue('1013.3')
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    expect([elevation(), dialLine()]).toEqual(before)
    expect(stored().pressureHPa.source).toBe('standard')
  })

  it('a typed 1018 switched from Station to QNH keeps its digits and changes the answer at 500 m', () => {
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    type(within(s).getByLabelText('Altitude'), '500')
    type(within(s).getByLabelText('Pressure'), '1018')
    const asStation = dialLine()
    fireEvent.click(within(s).getByRole('button', { name: 'QNH' }))
    expect(stored().pressureHPa).toEqual({ value: 1018, source: 'manual' })
    expect(within(s).getByLabelText('Pressure')).toHaveValue('1018')
    expect(dialLine()).not.toBe(asStation)
  })

  it('an emptied azimuth is stored as null and shows unknown; the line keeps working', () => {
    open()
    const s = openSheet()
    const az = within(s).getByLabelText('Azimuth')
    type(az, '270')
    expect(stored().azimuthDeg).toEqual({ value: 270, source: 'manual' })
    type(az, '')
    expect(stored().azimuthDeg).toBeNull()
    expect(az).toHaveValue('')
    expect(az).toHaveAttribute('placeholder', 'unknown')
    expect(within(s).getAllByText('unknown').length).toBeGreaterThan(0)
    expect(lineButton()).toHaveTextContent(/°C · .* hPa/)
  })

  it('an emptied powder temperature is null again', () => {
    open()
    const s = openSheet()
    type(within(s).getByLabelText('Powder temperature'), '30')
    expect(stored().powderTempC).toEqual({ value: 30, source: 'manual' })
    type(within(s).getByLabelText('Powder temperature'), '')
    expect(stored().powderTempC).toBeNull()
  })

  it('Standard atmosphere resets every field', () => {
    open()
    const s = openSheet()
    type(within(s).getByLabelText('Temperature'), '30')
    type(within(s).getByLabelText('Azimuth'), '90')
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    fireEvent.click(within(s).getByRole('button', { name: 'Standard atmosphere' }))
    expect(stored().tempC).toEqual({ value: 15, source: 'standard' })
    expect(stored().azimuthDeg).toBeNull()
    expect(stored().pressureKind).toBe('qnh')
    expect(lineButton()).toHaveTextContent(/^15\s°C · QNH 1013\shPa · 0\s% · 0\sm · standard$/)
  })

  it('typing the value already shown still makes the field manual; tabbing through does not', () => {
    open()
    const s = openSheet()
    fireEvent.blur(within(s).getByLabelText('Humidity'))
    expect(stored().humidityPct).toBeUndefined()
    type(within(s).getByLabelText('Temperature'), '15.0')
    expect(stored().tempC).toEqual({ value: 15, source: 'manual' })
  })

  it('keeps the focus inside the sheet after Standard atmosphere, already standard or not', () => {
    open()
    const s = openSheet()
    const reset = () => within(s).getByRole('button', { name: 'Standard atmosphere' })
    reset().focus()
    fireEvent.click(reset())
    // jsdom keeps the focus on a button that becomes disabled, a browser drops it: so the button must stay enabled.
    expect(reset()).toBeEnabled()
    expect(s.contains(document.activeElement)).toBe(true)
    type(within(s).getByLabelText('Temperature'), '30')
    reset().focus()
    fireEvent.click(reset())
    expect(stored().tempC.source).toBe('standard')
    expect(reset()).toBeEnabled()
    expect(s.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(reset())
  })

  it('imperial: °F and ft in, SI stored', () => {
    localStorage.setItem('gb.real.display', JSON.stringify({}))
    open('#/real/workbench?p=p7&d=1000&ws=0&u=imperial')
    const s = openSheet()
    type(within(s).getByLabelText('Temperature'), '86')
    type(within(s).getByLabelText('Altitude'), '3281')
    expect(stored().tempC.value).toBeCloseTo(30, 1)
    expect(stored().altitudeM.value).toBeCloseTo(1000, 0)
    expect(lineButton()).toHaveTextContent(/^86\s°F .* 3281\sft · standard$/)
  })

  it('Wind in writes the profile and the bottom bar steps in that unit', () => {
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'km/h' }))
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).windUnit).toBe('km/h')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Wind speed: more' }))
    expect((screen.getByLabelText('Wind speed') as HTMLInputElement).value).toBe('2')
  })

  // M9: the spec's "one setting, 1 m/s by default" for how far the real wind may be from the one set.
  it('sets the wind uncertainty in 0.5 m/s steps from 0.5 to 3, shown in the wind unit; σ 2 widens the columns', () => {
    open('#/real/workbench?p=p7&d=1000&ws=3&wc=9')
    const columns = () => within(screen.getByRole('list', { name: 'Hold for less, the same and more wind' })).getAllByRole('listitem')
    const speeds = () => columns().map((li) => li.querySelector('.real-col-speed')!.textContent)
    const holds = () => columns().map((li) => Number(li.querySelector('.real-col-v')!.textContent!.replace('←', '')))
    expect(speeds()).toEqual(['2\u00a0m/s', '3\u00a0m/s', '4\u00a0m/s'])
    const [narrowLo, , narrowHi] = holds()
    const sigma = within(openSheet()).getByRole('group', { name: 'Wind uncertainty' })
    expect(within(sigma).getByRole('status')).toHaveTextContent('±1 m/s')
    fireEvent.click(within(sigma).getByRole('button', { name: 'Wind uncertainty: more' }))
    fireEvent.click(within(sigma).getByRole('button', { name: 'Wind uncertainty: more' }))
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).windSigmaMs).toBe(2)
    expect(speeds()).toEqual(['1\u00a0m/s', '3\u00a0m/s', '5\u00a0m/s'])
    const [wideLo, , wideHi] = holds()
    expect(wideHi - wideLo).toBeGreaterThan(narrowHi - narrowLo)
    for (let i = 0; i < 4; i++) fireEvent.click(within(sigma).getByRole('button', { name: 'Wind uncertainty: less' }))
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!).windSigmaMs).toBe(0.5)
    expect(within(sigma).getByRole('button', { name: 'Wind uncertainty: less' })).toBeDisabled()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'km/h' }))
    expect(within(sigma).getByRole('status')).toHaveTextContent('±1.8 km/h')
  })

  it('has no Compass action without DeviceOrientationEvent', () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    open()
    expect(within(openSheet()).queryByRole('button', { name: 'Compass' })).not.toBeInTheDocument()
  })

  it('Compass stores one reading as a manual azimuth, rounded', async () => {
    class Ev extends Event {}
    vi.stubGlobal('DeviceOrientationEvent', Ev)
    open()
    const s = openSheet()
    fireEvent.click(within(s).getByRole('button', { name: 'Compass' }))
    await act(async () => {
      const e = new Event('deviceorientationabsolute') as Event & { alpha: number }
      e.alpha = 90.4
      window.dispatchEvent(e)
    })
    expect(stored().azimuthDeg).toEqual({ value: 270, source: 'manual' })
  })
})

describe('a compass reading and the sheet', () => {
  it('closing the sheet drops a reading in progress; reopening shows no old alert', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    open()
    fireEvent.click(within(openSheet()).getByRole('button', { name: 'Compass' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {
      const e = new Event('deviceorientationabsolute') as Event & { alpha: number }
      e.alpha = 90
      window.dispatchEvent(e)
    })
    expect(stored().azimuthDeg ?? null).toBeNull()
    expect(within(openSheet()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'Compass' })).toBeEnabled()
  })
})

describe('readHeading', () => {
  it('iOS: asks permission then reads webkitCompassHeading', async () => {
    const ask = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class extends Event {}, { requestPermission: ask }))
    const p = readHeading()
    await act(async () => { await Promise.resolve() })
    const e = new Event('deviceorientation') as Event & { webkitCompassHeading: number }
    e.webkitCompassHeading = 359.6
    window.dispatchEvent(e)
    expect(await p).toBe(0)
    expect(ask).toHaveBeenCalled()
  })

  it('a refused permission, or no event in 5 s, gives null', async () => {
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class extends Event {}, { requestPermission: () => Promise.resolve('denied') }))
    expect(await readHeading()).toBeNull()
    vi.useFakeTimers()
    vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
    const p = readHeading()
    vi.advanceTimersByTime(5001)
    expect(await p).toBeNull()
    vi.useRealTimers()
  })
})
