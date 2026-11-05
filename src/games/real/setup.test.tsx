import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoute } from '../../router'
import { SettingsProvider } from '../../settings/SettingsContext'
import type { Display } from '../../settings/url'
import { writeLinkOverrides } from './profiles'
import { DEFAULT_SETUP, readRealSetup, useRealSetup, writeRealSetup } from './setup'

const q = (s: string) => new URLSearchParams(s)

describe('readRealSetup', () => {
  it('gives the defaults for an empty link', () => {
    expect(readRealSetup(q(''))).toEqual(DEFAULT_SETUP)
    expect(DEFAULT_SETUP).toEqual({
      presetId: 'p7', roundId: null, scopeId: null, customRifleId: null, rifleSet: false, distanceM: 300, slopeDeg: 0, windMs: 0, windSet: false, windClock: 9,
      zonesOn: false, windMid: null, windFar: null, targetCm: 50,
    })
  })

  it('fixes the target at 50 cm: a link\'s tg is ignored', () => {
    expect(readRealSetup(new URLSearchParams('tg=30&d=500'))).toMatchObject({ targetCm: 50, distanceM: 500 })
  })

  it('opens P7 at 300 m for an unknown preset and a garbage distance', () => {
    const s = readRealSetup(q('p=zzz&d=abc'))
    expect(s.presetId).toBe('p7')
    expect(s.distanceM).toBe(300)
  })

  it('names a rifle by p, cr or cf', () => {
    expect(readRealSetup(q('d=600')).rifleSet).toBe(false)
    expect(readRealSetup(q('p=p3')).rifleSet).toBe(true)
    expect(readRealSetup(q('cr=u-r1')).rifleSet).toBe(true)
    expect(readRealSetup(q('cf=u-f1')).rifleSet).toBe(true)
    expect(readRealSetup(q('p=zzz'))).toMatchObject({ rifleSet: true, presetId: 'p7' })
  })

  it('clamps out-of-range numbers', () => {
    const s = readRealSetup(q('d=99999&sl=-90&ws=30&wc=15'))
    expect(s).toMatchObject({ distanceM: 2500, slopeDeg: -45, windMs: 25, windClock: 12 })
    expect(readRealSetup(q('d=1&ws=-3&wc=0'))).toMatchObject({ distanceM: 25, windMs: 0, windClock: 1 })
  })

  // The bar steps the wind in the unit the owner reads (0.5 m/s, 2 km/h, 1 mph, 1 kn), so the link keeps any of them.
  it('keeps the wind to a thousandth of a m/s, so 2 km/h, 1 mph and 1 kn survive the link', () => {
    expect(readRealSetup(q('ws=7.3')).windMs).toBe(7.3)
    expect(readRealSetup(q(`ws=${2 / 3.6}`)).windMs).toBe(0.556)
    expect(readRealSetup(q('ws=0.44704')).windMs).toBe(0.447)
  })

  it('round-trips through the link with the display keys', () => {
    const s = { ...DEFAULT_SETUP, rifleSet: true, presetId: 'p3', distanceM: 800, slopeDeg: -10, windMs: 4.5, windSet: true, windClock: 3 }
    const p = writeRealSetup(s, { lang: 'cs', system: 'metric', angle: 'moa' })
    expect(readRealSetup(p)).toEqual(s)
    expect(p.get('a')).toBe('moa')
    expect(p.has('l')).toBe(false)
  })
})

const DISPLAY: Display = { lang: 'en', system: 'metric', angle: 'mil' }

describe('wind zones in the link', () => {
  it('a 0.1.7 link is one wind', () => {
    expect(readRealSetup(q('p=p7&d=600&ws=4&wc=9'))).toMatchObject({ zonesOn: false, windMid: null, windFar: null })
  })

  it('zones round-trip', () => {
    const s = { ...DEFAULT_SETUP, distanceM: 600, windSet: true, zonesOn: true, windFar: { ms: 2.5, clock: 3 } }
    const p = writeRealSetup(s, DISPLAY)
    expect(p.get('zn')).toBe('1')
    expect(p.get('zf')).toBe('2.5,3')
    expect(p.has('zm')).toBe(false)
    expect(readRealSetup(p)).toEqual(s)
  })

  it('garbage zones read as null', () => {
    expect(readRealSetup(q('zn=yes&zm=abc&zf=4,13'))).toMatchObject({ zonesOn: false, windMid: null, windFar: null })
    for (const bad of ['4', '4,3,2', ',3', '4,2.5', 'Infinity,3']) expect(readRealSetup(q(`zf=${bad}`)).windFar).toBeNull()
  })

  it('clamps a far wind speed', () => {
    expect(readRealSetup(q('zf=99,3')).windFar).toEqual({ ms: 25, clock: 3 })
  })

  it('keeps a zone wind without zn', () => {
    expect(readRealSetup(q('zm=3,6'))).toMatchObject({ zonesOn: false, windMid: { ms: 3, clock: 6 } })
  })
})

describe('custom ids in the link', () => {
  it('writes cr, cs and cf and never o= with a custom round', () => {
    const s = { ...DEFAULT_SETUP, rifleSet: true, roundId: 'u-r1', scopeId: 'u-s1', customRifleId: 'u-f1' }
    const p = writeRealSetup(s, DISPLAY, { twistIn: 11 })
    expect([p.get('cr'), p.get('cs'), p.get('cf')]).toEqual(['u-r1', 'u-s1', 'u-f1'])
    expect(p.has('o')).toBe(false)
    expect(readRealSetup(p)).toEqual(s)
    // A built-in round keeps p= and o=, and writes no ids; a custom scope on it goes along.
    const b = writeRealSetup({ ...DEFAULT_SETUP, rifleSet: true, scopeId: 'u-s1' }, DISPLAY, { twistIn: 11 })
    expect(b.get('p')).toBe('p7')
    expect(b.has('o')).toBe(true)
    expect([b.has('cr'), b.get('cs'), b.has('cf')]).toEqual([false, 'u-s1', false])
    expect(writeRealSetup({ ...DEFAULT_SETUP, rifleSet: true, windSet: true }, DISPLAY).toString()).toBe('p=p7&d=300&sl=0&ws=0&wc=9&u=metric&a=mil')
    expect(writeRealSetup({ ...DEFAULT_SETUP, windSet: true }, DISPLAY).toString()).toBe('d=300&sl=0&ws=0&wc=9&u=metric&a=mil')
    expect(writeRealSetup(DEFAULT_SETUP, DISPLAY).has('tg')).toBe(false)
  })

  it('never writes where the wind blows from or its source, with a wind memory in storage', () => {
    localStorage.setItem('gb.real.wind', JSON.stringify({ fromDeg: 180, hour: 9, speedMs: 2, source: 'forecast' }))
    const p = writeRealSetup({ ...DEFAULT_SETUP, rifleSet: true, windSet: true, windMs: 2, windClock: 9 }, DISPLAY)
    expect([...p.keys()].sort()).toEqual(['a', 'd', 'p', 'sl', 'u', 'wc', 'ws'])
    const z = writeRealSetup({ ...DEFAULT_SETUP, rifleSet: true, windSet: true, zonesOn: true, windMid: { ms: 3, clock: 6 }, windFar: { ms: 2, clock: 3 } }, DISPLAY)
    expect([...z.keys()].sort()).toEqual(['a', 'd', 'p', 'sl', 'u', 'wc', 'ws', 'zf', 'zm', 'zn'])
    expect(p.toString()).not.toMatch(/180|forecast|fromDeg|source/)
    localStorage.clear()
  })

  it('reads a malformed id as none', () => {
    expect(readRealSetup(q('cr=<b>')).roundId).toBeNull()
    expect(readRealSetup(q('cr=p7&cs=u-&cf=custom'))).toMatchObject({ roundId: null, scopeId: null, customRifleId: null })
    expect(readRealSetup(q(`cr=u-${'a'.repeat(65)}`)).roundId).toBeNull()
    expect(readRealSetup(q(`cr=u-${'a'.repeat(64)}`)).roundId).toBe(`u-${'a'.repeat(64)}`)
    expect(readRealSetup(q('cr=u-0a1B-2c3d')).roundId).toBe('u-0a1B-2c3d')
  })
})

/** The page's route and settings around a hook, from `window.location.hash`. */
function Wrapper({ children }: { children: ReactNode }) {
  const [route, navigate] = useRoute()
  return <SettingsProvider route={route} navigate={navigate}>{children}</SettingsProvider>
}

describe('the wind not set', () => {
  it('counts the wind as not set without ws', () => {
    expect(readRealSetup(q('?p=p7&d=300'))).toMatchObject({ windSet: false, windMs: 0 })
  })

  it('counts any ws as set, 0 included', () => {
    expect(readRealSetup(q('ws=0')).windSet).toBe(true)
    expect(readRealSetup(q('ws=abc')).windSet).toBe(false)
  })

  it('writes ws and wc only once the wind is set', () => {
    const off = writeRealSetup({ ...DEFAULT_SETUP, windSet: false }, DISPLAY)
    expect([off.has('ws'), off.has('wc')]).toEqual([false, false])
    const on = writeRealSetup({ ...DEFAULT_SETUP, windSet: true }, DISPLAY)
    expect([on.get('ws'), on.get('wc')]).toEqual(['0', '9'])
  })
})

describe('useRealSetup', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('sets the wind with the steppers, the field or the clock', () => {
    window.location.hash = '#/real/workbench?p=p7&d=300'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].windSet).toBe(false)
    act(() => result.current[1]({ windClock: 3 }))
    const p = new URLSearchParams(window.location.hash.split('?')[1])
    expect([p.get('ws'), p.get('wc')]).toEqual(['0', '3'])
    expect(result.current[0].windSet).toBe(true)
  })

  it('counts the edit of a far zone as setting the wind: the near wind then counts at its shown value', () => {
    window.location.hash = '#/real/workbench?p=p7&d=1500&zn=1'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].windSet).toBe(false)
    act(() => result.current[1]({ windFar: { ms: 2, clock: 3 }, windSet: true }))
    const p = new URLSearchParams(window.location.hash.split('?')[1])
    expect([p.get('ws'), p.get('wc'), p.get('zf')]).toEqual(['0', '9', '2,3'])
    expect(result.current[0]).toMatchObject({ windSet: true, windFar: { ms: 2, clock: 3 } })
  })

  it('keeps today\'s links and stored setups set', () => {
    window.location.hash = '#/real/workbench'
    localStorage.setItem('gb.real.setup', 'p=p7&d=300&ws=2&wc=9')
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0]).toMatchObject({ windSet: true, windMs: 2 })
  })

  const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1])

  it('a first visit names no rifle', () => {
    window.location.hash = '#/real/workbench'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].rifleSet).toBe(false)
    expect(hashParams().has('p')).toBe(false)
    expect(new URLSearchParams(localStorage.getItem('gb.real.setup') ?? '').has('p')).toBe(false)
  })

  it('an edit before a pick keeps nothing chosen', () => {
    window.location.hash = '#/real/workbench'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    act(() => result.current[1]({ distanceM: 500 }))
    expect(result.current[0].rifleSet).toBe(false)
    expect(hashParams().get('d')).toBe('500')
    expect(hashParams().has('p')).toBe(false)
  })

  it('a pick names the rifle', () => {
    window.location.hash = '#/real/workbench'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    act(() => result.current[1]({ presetId: 'p3', roundId: null, customRifleId: null, scopeId: null }))
    expect(result.current[0].rifleSet).toBe(true)
    expect(hashParams().get('p')).toBe('p3')
    expect(new URLSearchParams(localStorage.getItem('gb.real.setup') ?? '').get('p')).toBe('p3')
  })

  it('a link without a rifle opens as today on a device with one stored', () => {
    localStorage.setItem('gb.real.setup', 'p=p3&d=300')
    window.location.hash = '#/real/workbench?d=600'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0]).toMatchObject({ rifleSet: true, presetId: 'p7' })
    expect(hashParams().get('p')).toBe('p7')
  })

  it('a link without a rifle on a fresh device names none', () => {
    window.location.hash = '#/real/workbench?d=600'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].rifleSet).toBe(false)
  })

  it('survives blocked storage: nothing chosen, and a pick still reaches the URL', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    window.location.hash = '#/real/workbench'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].rifleSet).toBe(false)
    act(() => result.current[1]({ presetId: 'p3' }))
    expect(hashParams().get('p')).toBe('p3')
    vi.restoreAllMocks()
  })

  it('a corrupt stored setup names none', () => {
    localStorage.setItem('gb.real.setup', '%%%&&&')
    window.location.hash = '#/real/workbench'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].rifleSet).toBe(false)
  })

  it('ignores o= while a custom round is selected', () => {
    window.location.hash = `#/real/workbench?p=p7&cr=u-r1&d=500&o=${writeLinkOverrides({ twistIn: 11, zeroM: 300 })}`
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    const [setup, , po, fromUrl] = result.current
    expect(setup).toMatchObject({ presetId: 'p7', roundId: 'u-r1', distanceM: 500 })
    expect(fromUrl).toBe(true)
    expect(po.fromLink).toBe(false)
    expect(po.own).toBeUndefined()
    expect(po.linkKeys.size).toBe(0)
    expect(localStorage.getItem('gb.real.profiles')).toBeNull()
    // The share link drops it too.
    expect(new URLSearchParams(window.location.hash.split('?')[1]).has('o')).toBe(false)
    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('cr')).toBe('u-r1')
  })
})
