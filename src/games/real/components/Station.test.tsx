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
    fireEvent.click(within(s).getByRole('button', { name: 'Station' }))
    fireEvent.click(within(s).getByRole('button', { name: 'Standard atmosphere' }))
    expect(stored().tempC).toEqual({ value: 15, source: 'standard' })
    expect(stored().pressureKind).toBe('qnh')
    expect(lineButton()).toHaveTextContent(/^15\s°C · QNH 1013\shPa · 0\s% · 0\sm · standard$/)
  })

  it('Standard atmosphere keeps the shooting direction and the height above ground', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({
      v: 1,
      azimuthDeg: { value: 270, source: 'manual' },
      heightAboveGroundM: { value: 20, source: 'manual' },
    }))
    open()
    const s = openSheet()
    type(within(s).getByLabelText('Temperature'), '30')
    fireEvent.click(within(s).getByRole('button', { name: 'Standard atmosphere' }))
    expect(stored().tempC).toEqual({ value: 15, source: 'standard' })
    expect(stored().azimuthDeg).toEqual({ value: 270, source: 'manual' })
    expect(stored().heightAboveGroundM).toEqual({ value: 20, source: 'manual' })
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

  it('has no azimuth, compass, wind unit or wind uncertainty; they live in the bar and the settings', () => {
    open()
    const s = openSheet()
    for (const name of ['Azimuth', 'Wind uncertainty']) expect(within(s).queryByLabelText(name)).not.toBeInTheDocument()
    for (const name of ['Compass', 'km/h']) expect(within(s).queryByRole('button', { name })).not.toBeInTheDocument()
    expect(within(s).queryByText('Wind in')).not.toBeInTheDocument()
    expect(within(s).queryByRole('group', { name: 'Wind uncertainty' })).not.toBeInTheDocument()
  })

  it('Height above ground is 1 m as standard, stores a typed value as manual and explains itself', () => {
    open()
    const s = openSheet()
    const h = within(s).getByLabelText('Height above ground')
    expect(h).toHaveValue('1')
    expect(within(s).getByText('Where you shoot from: about 1 m lying prone, more from a building. It converts the forecast wind from 10 m to your height.')).toBeInTheDocument()
    type(h, '15')
    expect(stored().heightAboveGroundM).toEqual({ value: 15, source: 'manual' })
  })

  it('imperial: the height is shown and typed in ft, SI stored', () => {
    localStorage.setItem('gb.real.display', JSON.stringify({}))
    open('#/real/workbench?p=p7&d=1000&ws=0&u=imperial')
    const s = openSheet()
    const h = within(s).getByLabelText('Height above ground')
    expect(h).toHaveValue('3')
    type(h, '30')
    expect(stored().heightAboveGroundM.value).toBeCloseTo(9.144, 2)
    expect(h).toHaveValue('30')
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
