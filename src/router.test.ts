import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHash, parseHash, useRoute } from './router'
import { routeHref } from './routeHref'

describe('parseHash', () => {
  it('reads game, page and params', () => {
    const r = parseHash('#/gzw/workbench?w=m700')
    expect(r.game).toBe('gzw')
    expect(r.page).toBe('workbench')
    expect(r.params.get('w')).toBe('m700')
  })

  it('sends links to the old pages to the bench, keeping their setup', () => {
    for (const page of ['armor', 'sheet', 'ranging', 'profile', 'regions']) {
      const r = parseHash(`#/gzw/${page}?w=m700`)
      expect(r.page).toBe('workbench')
      expect(r.params.get('w')).toBe('m700')
    }
  })

  it('falls back to the REAL workbench for empty or unknown hashes', () => {
    expect(parseHash('')).toMatchObject({ game: 'real', page: 'workbench' })
    expect(parseHash('#/nope/zzz')).toMatchObject({ game: 'real', page: 'workbench' })
  })

  it('keeps known but unavailable games so the app can say "coming soon"', () => {
    expect(parseHash('#/wardogs/workbench').game).toBe('wardogs')
  })
})

describe('buildHash', () => {
  it('round-trips a hash', () => {
    const h = '#/gzw/workbench?w=m700&z=200'
    expect(buildHash(parseHash(h))).toBe(h)
  })

  it('omits an empty query', () => {
    expect(buildHash({ game: 'gzw', page: 'workbench', params: new URLSearchParams() })).toBe('#/gzw/workbench')
  })
})

describe('useRoute: the URL write', () => {
  const real = window.history.replaceState.bind(window.history)
  const mount = () => renderHook(() => useRoute()).result
  const go = (r: ReturnType<typeof mount>, patch: Parameters<ReturnType<typeof useRoute>[1]>[0]) => act(() => r.current[1](patch))
  const step = (r: ReturnType<typeof mount>, d: number) => go(r, { params: new URLSearchParams(`d=${d}`) })
  const securityError = () => new DOMException('Attempt to use history.replaceState() more than 100 times per 10 seconds', 'SecurityError')

  beforeEach(() => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '#/real/workbench')
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('a param change replaces the history entry at once; a page change adds one', () => {
    const r = mount()
    const before = window.history.length
    step(r, 310)
    expect(window.location.hash).toBe('#/real/workbench?d=310')
    expect(window.history.length).toBe(before)
    go(r, { game: 'gzw', params: new URLSearchParams('w=m700') })
    expect(window.location.hash).toBe('#/gzw/workbench?w=m700')
    expect(window.history.length).toBe(before + 1)
    expect(r.current[0]).toMatchObject({ game: 'gzw', page: 'workbench' })
  })

  // WebKit throws a SecurityError past 100 replaceState calls in 10 s; thrown out of a state updater it blanked the app.
  it('a write the browser refuses keeps the route, and is tried again until it goes through', () => {
    let refuse = true
    vi.spyOn(window.history, 'replaceState').mockImplementation((...args: Parameters<History['replaceState']>) => {
      if (refuse) throw securityError()
      real(...args)
    })
    const r = mount()
    expect(() => step(r, 310)).not.toThrow()
    expect(r.current[0].params.get('d')).toBe('310')
    expect(window.location.hash).toBe('#/real/workbench')
    refuse = false
    act(() => { vi.advanceTimersByTime(1000) })
    expect(window.location.hash).toBe('#/real/workbench?d=310')
  })

  it('writes at once up to 80 times in 10 s, then once per 150 ms with the newest hash', () => {
    const writes = vi.spyOn(window.history, 'replaceState')
    const r = mount()
    for (let d = 1; d <= 100; d++) step(r, d)
    expect(writes).toHaveBeenCalledTimes(80)
    expect(window.location.hash).toBe('#/real/workbench?d=80')
    expect(r.current[0].params.get('d')).toBe('100')
    act(() => { vi.advanceTimersByTime(149) })
    expect(writes).toHaveBeenCalledTimes(80)
    act(() => { vi.advanceTimersByTime(1) })
    expect(writes).toHaveBeenCalledTimes(81)
    expect(window.location.hash).toBe('#/real/workbench?d=100')
    for (let d = 101; d <= 110; d++) step(r, d)
    act(() => { vi.advanceTimersByTime(150) })
    expect(writes).toHaveBeenCalledTimes(82)
    expect(window.location.hash).toBe('#/real/workbench?d=110')
    // Ten seconds on, the writes are at once again.
    act(() => { vi.advanceTimersByTime(10_000) })
    step(r, 111)
    expect(writes).toHaveBeenCalledTimes(83)
    expect(window.location.hash).toBe('#/real/workbench?d=111')
  })

  it('routeHref carries the newest route while its write waits, and the URL again with no router', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw securityError() })
    const hook = renderHook(() => useRoute())
    act(() => hook.result.current[1]({ params: new URLSearchParams('d=640') }))
    expect(window.location.hash).toBe('#/real/workbench')
    expect(new URL(routeHref()).hash).toBe('#/real/workbench?d=640')
    hook.unmount()
    expect(new URL(routeHref()).hash).toBe('#/real/workbench')
  })

  it('a page change waiting in line still adds its history entry, with the newest params', () => {
    const r = mount()
    for (let d = 1; d <= 80; d++) step(r, d)
    const before = window.history.length
    go(r, { game: 'gzw', params: new URLSearchParams('w=m700') })
    go(r, { params: new URLSearchParams('w=m700&z=200') })
    expect(window.location.hash).toBe('#/real/workbench?d=80')
    act(() => { vi.advanceTimersByTime(150) })
    expect(window.location.hash).toBe('#/gzw/workbench?w=m700&z=200')
    expect(window.history.length).toBe(before + 1)
  })

  it('a hash change from outside (Back, a link) wins over a write still waiting', () => {
    const r = mount()
    for (let d = 1; d <= 90; d++) step(r, d)
    act(() => {
      window.location.hash = '#/gzw/workbench?w=m700'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(r.current[0]).toMatchObject({ game: 'gzw' })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(window.location.hash).toBe('#/gzw/workbench?w=m700')
    expect(r.current[0].params.get('w')).toBe('m700')
  })

  it("its own page change coming back as a hash change keeps a newer write that waits", () => {
    const r = mount()
    go(r, { game: 'gzw', params: new URLSearchParams('w=m700') })
    for (let d = 1; d <= 90; d++) go(r, { params: new URLSearchParams(`w=m700&z=${d}`) })
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(r.current[0].params.get('z')).toBe('90')
    act(() => { vi.advanceTimersByTime(150) })
    expect(window.location.hash).toBe('#/gzw/workbench?w=m700&z=90')
  })
})
