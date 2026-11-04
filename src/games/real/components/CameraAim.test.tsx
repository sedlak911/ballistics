import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
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
const view = () => screen.getByRole('dialog', { name: 'Aim at the target' })

/** The style is camera and the phone has the orientation events: Distance opens the camera view. */
async function openOverlay() {
  render(<Page />)
  await act(async () => { fireEvent.click(shotButton()) })
}
const fire = (beta: number, alpha: number) => {
  const e = new Event('deviceorientation')
  Object.assign(e, { alpha, beta, gamma: 0, absolute: true })
  act(() => { window.dispatchEvent(e) })
}
/** One event per 50 ms, so twenty-two of them are a little over one second. */
const steady = (n = 22, beta = 86, alpha = 86) => {
  for (let i = 0; i < n; i++) {
    fire(beta, alpha)
    act(() => { vi.advanceTimersByTime(50) })
  }
}
const azimuth = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}').azimuthDeg
/** How many orientation listeners are still on (added less removed) from here on. */
const orientationListeners = () => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  add.mockClear()
  remove.mockClear()
  onTestFinished(() => { add.mockRestore(); remove.mockRestore() })
  const count = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c) => String(c[0]).startsWith('deviceorientation')).length
  return () => count(add) - count(remove)
}
const storedProfile = () => JSON.parse(localStorage.getItem('gb.real.profile') ?? '{}')
/** Leaving a view that Distance opened: no view, no panel, the camera and the sensors off, the focus back on Distance. */
const backOnThePage = (on: () => number) => {
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByTestId('real-panel')).toBeNull()
  expect(track.stop).toHaveBeenCalled()
  expect(on()).toBe(0)
  expect(shotButton()).toHaveFocus()
  expect(shotButton()).toHaveAttribute('aria-expanded', 'false')
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem('gb.real.profile', JSON.stringify({ aimMode: 'camera', aimChosen: true }))
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
  it('Distance opens the overlay and asks for the rear camera', async () => {
    await openOverlay()
    expect(view()).toBeInTheDocument()
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(document.querySelector('video')).toHaveAttribute('playsinline')
  })

  it('shows the live Direction and Slope; Use writes them from the camera reading and closes to the page', async () => {
    const on = orientationListeners()
    await openOverlay()
    steady()
    const overlay = screen.getByRole('dialog')
    expect(overlay).toHaveTextContent('Slope')
    expect(overlay).toHaveTextContent('Direction')
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    // The camera looks along the phone's back: beta 86 is 4 degrees below the horizon, alpha 86 a heading of 274.
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth()).toEqual({ value: 274, source: 'manual' })
    backOnThePage(on)
  })

  it('the close button of a view that Distance opened writes nothing and closes to the page', async () => {
    const on = orientationListeners()
    await openOverlay()
    steady()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    backOnThePage(on)
    expect(latest.current.slopeDeg).toBe(0)
    expect(azimuth()).toBeUndefined()
  })

  it('Escape in a view that Distance opened closes to the page', async () => {
    const on = orientationListeners()
    await openOverlay()
    steady()
    fireEvent.keyDown(document, { key: 'Escape' })
    backOnThePage(on)
    expect(latest.current.slopeDeg).toBe(0)
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
    await act(async () => { fireEvent.click(shotButton()) })
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
    for (let i = 0; i < 22; i++) {
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

describe('the camera view is the shot screen', () => {
  /** A steady second read by the top edge (the simple way): an iOS-style heading of 100 and a pitch of -4. */
  const steadyTopEdge = () => {
    for (let i = 0; i < 22; i++) {
      const e = new Event('deviceorientation')
      Object.assign(e, { alpha: 0, beta: -4, gamma: 0, absolute: false, webkitCompassHeading: 100 })
      act(() => { window.dispatchEvent(e) })
      act(() => { vi.advanceTimersByTime(50) })
    }
  }

  it('in the camera style, a Distance tap asks for the camera in the tap and shows the view (Zaměř na cíl)', async () => {
    localStorage.setItem('gb.display', JSON.stringify({ lang: 'cs' }))
    render(<Page />)
    const distance = screen.getByRole('button', { name: /^Vzdálenost \d/ })
    fireEvent.click(distance)
    // Asked in the tap itself: iOS shows the prompt only inside a gesture.
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    await act(async () => {})
    expect(screen.getByRole('dialog', { name: 'Zaměř na cíl' })).toBeInTheDocument()
    expect(distance).toHaveAttribute('aria-expanded', 'true')
  })

  it('in the simple style, Distance opens the shot panel without the camera', () => {
    localStorage.setItem('gb.real.profile', JSON.stringify({ aimMode: 'simple', aimChosen: true }))
    render(<Page />)
    fireEvent.click(shotButton())
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
    expect(aimButton()).toBeInTheDocument()
  })

  it('with the camera refused, the panel aims the simple way; a second Distance tap closes it and leaves nothing on', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    const on = orientationListeners()
    render(<Page />)
    await act(async () => { fireEvent.click(shotButton()) })
    expect(screen.queryByRole('dialog')).toBeNull()
    const panel = screen.getByTestId('real-panel')
    expect(within(panel).getByText("The camera isn't available, so the simple way is used.")).toBeInTheDocument()
    expect(within(panel).getByText('Hold still')).toBeInTheDocument()
    expect(on()).toBeGreaterThan(0)
    await act(async () => { fireEvent.click(shotButton()) })
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(shotButton()).toHaveAttribute('aria-expanded', 'false')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(on()).toBe(0)
  })

  it('a second Distance tap with the view up closes everything and stops the tracks and the listeners', async () => {
    const on = orientationListeners()
    await openOverlay()
    steady(4)
    await act(async () => { fireEvent.click(shotButton()) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    expect(on()).toBe(0)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it("an arrow key in the view's distance field sets the distance at once; ✕ keeps it and writes no direction", async () => {
    await openOverlay()
    steady()
    // The short word shows; the field keeps the full one as its name.
    expect(within(view()).getByText('Dist.')).toBeInTheDocument()
    fireEvent.keyDown(within(view()).getByRole('textbox', { name: 'Distance' }), { key: 'ArrowRight' })
    expect(latest.current.distanceM).toBe(610)
    fireEvent.click(within(view()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(latest.current.distanceM).toBe(610)
    expect(latest.current.slopeDeg).toBe(0)
    expect(azimuth()).toBeUndefined()
  })

  it("a tap on Direction closes the view, stops the camera and the sensors, and focuses the panel's direction field", async () => {
    const on = orientationListeners()
    await openOverlay()
    steady()
    fireEvent.click(within(view()).getByRole('button', { name: /^Direction/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    expect(on()).toBe(0)
    const direction = within(screen.getByTestId('real-panel')).getByLabelText('Direction')
    expect(direction).toBeEnabled()
    expect(direction).toHaveFocus()
    expect(azimuth()).toBeUndefined()
  })

  it("a tap on Slope focuses the panel's slope field", async () => {
    await openOverlay()
    steady()
    fireEvent.click(within(view()).getByRole('button', { name: /^Slope/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Slope')).toHaveFocus()
    expect(latest.current.slopeDeg).toBe(0)
  })

  it("the view's simple icon stops the camera, keeps the simple aiming live in the panel and chooses simple", async () => {
    await openOverlay()
    fireEvent.click(within(view()).getByRole('button', { name: 'Measure the simple way' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    expect(storedProfile()).toMatchObject({ aimMode: 'simple', aimChosen: true })
    const panel = screen.getByTestId('real-panel')
    expect(within(panel).getByText('Hold still')).toBeInTheDocument()
    // The top edge is read now: Use writes that reading.
    steadyTopEdge()
    fireEvent.click(within(panel).getByRole('button', { name: 'Use' }))
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth().value).toBe(100)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it("the shot panel's lens icon chooses the camera and starts it", async () => {
    localStorage.setItem('gb.real.profile', JSON.stringify({ aimMode: 'simple', aimChosen: true }))
    render(<Page />)
    fireEvent.click(shotButton())
    const lens = within(screen.getByTestId('real-panel')).getByRole('button', { name: 'Measure with the camera' })
    await act(async () => { fireEvent.click(lens) })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(view()).toBeInTheDocument()
    expect(storedProfile()).toMatchObject({ aimMode: 'camera', aimChosen: true })
  })

  it('Use does nothing before the lock; after it, the figures hold the lock and Use writes it and closes', async () => {
    await openOverlay()
    for (let i = 0; i < 22; i++) {
      fire(86, 86 + i * 8)
      act(() => { vi.advanceTimersByTime(50) })
    }
    const use = () => within(view()).getByRole('button', { name: 'Use' })
    expect(use()).toHaveAttribute('aria-disabled', 'true')
    expect(within(view()).getByText('Hold still')).toBeInTheDocument()
    fireEvent.click(use())
    expect(view()).toBeInTheDocument()
    expect(latest.current.slopeDeg).toBe(0)
    expect(azimuth()).toBeUndefined()
    steady()
    expect(within(view()).getByText('Measured')).toBeInTheDocument()
    expect(use()).toHaveAttribute('aria-disabled', 'false')
    fire(86, 88)
    expect(within(view()).getByRole('button', { name: /^Direction/ })).toHaveTextContent('274')
    fireEvent.click(use())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('real-panel')).toBeNull()
    expect(latest.current.slopeDeg).toBe(-4)
    expect(azimuth()).toEqual({ value: 274, source: 'manual' })
  })

  it("✕ in a view that the panel's lens icon opened goes back to the panel, the focus on the lens icon", async () => {
    localStorage.setItem('gb.real.profile', JSON.stringify({ aimMode: 'simple', aimChosen: true }))
    const on = orientationListeners()
    render(<Page />)
    fireEvent.click(shotButton())
    const lens = () => within(screen.getByTestId('real-panel')).getByRole('button', { name: 'Measure with the camera' })
    await act(async () => { fireEvent.click(lens()) })
    steady()
    fireEvent.click(within(view()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()
    expect(on()).toBe(0)
    expect(lens()).toHaveFocus()
    expect(latest.current.slopeDeg).toBe(0)
  })

  it("in the camera style the panel's Aim aims through the camera again, and its view goes back to the panel at Aim", async () => {
    await openOverlay()
    // Typing leaves the view for the panel; Aim there opens the camera once more.
    fireEvent.click(within(view()).getByRole('button', { name: /^Direction/ }))
    await act(async () => { fireEvent.click(aimButton()) })
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    steady()
    fireEvent.click(within(view()).getByRole('button', { name: 'Use' }))
    expect(latest.current.slopeDeg).toBe(-4)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('real-panel')).toBeInTheDocument()
    expect(aimButton()).toHaveFocus()
  })

  it('the lens icon tapped while the camera is still being asked for stops that first stream when it comes', async () => {
    const first = { stop: vi.fn() }
    const second = { stop: vi.fn() }
    let resolveFirst: (s: { getTracks: () => typeof first[] }) => void = () => {}
    getUserMedia
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce({ getTracks: () => [second] })
    render(<Page />)
    fireEvent.click(shotButton())
    const lens = within(screen.getByTestId('real-panel')).getByRole('button', { name: 'Measure with the camera' })
    await act(async () => { fireEvent.click(lens) })
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(view()).toBeInTheDocument()
    await act(async () => { resolveFirst({ getTracks: () => [first] }) })
    expect(first.stop).toHaveBeenCalled()
    expect(second.stop).not.toHaveBeenCalled()
    expect(view()).toBeInTheDocument()
  })
})
