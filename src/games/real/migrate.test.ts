import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import fixture from './__fixtures__/profiles-with-custom.json'
import common from './__fixtures__/profiles-with-custom-common.json'
import { PRESETS } from './data/presets'
import { LIBRARY_KEY, MIGRATED_ENTRY_KEY, readLibrary, useLibrary, type Library } from './library'
import { migrateCustomPreset } from './migrate'
import { resolvePreset, useOverrides, type Overrides } from './profiles'
import { dropUnknown, incompleteFields, resolveSelection, useSelection } from './selection'
import { DEFAULT_SETUP, readRealSetup, type PresetOverrides, type RealSetup } from './setup'

const PROFILES = 'gb.real.profiles'
const ID = /^u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NO_KEYS: ReadonlySet<keyof Overrides> = new Set()
const P7 = PRESETS.find((p) => p.id === 'p7')!

const keep = (presets: object) => localStorage.setItem(PROFILES, JSON.stringify({ v: 1, presets }))
const profiles = () => JSON.parse(localStorage.getItem(PROFILES)!)
const stored = (): Library => JSON.parse(localStorage.getItem(LIBRARY_KEY)!)
/** The stored library's items, as a read cleans them (the migration's stamp at the top left out). */
const items = (): Library => readLibrary(localStorage.getItem(LIBRARY_KEY))
/** The text of the Custom entry the stored library last took in. */
const stamp = (): unknown => JSON.parse(localStorage.getItem(LIBRARY_KEY)!)[MIGRATED_ENTRY_KEY]
/** The library as the page reads it: the snapshot runs the migration. */
const library = (): Library => renderHook(() => useLibrary()).result.current[0]
const legacy = (s: Partial<RealSetup> = {}): RealSetup => ({ ...DEFAULT_SETUP, presetId: 'custom', ...s })

/** Storage that takes every key but `refused`, which throws on a write. */
function refusing(refused: string) {
  const real = localStorage
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => real.getItem(k),
    setItem: (k: string, v: string) => {
      if (k === refused) throw new Error('full')
      real.setItem(k, v)
    },
    removeItem: (k: string) => real.removeItem(k),
  })
  return real
}

/** Starts over with only `presets` stored (and whatever `also` stores), as a fresh page would. */
function reload(presets: object, also?: () => void) {
  cleanup()
  localStorage.clear()
  also?.()
  keep(presets)
}

/** A fresh copy of the modules, as the next load of the page has them. */
async function nextLoad(): Promise<typeof import('./migrate')> {
  vi.resetModules()
  return import('./migrate')
}

beforeEach(() => {
  localStorage.clear()
  // The stores remember the raw text they last read; an empty read resets them.
  renderHook(() => useLibrary()).unmount()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('migrating today\'s Custom', () => {
  it('moves only the overridden values', () => {
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    const lib = library()
    expect(lib.rifles).toEqual([{ id: expect.stringMatching(ID), name: 'Custom', twistIn: 11, migratedFrom: 'custom' }])
    const rifleId = lib.rifles[0].id
    // No 175 gr, .308″, 31.5 mm, 15 °C or 0 m/s/°C placeholder comes along.
    expect(lib.rounds).toEqual([{
      id: expect.stringMatching(ID), rifleId, name: 'Custom', massGr: 180, muzzleVelocityMs: 790, bc: 0.25, dragModel: 'G7', migratedFrom: 'custom',
    }])
    // No stored unit: the display angle's, MRAD by default. No click was stored, so none is made up: the scope asks for one.
    expect(lib.scopes).toEqual([{ id: expect.stringMatching(ID), rifleId, name: 'Custom', zeroM: 200, sightHeightMm: 55, scopeUnit: 'mil' }])
    expect(incompleteFields('scope', lib.scopes[0] as unknown as Record<string, unknown>)).toEqual([{ section: 'scope', key: 'clickValue' }])
    expect(items()).toEqual(lib)
    // The library notes the entry its items came from, so the same entry is never applied twice.
    expect(stamp()).toBe(JSON.stringify(fixture.presets.custom))
    expect(profiles()).toEqual({ v: 1, presets: { p7: { zeroM: 300, mvSdMs: 6 } } })
    // Once Custom is gone, it does nothing.
    migrateCustomPreset()
    expect(library()).toEqual(lib)
    expect(items()).toEqual(lib)
  })

  it('leaves a round without its mass incomplete', () => {
    // A BC typed under Custom's G7 was stored alone (RealMenus): it keeps that model.
    keep({ custom: { bc: 0.25, muzzleVelocityMs: 790 } })
    const [round] = library().rounds
    expect(round).toMatchObject({ name: 'Custom', bc: 0.25, dragModel: 'G7', muzzleVelocityMs: 790 })
    expect(round).not.toHaveProperty('massGr')
    expect(incompleteFields('round', round as unknown as Record<string, unknown>)).toEqual([{ section: 'round', key: 'massGr' }])
    const lib = library()
    const sel = resolveSelection(legacy(), lib, {}, undefined, NO_KEYS, false)
    expect(sel.incomplete).toEqual([{ section: 'round', key: 'massGr' }])
  })

  it('creates no scope without scope overrides', () => {
    keep({ custom: { massGr: 180, travelUp: null } })
    const lib = library()
    expect(lib.rifles).toHaveLength(1)
    expect(lib.rounds).toHaveLength(1)
    expect(lib.scopes).toEqual([])
    expect(lib.rifles[0]).toEqual({ id: lib.rifles[0].id, name: 'Custom', migratedFrom: 'custom' })
  })

  it('takes the scope unit from the stored one, else the display angle, and moves a click only with its unit', () => {
    localStorage.setItem('gb.display', JSON.stringify({ lang: 'en', system: 'metric', angle: 'moa' }))
    keep({ custom: { zeroM: 200 } })
    expect(library().scopes[0]).toMatchObject({ zeroM: 200, scopeUnit: 'moa' })
    // The stored unit wins over the display angle.
    reload({ custom: { clickValue: 0.1, travelUp: 30, scopeUnit: 'mil' } }, () => localStorage.setItem('gb.display', JSON.stringify({ angle: 'moa' })))
    expect(library().scopes[0]).toMatchObject({ clickValue: 0.1, travelUp: 30, scopeUnit: 'mil' })
    // R2: a click without its unit counted for nothing. It stays with the round, under the generic scope, as before.
    reload({ custom: { clickValue: 0.25, zeroM: 300 } })
    const lib = library()
    expect(lib.scopes[0]).toEqual({ id: lib.scopes[0].id, rifleId: lib.rifles[0].id, name: 'Custom', zeroM: 300, scopeUnit: 'mil' })
    expect(lib.rounds[0].overrides).toEqual({ clickValue: 0.25 })
  })

  it('gives the scope MRAD when the display angle is corrupt or blocked', () => {
    localStorage.setItem('gb.display', '{corrupt')
    keep({ custom: { zeroM: 200 } })
    expect(library().scopes[0]).toMatchObject({ zeroM: 200, scopeUnit: 'mil' })
    reload({ custom: { sightHeightMm: 55 } }, () => localStorage.setItem('gb.display', JSON.stringify({ angle: 'mrad' })))
    expect(library().scopes[0]).toMatchObject({ sightHeightMm: 55, scopeUnit: 'mil' })
    reload({ custom: { zeroM: 300 } }, () => localStorage.setItem('gb.display', JSON.stringify({ angle: 'moa' })))
    const real = localStorage
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => {
        if (k === 'gb.display') throw new Error('blocked')
        return real.getItem(k)
      },
      setItem: (k: string, v: string) => real.setItem(k, v),
      removeItem: (k: string) => real.removeItem(k),
    })
    expect(library().scopes[0]).toMatchObject({ zeroM: 300, scopeUnit: 'mil' })
  })

  it('keeps a key this build doesn\'t know, and a lone trued distance, in the round\'s overrides, and drops a wrong type', () => {
    keep({ custom: { massGr: 180, future: { a: 1 }, truedAtM: 300, mvSdMs: 'big', twist: 'up' } })
    const lib = library()
    expect(lib.rifles[0]).toEqual({ id: lib.rifles[0].id, name: 'Custom', migratedFrom: 'custom' })
    expect(lib.rounds[0]).toEqual({
      id: lib.rounds[0].id, rifleId: lib.rifles[0].id, name: 'Custom', massGr: 180, overrides: { future: { a: 1 }, truedAtM: 300 }, migratedFrom: 'custom',
    })
    expect(stored().rounds[0].overrides).toEqual({ future: { a: 1 }, truedAtM: 300 })
    // None of it reaches the formulas: on a custom rifle the round's overrides hold only the generic scope's values.
    const sel = resolveSelection(legacy(), lib, {}, undefined, NO_KEYS, false)
    expect(sel.preset.truedAtM).toBeNull()
    expect(sel.own).toEqual({})
  })

  it('keeps an out-of-range value in its field, flagged, and the item incomplete', () => {
    keep({ custom: { twistIn: 50, massGr: 5000 } })
    const lib = library()
    expect(lib.rifles[0]).toEqual({ id: lib.rifles[0].id, name: 'Custom', twistIn: 50, migratedFrom: 'custom' })
    expect(lib.rounds[0]).toEqual({ id: lib.rounds[0].id, rifleId: lib.rifles[0].id, name: 'Custom', massGr: 5000, migratedFrom: 'custom' })
    expect(items()).toEqual(lib)
    expect(profiles().presets).not.toHaveProperty('custom')
    const sel = resolveSelection(legacy(), lib, {}, undefined, NO_KEYS, false)
    expect(sel.incomplete).toContainEqual({ section: 'round', key: 'massGr' })
    expect(sel.preset.twistIn).toBeNull()
    // The page asks for the mass, and the sheet shows both values as stored, flagged.
    window.location.hash = '#/real/workbench?p=custom&d=800'
    render(createElement(App))
    expect(screen.getByText(/^To compute, add: bullet mass/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Rifle:/ }))
    const sheet = screen.getByRole('dialog', { name: 'Settings' })
    const region = (name: string) => {
      const r = within(sheet).getByRole('region', { name })
      const header = within(r).getByRole('button', { name: new RegExp(`^${name}( \\d+ yours)?$`) })
      if (header.getAttribute('aria-expanded') === 'false') fireEvent.click(header)
      return within(sheet).getByRole('region', { name })
    }
    const twist = within(region('Rifle')).getByLabelText(/^Twist( optional)?$/)
    expect(twist).toHaveValue('50')
    expect(twist).toHaveAttribute('aria-invalid', 'true')
    const mass = within(region('Round')).getByLabelText(/^Bullet mass$/)
    expect(mass).toHaveAttribute('aria-invalid', 'true')
  })

  it('leaves an entry with nothing usable where it is', () => {
    const custom = { future: 1, massGr: 'heavy', travelUp: null, clickValue: 0.25 }
    keep({ custom })
    expect(library()).toEqual({ v: 1, rifles: [], rounds: [], scopes: [] })
    expect(profiles().presets.custom).toEqual(custom)
  })

  it('migrates what 0.1.3 stores for a BC, a click and a sight height typed under Custom', () => {
    localStorage.setItem(PROFILES, JSON.stringify(common))
    const lib = library()
    const rifleId = lib.rifles[0].id
    expect(lib.rifles).toEqual([{ id: rifleId, name: 'Custom', migratedFrom: 'custom' }])
    expect(lib.rounds).toEqual([{ id: expect.stringMatching(ID), rifleId, name: 'Custom', bc: 0.25, dragModel: 'G7', migratedFrom: 'custom' }])
    expect(lib.scopes).toEqual([{ id: expect.stringMatching(ID), rifleId, name: 'Custom', sightHeightMm: 55, clickValue: 0.25, scopeUnit: 'moa' }])
    expect(incompleteFields('round', lib.rounds[0] as unknown as Record<string, unknown>)).toEqual([
      { section: 'round', key: 'massGr' }, { section: 'round', key: 'muzzleVelocityMs' },
    ])
    expect(incompleteFields('scope', lib.scopes[0] as unknown as Record<string, unknown>)).toEqual([{ section: 'scope', key: 'zeroM' }])
    expect(profiles()).toEqual({ v: 1, presets: {} })
  })

  it('reads an older store that kept the presets at the top, and leaves the rest as stored', () => {
    localStorage.setItem(PROFILES, JSON.stringify({ custom: { massGr: 180 }, p7: { zeroM: 300, future: 1 } }))
    expect(library().rounds[0]).toMatchObject({ massGr: 180, migratedFrom: 'custom' })
    expect(profiles()).toEqual({ v: 1, presets: { p7: { zeroM: 300, future: 1 } } })
  })

  it('keeps Custom in place when storage refuses the library write, and shows the items for this view without duplicates', async () => {
    keep(fixture.presets)
    const real = refusing(LIBRARY_KEY)
    const { result, rerender } = renderHook(() => useLibrary())
    const first = result.current[0]
    expect([first.rifles.length, first.rounds.length, first.scopes.length]).toEqual([1, 1, 1])
    rerender()
    migrateCustomPreset()
    rerender()
    expect(result.current[0]).toBe(first)
    expect(library()).toEqual(first)
    expect(real.getItem(LIBRARY_KEY)).toBeNull()
    expect(JSON.parse(real.getItem(PROFILES)!).presets.custom).toEqual(fixture.presets.custom)
    // The next load, with storage taking it, migrates once.
    vi.unstubAllGlobals()
    ;(await nextLoad()).migrateCustomPreset()
    expect([stored().rifles.length, stored().rounds.length, stored().scopes.length]).toEqual([1, 1, 1])
    expect(stored().rounds[0]).toMatchObject({ massGr: 180, migratedFrom: 'custom' })
    expect(profiles().presets).not.toHaveProperty('custom')
  })

  it('applies what a tab open since before the release stored under Custom after the migration, and makes no second rifle', async () => {
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    const lib = library()
    // The old tab no longer sees Custom's values in storage, so it stores only its new edit.
    keep({ ...profiles().presets, custom: { muzzleVelocityMs: 805 } })
    ;(await nextLoad()).migrateCustomPreset()
    expect(items()).toEqual({ ...lib, rounds: [{ ...lib.rounds[0], muzzleVelocityMs: 805 }] })
    expect(stamp()).toBe(JSON.stringify({ muzzleVelocityMs: 805 }))
    expect(profiles().presets).not.toHaveProperty('custom')
  })

  it('applies an old tab\'s edits as its page stored them: a pair whole, and a scope when the edits need one', async () => {
    keep({ custom: { massGr: 180, muzzleVelocityMs: 800, truedAtM: 600 } })
    const lib = library()
    expect(lib.rounds[0]).toMatchObject({ muzzleVelocityMs: 800, truedAtM: 600 })
    expect(lib.scopes).toEqual([])
    keep({ custom: { muzzleVelocityMs: 805, clickValue: 0.1, scopeUnit: 'mil', bc: 0.3, twistIn: 10 } })
    ;(await nextLoad()).migrateCustomPreset()
    const after = stored()
    const rifleId = lib.rifles[0].id
    expect(after.rifles).toEqual([{ ...lib.rifles[0], twistIn: 10 }])
    // An MV typed there cleared its trued distance, and a BC typed alone was Custom's G7.
    expect(after.rounds).toEqual([{
      id: lib.rounds[0].id, rifleId, name: 'Custom', massGr: 180, muzzleVelocityMs: 805, bc: 0.3, dragModel: 'G7', migratedFrom: 'custom',
    }])
    expect(after.scopes).toEqual([{ id: expect.stringMatching(ID), rifleId, name: 'Custom', clickValue: 0.1, scopeUnit: 'mil' }])
    expect(profiles().presets).not.toHaveProperty('custom')
  })

  // 0.1.3 writes a click or a travel as a change within the unit it stores (RealSettings' scope write): the other stays.
  it('applies an old tab\'s travel or click in the scope\'s unit field by field, and a new unit as the whole group', async () => {
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    const { result } = renderHook(() => useLibrary())
    const [scope] = result.current[0].scopes
    // The fixture had no click: one added in this build stays when the old tab sets a travel.
    act(() => result.current[1].update('scope', scope.id, { clickValue: 0.1 }))
    const scopeNow = async (custom: object) => {
      keep({ custom })
      ;(await nextLoad()).migrateCustomPreset()
      expect(profiles().presets).not.toHaveProperty('custom')
      const after = stored()
      expect([after.rifles.length, after.rounds.length, after.scopes.length]).toEqual([1, 1, 1])
      return after.scopes[0]
    }
    const base = { id: scope.id, rifleId: scope.rifleId, name: 'Custom', zeroM: 200, sightHeightMm: 55 }
    expect(await scopeNow({ travelUp: 40, scopeUnit: 'mil' })).toEqual({ ...base, scopeUnit: 'mil', clickValue: 0.1, travelUp: 40 })
    expect(await scopeNow({ clickValue: 0.05, scopeUnit: 'mil' })).toEqual({ ...base, scopeUnit: 'mil', clickValue: 0.05, travelUp: 40 })
    // A travel cleared there is cleared here; the click stays.
    expect(await scopeNow({ travelUp: null, scopeUnit: 'mil' })).toEqual({ ...base, scopeUnit: 'mil', clickValue: 0.05 })
    expect(await scopeNow({ travelUp: 30, scopeUnit: 'mil' })).toEqual({ ...base, scopeUnit: 'mil', clickValue: 0.05, travelUp: 30 })
    // A new unit: the click and the travel were the old unit's, so the group goes whole.
    expect(await scopeNow({ clickValue: 0.25, scopeUnit: 'moa' })).toEqual({ ...base, scopeUnit: 'moa', clickValue: 0.25 })
  })

  it('gives a lone BC from an old tab the model the round has', async () => {
    keep({ custom: { massGr: 180, muzzleVelocityMs: 800, bc: 0.5, dragModel: 'G1' } })
    const lib = library()
    expect(lib.rounds[0]).toMatchObject({ bc: 0.5, dragModel: 'G1' })
    keep({ custom: { bc: 0.45 } })
    ;(await nextLoad()).migrateCustomPreset()
    expect(items().rounds).toEqual([{ ...lib.rounds[0], bc: 0.45, dragModel: 'G1' }])
  })

  it('never duplicates the items when the library took them but Custom could not be removed', async () => {
    keep(fixture.presets)
    refusing(PROFILES)
    const lib = library()
    expect(items()).toEqual(lib)
    expect(profiles().presets.custom).toEqual(fixture.presets.custom)
    vi.unstubAllGlobals()
    ;(await nextLoad()).migrateCustomPreset()
    expect(items()).toEqual(lib)
    expect(profiles()).toEqual({ v: 1, presets: { p7: { zeroM: 300, mvSdMs: 6 } } })
  })

  it('keeps an edit made in this build when the library took the items but Custom could not be removed', async () => {
    keep(fixture.presets)
    refusing(PROFILES)
    const { result } = renderHook(() => useLibrary())
    const [round] = result.current[0].rounds
    act(() => result.current[1].update('round', round.id, { muzzleVelocityMs: 900 }))
    expect(items().rounds[0].muzzleVelocityMs).toBe(900)
    // The stamp survives the write.
    expect(stamp()).toBe(JSON.stringify(fixture.presets.custom))
    expect(profiles().presets.custom).toEqual(fixture.presets.custom)
    vi.unstubAllGlobals()
    ;(await nextLoad()).migrateCustomPreset()
    expect(items().rounds).toEqual([{ ...round, muzzleVelocityMs: 900 }])
    expect(items().rifles).toHaveLength(1)
    expect(profiles().presets).not.toHaveProperty('custom')
  })

  it('keeps an edit made in this view when storage refuses the library and another preset is edited', () => {
    keep(fixture.presets)
    refusing(LIBRARY_KEY)
    const { result, rerender } = renderHook(() => useLibrary())
    const [round] = result.current[0].rounds
    act(() => result.current[1].update('round', round.id, { muzzleVelocityMs: 900 }))
    expect(result.current[0].rounds[0].muzzleVelocityMs).toBe(900)
    // An accepted edit of P7 changes gb.real.profiles, with Custom kept in it: the migration looks again.
    const presets = renderHook(() => useOverrides())
    act(() => {
      presets.result.current[1]('p7', { zeroM: 250 })
    })
    expect(profiles().presets).toMatchObject({ p7: { zeroM: 250 }, custom: fixture.presets.custom })
    rerender()
    expect(result.current[0].rounds).toEqual([{ ...round, muzzleVelocityMs: 900 }])
    expect(result.current[0].rifles).toHaveLength(1)
  })

  it('still runs without crypto.randomUUID (an origin that is not secure, such as a phone on the dev server)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    // An empty library of its own, so no page view a test before kept stands in for it.
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ v: 1, rifles: [], rounds: [], scopes: [] }))
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    const lib = library()
    expect(lib.rifles).toEqual([{ id: expect.stringMatching(ID), name: 'Custom', twistIn: 11, migratedFrom: 'custom' }])
    expect(lib.rounds.map((r) => r.id)).toEqual([expect.stringMatching(ID)])
    expect(lib.scopes.map((s) => s.id)).toEqual([expect.stringMatching(ID)])
    expect(items()).toEqual(lib)
    expect(profiles()).toEqual({ v: 1, presets: { p7: { zeroM: 300, mvSdMs: 6 } } })
  })

  it('leaves the library as read, and the page whole, when the migration throws', () => {
    const before = JSON.stringify({ v: 1, rifles: [{ id: 'u-a', name: 'A' }], rounds: [], scopes: [] })
    localStorage.setItem(LIBRARY_KEY, before)
    keep(fixture.presets)
    // No crypto at all: an id can't be made.
    vi.stubGlobal('crypto', {})
    window.location.hash = '#/real/workbench?p=p7&d=800'
    render(createElement(App))
    expect(within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Rifle: AI AXSR/ })).toBeInTheDocument()
    expect(screen.getByTestId('real-elevation')).toBeInTheDocument()
    expect(library()).toEqual({ v: 1, rifles: [{ id: 'u-a', name: 'A' }], rounds: [], scopes: [] })
    expect(localStorage.getItem(LIBRARY_KEY)).toBe(before)
    expect(profiles().presets.custom).toEqual(fixture.presets.custom)
  })
})

describe('p=custom, the retired preset\'s links and stored setups', () => {
  it('opens the migrated round from p=custom', () => {
    expect(readRealSetup(new URLSearchParams('p=custom&d=500'))).toMatchObject({ presetId: 'custom', roundId: null, distanceM: 500 })
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    const lib = library()
    const [rifle] = lib.rifles
    const [round] = lib.rounds
    const [scope] = lib.scopes
    // From a link or a stored setup alike: its rifle, its round and its scope, with nothing missing to say.
    for (const fromUrl of [true, false]) {
      const sel = resolveSelection(legacy(), lib, { p7: { zeroM: 300 } }, { twistIn: 9 }, NO_KEYS, fromUrl)
      expect(sel).toMatchObject({ rifle, round, scope, rifleId: rifle.id, linkMissing: null })
      expect(sel.preset).toMatchObject({ id: round.id, rifle: 'Custom', round: 'Custom', zeroM: 200, twistIn: { value: 11 } })
    }
    // The first change puts what is on screen in the setup: the ids, and a preset that exists.
    const sel = resolveSelection(legacy(), lib, {}, undefined, NO_KEYS, false)
    expect(dropUnknown(legacy(), sel, { distanceM: 500 })).toEqual({ distanceM: 500, presetId: 'p7', roundId: round.id, customRifleId: rifle.id, scopeId: scope.id })
    // A pick is the pick's: another rifle, or the generic scope in place of the one p=custom opened.
    const pick = { presetId: 'p5', roundId: null, customRifleId: null, scopeId: null }
    expect(dropUnknown(legacy(), sel, pick)).toEqual(pick)
    expect(dropUnknown(legacy(), sel, { scopeId: null })).toEqual({ scopeId: null, presetId: 'p7', roundId: round.id, customRifleId: rifle.id })
  })

  it('opens the migrated round when the stored setup says p=custom', () => {
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    localStorage.setItem('gb.real.setup', 'p=custom&d=300')
    window.location.hash = '#/real/workbench'
    render(createElement(App))
    const strip = within(screen.getByTestId('real-strip'))
    expect(strip.getByRole('button', { name: /^Rifle: Custom$/ })).toBeInTheDocument()
    expect(strip.getByRole('button', { name: /^Round: Custom$/ })).toBeInTheDocument()
    expect(screen.getByText('To compute, add: click')).toBeInTheDocument()
    expect(screen.queryByText(/This link uses/)).not.toBeInTheDocument()
  })

  it('names the migrated items by their ids in the URL a bare page writes, so a share never carries p=custom', () => {
    localStorage.setItem(PROFILES, JSON.stringify(fixture))
    localStorage.setItem('gb.real.setup', 'p=custom&d=300')
    window.location.hash = '#/real/workbench'
    render(createElement(App))
    const lib = items()
    const params = new URLSearchParams(window.location.hash.split('?')[1])
    expect([params.get('p'), params.get('cr'), params.get('cf'), params.get('cs'), params.get('d'), params.has('o')])
      .toEqual(['p7', lib.rounds[0].id, lib.rifles[0].id, lib.scopes[0].id, '300', false])
    expect(within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Rifle: Custom$/ })).toBeInTheDocument()
    expect(screen.queryByText(/This link uses/)).not.toBeInTheDocument()
    // The app wrote it: the stored setup and the tab's note of its own URL hold the ids, so the page again is no link.
    expect(new URLSearchParams(localStorage.getItem('gb.real.setup')!).get('cr')).toBe(lib.rounds[0].id)
    expect(new URLSearchParams(sessionStorage.getItem('gb.real.written')!).get('cr')).toBe(lib.rounds[0].id)
    cleanup()
    render(createElement(App))
    expect(screen.queryByText(/This link uses/)).not.toBeInTheDocument()
    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('cr')).toBe(lib.rounds[0].id)
  })

  it('moves only p from a stored p=custom when nothing was migrated', () => {
    localStorage.setItem('gb.real.setup', 'p=custom&d=300')
    window.location.hash = '#/real/workbench'
    render(createElement(App))
    const params = new URLSearchParams(window.location.hash.split('?')[1])
    expect([params.get('p'), params.has('cr'), params.has('cf'), params.has('cs'), params.get('d')]).toEqual(['p7', false, false, false, '300'])
    expect(screen.queryByText(/This link uses/)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Rifle: AI AXSR/ })).toBeInTheDocument()
  })

  it('opens the default preset with the note from p=custom when nothing was migrated', () => {
    const empty: Library = { v: 1, rifles: [], rounds: [], scopes: [] }
    // A link's o= carried Custom's values: they are not the default preset's.
    const sel = resolveSelection(legacy(), empty, { p7: { zeroM: 300 } }, { twistIn: 11 }, NO_KEYS, true)
    expect(sel.preset).toEqual(resolvePreset(P7, { zeroM: 300 }))
    expect(sel).toMatchObject({ rifleId: 'axsr', rifle: null, round: null, scope: null, own: { zeroM: 300 }, linkMissing: 'rifle' })
    expect(resolveSelection(legacy(), empty, {}, undefined, NO_KEYS, false).linkMissing).toBeNull()
    expect(dropUnknown(legacy(), sel, { distanceM: 500 })).toEqual({ distanceM: 500, presetId: 'p7' })
    // An edit lands on the default preset it shows, never on `custom`.
    const po: PresetOverrides = { own: undefined, fromLink: false, linkKeys: NO_KEYS, useMine: vi.fn(), save: vi.fn() }
    const { result } = renderHook(() => useSelection(legacy(), vi.fn(), po, true))
    act(() => result.current.save('scope', { zeroM: 200 }))
    expect(po.save).toHaveBeenCalledWith({ zeroM: 200 }, { presetId: 'p7' })
  })

  it('shows the note on the page, and the link\'s o= goes', () => {
    window.location.hash = `#/real/workbench?p=custom&d=800&o=${btoa(JSON.stringify({ twistIn: 11 })).replace(/=+$/, '')}`
    render(createElement(App))
    expect(screen.getByText("This link uses a custom rifle you don't have here.")).toBeInTheDocument()
    expect(screen.queryByText(/Values from the shared link/)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Rifle: AI AXSR/ })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.hash.split('?')[1]).has('o')).toBe(false)
  })
})
