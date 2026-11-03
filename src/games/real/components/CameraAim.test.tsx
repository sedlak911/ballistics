import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHONE } from '../../../components/useMedia'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { Dock } from './Dock'

const NOW = Date.now()
const latest = { current: DEFAULT_SETUP }

function Page() {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, distanceM: 600, windMs: 4, windClock: 9, windSet: true })
  useEffect(() => { latest.current = setup })
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <Dock setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch }))} system="metric" windUnit="m/s" now={NOW} />
    </SettingsProvider>
  )
}

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] }
const getUserMedia = vi.fn()
const shotButton = () => screen.getByRole('button', { name: /^Distance \d/ })
const aimButton = () => screen.getByRole('button', { name: 'Aim' })

/** The setting is camera and the phone has the orientation events: Aim opens the overlay. */
async function openOverlay() {
  render(<Page />)
  fireEvent.click(shotButton())
  await act(async () => { fireEvent.click(aimButton()) })
}
const fire = (beta: number, alpha: number) => {
  const e = new Event('deviceorientation')
  Object.assign(e, { alpha, beta, gamma: 0, absolute: true })
  act(() => { window.dispatchEvent(e) })
}
/** One event per 50 ms, so twenty of them are one second. */
const steady = (n = 20, beta = 86, alpha = 86) => {
  for (let i = 0; i < n; i++) {
    fire(beta, alpha)
    act(() => { vi.advanceTimersByTime(50) })
  }
}
const azimuth = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}').azimuthDeg

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem('gb.real.profile', JSON.stringify({ aimMode: 'camera' }))
  window.location.hash = '#/real/workbench'
  track.stop.mockClear()
  getUserMedia.mockReset().mockResolvedValue(stream)
  vi.stubGlobal('DeviceOrientationEvent', class extends Event {})
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('camera aiming', () => {
  it('Aim opens the overlay and asks for the rear camera', async () => {
    await openOverlay()
    expect(screen.getByText('Aim at the target')).toBeInTheDocument()
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(document.querySelector('video')).toHaveAttribute('playsinline')
  })

  it('shows the live Direction and Slope, and Use writes them from the camera reading and stops the track', async () => {
    await openOverlay()
    steady()
    const overlay = screen.getByRole('dialog')
    expect(overlay).toHaveTextContent('Slope')
    expect(overlay).toHaveTextContent('Direction')
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    // The camera looks along the phone's back: beta 86 is 4 degrees below the horizon, alpha 86 a heading of 274.
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth()).toEqual({ value: 274, source: 'manual' })
    expect(track.stop).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(aimButton()).toBeInTheDocument()
  })

  it('the close button stops the track and writes nothing', async () => {
    await openOverlay()
    steady()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    expect(track.stop).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(latest.current.slopeDeg).toBe(0)
  })

  it('Escape stops the track and keeps the panel', async () => {
    await openOverlay()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(track.stop).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
  })

  it('the page becoming hidden stops the track', async () => {
    await openOverlay()
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    hidden.mockRestore()
    expect(track.stop).toHaveBeenCalled()
  })

  it('unmounting stops the track', async () => {
    await openOverlay()
    cleanup()
    expect(track.stop).toHaveBeenCalled()
  })

  it('a stream that arrives after the panel was left is stopped at once', async () => {
    let resolve: (s: typeof stream) => void = () => {}
    getUserMedia.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<Page />)
    fireEvent.click(shotButton())
    await act(async () => { fireEvent.click(aimButton()) })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => { resolve(stream) })
    expect(track.stop).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('without getUserMedia there is no overlay, the note shows and the panel is live', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    await openOverlay()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText("The camera isn't available, so the simple way is used.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use' })).toBeInTheDocument()
  })

  it('a rejected getUserMedia does the same, and Use reads the top edge', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    await openOverlay()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText("The camera isn't available, so the simple way is used.")).toBeInTheDocument()
    // The top edge: an iOS-style heading of 100 and a pitch of -4 from beta -4.
    for (let i = 0; i < 20; i++) {
      const e = new Event('deviceorientation')
      Object.assign(e, { alpha: 0, beta: -4, gamma: 0, absolute: false, webkitCompassHeading: 100 })
      act(() => { window.dispatchEvent(e) })
      act(() => { vi.advanceTimersByTime(50) })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth().value).toBe(100)
  })

  it('after a fallback, a phone that never gives a reading still ends in the failure', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    await openOverlay()
    act(() => { vi.advanceTimersByTime(5100) })
    expect(screen.getByRole('alert')).toHaveTextContent("No reading from the phone's sensors.")
  })

  it('5 s without a sensor reading closes the overlay, stops the track and says so', async () => {
    await openOverlay()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5100) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent("No reading from the phone's sensors.")
    expect(aimButton()).toBeInTheDocument()
  })

  it('a refused orientation permission, with the camera granted, does the same', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: () => Promise.resolve('denied') })
    await openOverlay()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent("No reading from the phone's sensors.")
  })
})
