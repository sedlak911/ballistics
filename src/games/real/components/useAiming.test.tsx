import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIM_TIMEOUT_MS, useAiming, type AimMode } from './useAiming'

interface Angles { alpha?: number | null; beta?: number | null; gamma?: number | null; webkitCompassHeading?: number }

function fire(a: Angles, type = 'deviceorientation') {
  const e = new Event(type)
  Object.assign(e, { alpha: 0, beta: 0, gamma: 0, absolute: false }, a)
  act(() => { window.dispatchEvent(e) })
}
/** An iOS-style event: the heading is what the test says. */
const heading = (h: number, beta: number) => fire({ webkitCompassHeading: h, beta })

/** One event per 50 ms, so twenty-one of them span one second. */
function stream(headings: number[], betas: number[]) {
  for (let i = 0; i < headings.length; i++) {
    heading(headings[i], betas[i % betas.length])
    act(() => { vi.advanceTimersByTime(50) })
  }
}

const original = (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  ;(window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent = original
})

const live = (mode: AimMode = 'simple') => {
  const hook = renderHook(({ m }: { m: AimMode }) => useAiming(m), { initialProps: { m: mode } })
  act(() => { hook.result.current.start() })
  return hook
}

describe('useAiming', () => {
  it('asks for the permission synchronously inside start()', () => {
    const requestPermission = vi.fn(() => new Promise<'granted'>(() => {}))
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
    const { result } = renderHook(() => useAiming('simple'))
    let calledBeforeReturn = false
    act(() => {
      result.current.start()
      calledBeforeReturn = requestPermission.mock.calls.length === 1
    })
    expect(calledBeforeReturn).toBe(true)
    expect(result.current.state.status).toBe('asking')
  })

  it('a requestPermission that throws synchronously ends in failed', () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: () => { throw new Error('nope') } })
    const { result } = renderHook(() => useAiming('simple'))
    act(() => { result.current.start() })
    expect(result.current.state.status).toBe('failed')
  })

  it('goes live after a granted permission', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: () => Promise.resolve('granted') })
    const { result } = renderHook(() => useAiming('simple'))
    await act(async () => { result.current.start() })
    expect(result.current.state.status).toBe('live')
  })

  it('fails when the permission is refused', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: () => Promise.resolve('denied') })
    const { result } = renderHook(() => useAiming('simple'))
    await act(async () => { result.current.start() })
    expect(result.current.state.status).toBe('failed')
  })

  it('takes the mean heading and slope of a steady second', () => {
    const { result } = live()
    stream(Array.from({ length: 22 }, (_, i) => 273.5 + (i % 2)), [-4.3, -4.1, -3.9, -3.8])
    expect(result.current.take()).toEqual({ headingDeg: 274, slopeDeg: -4 })
    expect(result.current.state.status).toBe('live')
  })

  it('does not lock while the heading spreads 20 degrees', () => {
    const { result } = live()
    stream(Array.from({ length: 40 }, (_, i) => 260 + i), [0])
    expect(result.current.take()).toBeNull()
  })

  it('doesn\'t lock while moving: alternating pitch gives no lock', () => {
    const { result } = live()
    stream(Array.from({ length: 40 }, () => 90), [-4, 4])
    expect(result.current.take()).toBeNull()
  })

  it('does not lock with too few samples', () => {
    const { result } = live()
    // Over a second, but fewer than MIN_SAMPLES in it.
    for (let i = 0; i < 4; i++) {
      heading(90, 0)
      act(() => { vi.advanceTimersByTime(334) })
    }
    expect(result.current.take()).toBeNull()
  })

  it('averages across north', () => {
    const { result } = live()
    stream(Array.from({ length: 22 }, (_, i) => [358, 359, 0, 1, 2][i % 5]), [0])
    expect(result.current.take()).toEqual({ headingDeg: 0, slopeDeg: 0 })
  })

  it('clamps the slope to the bounds in simple mode', () => {
    const { result } = live('simple')
    stream(Array.from({ length: 22 }, () => 90), [70])
    expect(result.current.take()).toEqual({ headingDeg: 90, slopeDeg: 45 })
  })

  it('computes the reading with the mode current at read time', () => {
    const { result, rerender } = live('camera')
    // upright phone, iOS heading 274: the camera looks at 274, level
    for (let i = 0; i < 22; i++) {
      fire({ webkitCompassHeading: 274, alpha: 0, beta: 90, gamma: 0 })
      act(() => { vi.advanceTimersByTime(50) })
    }
    expect(result.current.take()).toEqual({ headingDeg: 274, slopeDeg: 0 })
    // A lock made in the other mode is dropped, and the next steady second locks in the new one.
    rerender({ m: 'simple' })
    expect(result.current.take()).toBeNull()
    // The old samples are gone too: one event gives no lock, a full steady second does.
    fire({ webkitCompassHeading: 274, alpha: 0, beta: 90, gamma: 0 })
    act(() => { vi.advanceTimersByTime(50) })
    const one = result.current.state
    if (one.status !== 'live') throw new Error('not live')
    expect(one.locked).toBeNull()
    for (let i = 0; i < 22; i++) {
      fire({ webkitCompassHeading: 274, alpha: 0, beta: 90, gamma: 0 })
      act(() => { vi.advanceTimersByTime(50) })
    }
    expect(result.current.take()).toEqual({ headingDeg: 274, slopeDeg: 45 })
  })

  it('reports the latest reading and a steadiness below 1 until it locks', () => {
    const { result } = live()
    stream(Array.from({ length: 19 }, () => 100), [2])
    const s = result.current.state
    if (s.status !== 'live') throw new Error('not live')
    expect(s.reading).toEqual({ headingDeg: 100, pitchDeg: 2 })
    expect(s.steady).toBeGreaterThan(0.8)
    expect(s.steady).toBeLessThan(1)
    expect(s.locked).toBeNull()
  })

  it('has no steadiness while the phone is moving', () => {
    const { result } = live()
    stream(Array.from({ length: 22 }, (_, i) => 100 + i * 3), [0])
    const s = result.current.state
    if (s.status !== 'live') throw new Error('not live')
    expect(s.steady).toBeLessThan(0.3)
  })

  it('fails when only null angles arrive for 5 s', () => {
    const { result } = live()
    for (let t = 0; t < AIM_TIMEOUT_MS; t += 500) {
      fire({ alpha: null, beta: null, gamma: null })
      act(() => { vi.advanceTimersByTime(500) })
    }
    expect(result.current.state.status).toBe('failed')
  })

  it('does not time out once a reading has arrived', () => {
    const { result } = live()
    heading(90, 0)
    act(() => { vi.advanceTimersByTime(AIM_TIMEOUT_MS + 1000) })
    expect(result.current.state.status).toBe('live')
  })

  it('take() is null when not live', () => {
    const { result } = renderHook(() => useAiming('simple'))
    expect(result.current.take()).toBeNull()
  })

  it('ignores events after stop()', () => {
    const { result } = live()
    heading(90, 0)
    act(() => { result.current.stop() })
    expect(result.current.state).toEqual({ status: 'idle' })
    heading(120, 5)
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(result.current.take()).toBeNull()
  })

  it('removes both listeners on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = live()
    unmount()
    const names = spy.mock.calls.map((c) => c[0])
    expect(names).toContain('deviceorientation')
    expect(names).toContain('deviceorientationabsolute')
  })

  it('reads the absolute event on Android', () => {
    const { result } = live()
    for (let i = 0; i < 22; i++) {
      fire({ alpha: 86, beta: 5, gamma: 0 }, 'deviceorientationabsolute')
      act(() => { vi.advanceTimersByTime(50) })
    }
    expect(result.current.take()).toEqual({ headingDeg: 274, slopeDeg: 5 })
  })

  it('re-arms the no-reading timeout when the mode changes mid-aim', () => {
    const hook = live('camera')
    act(() => { vi.advanceTimersByTime(AIM_TIMEOUT_MS - 1000) })
    hook.rerender({ m: 'simple' })
    act(() => { vi.advanceTimersByTime(AIM_TIMEOUT_MS - 500) })
    expect(hook.result.current.state.status).toBe('live')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(hook.result.current.state.status).toBe('failed')
  })

  it('locks on a steady second: the state has the mean, and take() returns it', () => {
    const { result } = live()
    stream(Array.from({ length: 22 }, (_, i) => 273.5 + (i % 2)), [-4.3, -4.1, -3.9, -3.8])
    const s = result.current.state
    if (s.status !== 'live') throw new Error('not live')
    expect(s.locked).toEqual({ headingDeg: 274, slopeDeg: -4 })
    expect(s.steady).toBe(1)
    expect(result.current.take()).toEqual(s.locked)
  })

  it.each([16, 50])('locks when the ring is full, not on the first steady samples (%i ms apart)', (gap) => {
    const { result } = live()
    const feed = (ms: number) => {
      for (let t = 0; t < ms; t += gap) {
        heading(90, 3)
        act(() => { vi.advanceTimersByTime(gap) })
      }
    }
    feed(100)
    expect(result.current.take()).toBeNull()
    const early = result.current.state
    if (early.status !== 'live') throw new Error('not live')
    expect(early.steady).toBeLessThan(0.3)
    feed(800)
    expect(result.current.take()).toBeNull()
    feed(200)
    expect(result.current.take()).toEqual({ headingDeg: 90, slopeDeg: 3 })
    const s = result.current.state
    if (s.status !== 'live') throw new Error('not live')
    expect(s.steady).toBe(1)
  })

  it('one jittery sample doesn\'t unlock', () => {
    const { result } = live()
    const feed = (n: number, h = 90, b = 3, gap = 16) => {
      for (let i = 0; i < n; i++) { heading(h, b); act(() => { vi.advanceTimersByTime(gap) }) }
    }
    feed(70)
    expect(result.current.take()).toEqual({ headingDeg: 90, slopeDeg: 3 })
    feed(1, 100, 13)
    feed(60)
    const s = result.current.state
    if (s.status !== 'live') throw new Error('not live')
    expect(s.locked).toEqual({ headingDeg: 90, slopeDeg: 3 })
    expect(s.steady).toBe(1)
  })

  it('a real move unlocks, and a steady second at the new place relocks there', () => {
    const { result } = live()
    const feed = (n: number, h: number, b: number) => {
      for (let i = 0; i < n; i++) { heading(h, b); act(() => { vi.advanceTimersByTime(16) }) }
    }
    feed(70, 90, 3)
    expect(result.current.take()).toEqual({ headingDeg: 90, slopeDeg: 3 })
    feed(30, 90, 9)
    expect(result.current.take()).toBeNull()
    feed(20, 90, 9)
    expect(result.current.take()).toBeNull()
    feed(40, 90, 9)
    expect(result.current.take()).toEqual({ headingDeg: 90, slopeDeg: 9 })
  })

  it('unlocks by heading across north: a real move does, jitter between 358 and 2 does not', () => {
    const { result } = live()
    const feed = (n: number, h: (i: number) => number) => {
      for (let i = 0; i < n; i++) { heading(h(i), 0); act(() => { vi.advanceTimersByTime(16) }) }
    }
    feed(70, () => 358)
    expect(result.current.take()).toEqual({ headingDeg: 358, slopeDeg: 0 })
    feed(60, (i) => (i % 2 ? 2 : 358))
    expect(result.current.take()).toEqual({ headingDeg: 358, slopeDeg: 0 })
    feed(30, () => 10)
    expect(result.current.take()).toBeNull()
  })
})
