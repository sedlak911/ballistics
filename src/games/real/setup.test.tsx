import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
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
      presetId: 'p7', roundId: null, scopeId: null, customRifleId: null, distanceM: 300, slopeDeg: 0, windMs: 0, windSet: false, windClock: 9, targetCm: 50,
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
    const s = { ...DEFAULT_SETUP, presetId: 'p3', distanceM: 800, slopeDeg: -10, windMs: 4.5, windSet: true, windClock: 3 }
    const p = writeRealSetup(s, { lang: 'cs', system: 'metric', angle: 'moa' })
    expect(readRealSetup(p)).toEqual(s)
    expect(p.get('a')).toBe('moa')
    expect(p.has('l')).toBe(false)
  })
})

const DISPLAY: Display = { lang: 'en', system: 'metric', angle: 'mil' }

describe('custom ids in the link', () => {
  it('writes cr, cs and cf and never o= with a custom round', () => {
    const s = { ...DEFAULT_SETUP, roundId: 'u-r1', scopeId: 'u-s1', customRifleId: 'u-f1' }
    const p = writeRealSetup(s, DISPLAY, { twistIn: 11 })
    expect([p.get('cr'), p.get('cs'), p.get('cf')]).toEqual(['u-r1', 'u-s1', 'u-f1'])
    expect(p.has('o')).toBe(false)
    expect(readRealSetup(p)).toEqual(s)
    // A built-in round keeps p= and o=, and writes no ids; a custom scope on it goes along.
    const b = writeRealSetup({ ...DEFAULT_SETUP, scopeId: 'u-s1' }, DISPLAY, { twistIn: 11 })
    expect(b.get('p')).toBe('p7')
    expect(b.has('o')).toBe(true)
    expect([b.has('cr'), b.get('cs'), b.has('cf')]).toEqual([false, 'u-s1', false])
    expect(writeRealSetup({ ...DEFAULT_SETUP, windSet: true }, DISPLAY).toString()).toBe('p=p7&d=300&sl=0&ws=0&wc=9&u=metric&a=mil')
    expect(writeRealSetup(DEFAULT_SETUP, DISPLAY).has('tg')).toBe(false)
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

  it('sets the wind with the steppers, the field or the clock', () => {
    window.location.hash = '#/real/workbench?p=p7&d=300'
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0].windSet).toBe(false)
    act(() => result.current[1]({ windClock: 3 }))
    const p = new URLSearchParams(window.location.hash.split('?')[1])
    expect([p.get('ws'), p.get('wc')]).toEqual(['0', '3'])
    expect(result.current[0].windSet).toBe(true)
  })

  it('keeps today\'s links and stored setups set', () => {
    window.location.hash = '#/real/workbench'
    localStorage.setItem('gb.real.setup', 'p=p7&d=300&ws=2&wc=9')
    const { result } = renderHook(() => useRealSetup(), { wrapper: Wrapper })
    expect(result.current[0]).toMatchObject({ windSet: true, windMs: 2 })
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
