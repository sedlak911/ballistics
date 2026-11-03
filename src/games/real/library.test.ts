import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/library-v1.json'
import { LIBRARY_KEY, readLibrary, useLibrary, inRange, newId, writeLibrary } from './library'

const EMPTY = { v: 1, rifles: [], rounds: [], scopes: [] }
const R = 'u-11111111-1111-4111-8111-111111111111'
const ROUND1 = 'u-22222222-2222-4222-8222-222222222222'
const ROUND2 = 'u-33333333-3333-4333-8333-333333333333'

const seed = (v: unknown) => localStorage.setItem(LIBRARY_KEY, JSON.stringify(v))
const stored = () => JSON.parse(localStorage.getItem(LIBRARY_KEY)!)
const view = () => renderHook(() => useLibrary())

beforeEach(() => {
  localStorage.clear()
  // The store caches by the raw string; a fresh empty read resets it.
  renderHook(() => useLibrary()).unmount()
})
afterEach(() => vi.unstubAllGlobals())

describe('readLibrary', () => {
  it('reads nothing from missing, corrupt or blocked storage', () => {
    expect(readLibrary(null)).toEqual(EMPTY)
    expect(readLibrary('x')).toEqual(EMPTY)
    const boom = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom })
    expect(view().result.current[0]).toEqual(EMPTY)
  })

  it('loads the v1 sample back', () => {
    expect(readLibrary(fixture)).toEqual({
      v: 1,
      rifles: [{ id: R, name: 'My .308', barrelIn: 20, twistIn: 11, twist: 'left', accuracyMoa: 0.7, groupShots: 5, migratedFrom: 'custom' }],
      rounds: [
        {
          id: ROUND1, rifleId: 'axsr', name: 'Handload', calibre: '.338 LM', mvBarrelIn: 27, bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 900, truedAtM: 300,
          mvRefTempC: 15, powderSensMsPerC: 0.4, mvSdMs: 6, massGr: 250, diameterIn: 0.338, lengthMm: 40, overrides: { twistIn: 10, zeroM: 200 },
        },
        { id: ROUND2, rifleId: R, name: 'No mass', bc: 0.2, dragModel: 'G1', muzzleVelocityMs: 800 },
      ],
      scopes: [{ id: 'u-44444444-4444-4444-8444-444444444444', rifleId: 'axsr', name: 'Scope', magnification: 12, zeroM: 100, clickValue: 0.1, travelUp: 30, scopeUnit: 'mil', sightHeightMm: 50 }],
    })
  })

  it('keeps an out-of-range number and drops a wrong type', () => {
    const lib = readLibrary({
      rifles: [{ id: 'r', name: 'n', twistIn: 50, twist: 'up' }],
      rounds: [{ id: 'a', rifleId: 'x', name: 'n', bc: 5, massGr: 'heavy' }],
    })
    expect(lib.rifles).toEqual([{ id: 'r', name: 'n', twistIn: 50 }])
    expect(lib.rounds).toEqual([{ id: 'a', rifleId: 'x', name: 'n', bc: 5 }])
  })

  it('keeps an item without its required fields', () => {
    expect(readLibrary({ rounds: [{ id: 'a', rifleId: 'x', name: 'n' }] }).rounds).toHaveLength(1)
  })
})

describe('the store', () => {
  it('keeps a field it does not know through a write', () => {
    seed(fixture)
    const { result } = view()
    act(() => result.current[1].update('round', ROUND1, { mvSdMs: 4 }))
    const s = stored()
    expect(s.future).toBe(1)
    for (const k of ['rifles', 'rounds', 'scopes']) for (const i of s[k]) expect(i.future, k).toBe(1)
    expect(s.rounds[0].mvSdMs).toBe(4)
  })

  it('keeps an out-of-range override and an unknown override key through a write', () => {
    seed({ v: 1, rounds: [{ id: 'a', rifleId: 'x', name: 'n', overrides: { zeroM: 700, future: 1, twistIn: 10 } }] })
    const { result } = view()
    act(() => result.current[1].update('round', 'a', { name: 'renamed' }))
    expect(stored().rounds[0].overrides).toEqual({ zeroM: 700, future: 1, twistIn: 10 })
    expect(result.current[0].rounds[0].overrides?.zeroM).toBe(700)
    act(() => result.current[1].update('round', 'a', { overrides: { twistIn: undefined, bc: 0.3 } }))
    expect(stored().rounds[0].overrides).toEqual({ zeroM: 700, future: 1, bc: 0.3 })
  })

  it('drops a wrong-typed override value from the view', () => {
    const lib = readLibrary({ rounds: [{ id: 'a', rifleId: 'x', name: 'n', overrides: { zeroM: 'far', twistIn: 10, travelUp: null } }] })
    expect(lib.rounds[0].overrides).toEqual({ twistIn: 10, travelUp: null })
  })

  it('removes a key set to undefined', () => {
    seed(fixture)
    const { result } = view()
    act(() => result.current[1].update('round', ROUND1, { mvSdMs: undefined, bogus: 1 }))
    expect(stored().rounds[0]).not.toHaveProperty('mvSdMs')
    expect(stored().rounds[0]).not.toHaveProperty('bogus')
  })

  it('adds with u- ids and selects nothing itself', () => {
    const { result } = view()
    let id = ''
    act(() => {
      id = result.current[1].addRound({ rifleId: 'axsr', name: 'New' })
    })
    expect(id).toMatch(/^u-[0-9a-f-]{36}$/)
    expect(stored().rounds).toEqual([{ id, rifleId: 'axsr', name: 'New' }])
    expect(stored().v).toBe(1)
  })

  it('deletes a rifle with its rounds and scopes, and restore puts all back where they were', () => {
    const data = {
      ...fixture,
      rifles: [{ id: 'u-a', name: 'A' }, ...fixture.rifles],
      rounds: [{ id: 'u-r0', rifleId: 'axsr', name: 'K' }, ...fixture.rounds],
      scopes: [{ id: 'u-s0', rifleId: R, name: 'S' }, ...fixture.scopes, { id: 'u-s2', rifleId: R, name: 'S2' }],
    }
    seed(data)
    const before = stored()
    const { result } = view()
    let removed!: ReturnType<typeof result.current[1]['remove']>
    act(() => {
      removed = result.current[1].remove('rifle', R)
    })
    expect(stored().rifles.map((r: { id: string }) => r.id)).toEqual(['u-a'])
    expect(stored().rounds.map((r: { id: string }) => r.id)).toEqual(['u-r0', ROUND1])
    expect(stored().scopes.map((r: { id: string }) => r.id)).toEqual(['u-44444444-4444-4444-8444-444444444444'])
    act(() => result.current[1].restore(removed))
    expect(stored()).toEqual(before)
    expect(result.current[0].rifles).toHaveLength(2)
  })

  it('keeps an added item for this page view when storage refuses the write', () => {
    const boom = () => {
      throw new Error('full')
    }
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: boom })
    const { result } = view()
    let ids!: { rifleId: string; roundId: string }
    act(() => {
      ids = result.current[1].addRifle({ name: 'Mine' }, { name: 'Round' })
    })
    expect(ids.rifleId).toMatch(/^u-/)
    expect(result.current[0].rifles.map((r) => r.id)).toEqual([ids.rifleId])
    expect(result.current[0].rounds[0].rifleId).toBe(ids.rifleId)
    expect(writeLibrary(result.current[0])).toBe(false)
  })

  it('never lowers a later release\'s v: the write stays in this page view, and storage keeps what it had', () => {
    const later = JSON.stringify({ v: 2, future: { kept: true }, rifles: [{ id: 'u-a', name: 'A', newField: 1 }], rounds: [], scopes: [] })
    localStorage.setItem(LIBRARY_KEY, later)
    const { result } = view()
    // The newer v is read field by field, as any other.
    expect(result.current[0].rifles).toEqual([{ id: 'u-a', name: 'A' }])
    let ids!: { rifleId: string; roundId: string }
    act(() => {
      ids = result.current[1].addRifle({ name: 'Mine' }, { name: 'Round' })
    })
    expect(localStorage.getItem(LIBRARY_KEY)).toBe(later)
    expect(result.current[0].rifles.map((r) => r.id)).toEqual(['u-a', ids.rifleId])
    expect(result.current[0].rounds.map((r) => r.id)).toEqual([ids.roundId])
    // Every later write too, the delete's included.
    act(() => result.current[1].update('rifle', 'u-a', { name: 'B' }))
    act(() => {
      result.current[1].remove('round', ids.roundId)
    })
    expect(localStorage.getItem(LIBRARY_KEY)).toBe(later)
    expect(result.current[0].rifles[0].name).toBe('B')
    expect(result.current[0].rounds).toEqual([])
    expect(writeLibrary(result.current[0])).toBe(false)
    expect(localStorage.getItem(LIBRARY_KEY)).toBe(later)
  })

  it('writes a stored v: 1 as before', () => {
    seed({ v: 1, future: 1, rifles: [{ id: 'u-a', name: 'A' }], rounds: [], scopes: [] })
    const { result } = view()
    let ids!: { rifleId: string; roundId: string }
    act(() => {
      ids = result.current[1].addRifle({ name: 'Mine' }, { name: 'Round' })
    })
    expect(stored()).toEqual({
      v: 1, future: 1, rifles: [{ id: 'u-a', name: 'A' }, { id: ids.rifleId, name: 'Mine' }], rounds: [{ id: ids.roundId, rifleId: ids.rifleId, name: 'Round' }], scopes: [],
    })
    expect(writeLibrary(result.current[0])).toBe(true)
  })

  it('makes a v4 id without crypto.randomUUID (an origin that is not secure, such as a phone on the dev server)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const id = newId()
    expect(id).toMatch(/^u-[0-9a-f-]{36}$/)
    expect(id).toMatch(/^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newId()).not.toBe(id)
  })

  it('skips an entry that is not an object, and writes it back untouched', () => {
    seed({ v: 1, rounds: [42, { id: 'a', rifleId: 'x', name: 'n' }] })
    const { result } = view()
    expect(result.current[0].rounds).toHaveLength(1)
    act(() => result.current[1].update('round', 'a', { massGr: 100 }))
    expect(stored().rounds).toEqual([42, { id: 'a', rifleId: 'x', name: 'n', massGr: 100 }])
  })
})

describe('inRange', () => {
  it('uses the override, travel and library ranges', () => {
    expect(inRange('twistIn', 10)).toBe(true)
    expect(inRange('twistIn', 50)).toBe(false)
    expect(inRange('barrelIn', 20)).toBe(true)
    expect(inRange('magnification', 61)).toBe(false)
    expect(inRange('travelUp', 100)).toBe(false)
    expect(inRange('travelUp', 100, 'moa')).toBe(true)
    expect(inRange('nope', 1)).toBe(false)
  })
})
