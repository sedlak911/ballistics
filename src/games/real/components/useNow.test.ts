import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

const origVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
const visibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

afterEach(() => {
  vi.restoreAllMocks()
  if (origVisibility) Object.defineProperty(document, 'visibilityState', origVisibility)
  else delete (document as unknown as Record<string, unknown>).visibilityState
})

describe('useNow', () => {
  it('re-reads the clock when the page becomes visible, not when it is hidden (M7)', () => {
    let clock = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const { result } = renderHook(() => useNow(null))
    expect(result.current).toBe(1_000_000)
    clock += 5 * 60 * 60_000 // a phone woken after five hours, before the minute tick
    visibility('hidden')
    expect(result.current).toBe(1_000_000)
    visibility('visible')
    expect(result.current).toBe(clock)
  })

  it('stops listening when unmounted', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useNow(null))
    unmount()
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('still ticks on its interval and re-reads when the key changes', () => {
    vi.useFakeTimers()
    try {
      let clock = 0
      vi.spyOn(Date, 'now').mockImplementation(() => clock)
      const { result, rerender } = renderHook(({ k }) => useNow(k, 1000), { initialProps: { k: 1 } })
      clock = 1000
      act(() => { vi.advanceTimersByTime(1000) })
      expect(result.current).toBe(1000)
      clock = 1500
      rerender({ k: 2 })
      expect(result.current).toBe(1500)
    } finally {
      vi.useRealTimers()
    }
  })
})
