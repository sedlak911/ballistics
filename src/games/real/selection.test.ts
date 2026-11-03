import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESETS } from './data/presets'
import { LIBRARY_KEY, useLibrary, type CustomRifle, type CustomRound, type CustomScope, type Library } from './library'
import { DEFAULT_REAL_PROFILE } from './profile'
import { resolvePreset, scopeValues, SECTIONS, type Overrides } from './profiles'
import { dropUnknown, editTarget, resolveSelection, useSelection, type Selection } from './selection'
import { DEFAULT_SETUP, type PresetOverrides, type RealSetup } from './setup'
import { solveReal } from './solve'
import { STANDARD_STATION } from './station'

const P5 = PRESETS.find((p) => p.id === 'p5')!
const P7 = PRESETS.find((p) => p.id === 'p7')!
const RIFLE = 'u-rifle-1'
const ROUND = 'u-round-1'
const SCOPE = 'u-scope-1'
const NO_KEYS: ReadonlySet<keyof Overrides> = new Set()

const lib = (l: Partial<Library>): Library => ({ v: 1, rifles: [], rounds: [], scopes: [], ...l })
const rifle = (r: Partial<CustomRifle> = {}): CustomRifle => ({ id: RIFLE, name: 'Steyr SSG 69 PII', ...r })
const round = (r: Partial<CustomRound> = {}): CustomRound => ({
  id: ROUND, rifleId: 'axsr', name: 'Handload 250', calibre: '.338', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880, massGr: 250, ...r,
})
const scope = (s: Partial<CustomScope> = {}): CustomScope => ({
  id: SCOPE, rifleId: 'axsr', name: 'S&B 5-25', scopeUnit: 'moa', clickValue: 0.25, zeroM: 100, sightHeightMm: 55, ...s,
})
const setup = (s: Partial<RealSetup> = {}): RealSetup => ({ ...DEFAULT_SETUP, ...s })
const select = (s: Partial<RealSetup>, l: Library, o: { overrides?: Record<string, Overrides>; own?: Overrides; fromUrl?: boolean } = {}) =>
  resolveSelection(setup(s), l, o.overrides ?? {}, o.own, NO_KEYS, o.fromUrl ?? false)
const yours = (value: unknown) => ({ value, trust: 'V', source: 'yours' })

describe('resolveSelection', () => {
  it('resolves a built-in round exactly as today', () => {
    const own: Overrides = { twistIn: 10 }
    const sel = resolveSelection(setup(), lib({ rounds: [round()] }), { p7: own }, own, NO_KEYS, false)
    expect(sel.preset).toEqual(resolvePreset(P7, own, NO_KEYS))
    expect(sel).toMatchObject({ rifleId: 'axsr', rifle: null, round: null, scope: null, incomplete: [], unset: [], linkMissing: null })
    // A shared link's keys reach the tags as today.
    const link: ReadonlySet<keyof Overrides> = new Set(['twistIn'])
    expect(resolveSelection(setup(), lib({}), {}, own, link, true).preset).toEqual(resolvePreset(P7, own, link))
  })

  it('builds a custom round on the AXSR from the rifle\'s first preset', () => {
    const sel = select({ roundId: ROUND }, lib({ rounds: [round()] }))
    const p = sel.preset
    expect(p.twistIn).toEqual(P7.twistIn)
    expect(p.twistIn!.value).toBe(9.35)
    expect(p.accuracyMoa!.value).toBe(1)
    expect(p.sightHeightMm).toEqual(P7.sightHeightMm)
    expect(p.muzzleVelocityMs).toEqual(yours(880))
    expect(p.drag).toEqual(yours({ model: 'G7', bc: 0.31 }))
    expect(p.bullet.massGr).toEqual(yours(250))
    expect(p).toMatchObject({
      id: ROUND, rifle: P7.rifle, rifleShort: 'AXSR', barrel: P7.barrel, round: 'Handload 250', short: 'Handload 250', calibre: '.338',
      truedAtM: null, magnification: null, zeroM: 100, scopeUnit: null,
    })
    expect(p.linkKeys.size).toBe(0)
    expect(sel).toMatchObject({ rifleId: 'axsr', rifle: null, round: round(), scope: null, incomplete: [], linkMissing: null })
    // The rifle's first preset brings its stored rifle and scope values, not its round's.
    const stored = select({ roundId: ROUND }, lib({ rounds: [round()] }), { overrides: { p7: { twistIn: 9.5, zeroM: 300, muzzleVelocityMs: 850 } } }).preset
    expect(stored).toMatchObject({ twistIn: yours(9.5), zeroM: 300, muzzleVelocityMs: yours(880) })
  })

  it('takes the tag texts from a long name without a calibre', () => {
    const name = 'Hornady ELD-M 285 gr handload, batch 3'
    const p = select({ roundId: ROUND }, lib({ rounds: [round({ name, calibre: undefined })] })).preset
    expect(p.round).toBe(name)
    expect(p.short).toBe(name.slice(0, 22).trim())
    expect(p.calibre).toBe('Hornady')
    const own = select({ roundId: ROUND, customRifleId: RIFLE }, lib({ rifles: [rifle({ barrelIn: 23.6 })], rounds: [round({ rifleId: RIFLE })] })).preset
    expect(own).toMatchObject({ rifle: 'Steyr SSG 69 PII', rifleShort: 'Steyr SSG', barrel: yours('23.6″'), users: [] })
    expect(select({ roundId: ROUND }, lib({ rifles: [rifle({ id: 'u-x' })], rounds: [round()] })).preset.barrel).toEqual(P7.barrel)
    expect(select({ roundId: ROUND, customRifleId: RIFLE }, lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE })] })).preset.barrel.value).toBe('—')
  })

  it('keeps a twist edited under a custom round away from the built-in rounds', () => {
    const l = lib({ rounds: [round({ overrides: { twistIn: 11 } })] })
    expect(select({ roundId: ROUND }, l).preset.twistIn).toEqual(yours(11))
    expect(select({}, l).preset.twistIn!.value).toBe(9.35)
  })

  it('lists the custom rifle\'s empty optional fields in order', () => {
    const sel = select({ roundId: ROUND, customRifleId: RIFLE }, lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE, diameterIn: 0.338 })] }))
    expect(sel.unset.map((f) => f.key)).toEqual(['mvSdMs', 'powderSensMsPerC', 'mvRefTempC', 'accuracyMoa', 'twistIn', 'lengthMm'])
    expect(sel.unset).toContainEqual({ section: 'rifle', key: 'twistIn' })
    expect(sel.unset).toContainEqual({ section: 'round', key: 'mvSdMs' })
    expect(sel.incomplete).toEqual([])
    expect(sel.preset).toMatchObject({ twistIn: null, accuracyMoa: null, mvSdMs: null, powderSensMsPerC: null, mvRefTempC: null, twist: 'right', groupShots: 3 })
    expect(sel.preset.bullet).toEqual({ massGr: yours(250), diameterIn: yours(0.338), lengthMm: null })
    expect(sel).toMatchObject({ rifleId: RIFLE, rifle: rifle(), round: round({ rifleId: RIFLE, diameterIn: 0.338 }), scope: null })
    // A built-in rifle's values are never "not set".
    expect(select({ roundId: ROUND }, lib({ rounds: [round()] })).unset.map((f) => f.key)).toEqual(['mvSdMs', 'powderSensMsPerC', 'mvRefTempC', 'lengthMm', 'diameterIn'])
  })

  it('counts an out-of-range value as missing, never as a number', () => {
    const sel = select({ roundId: ROUND, customRifleId: RIFLE }, lib({ rifles: [rifle({ twistIn: 50 })], rounds: [round({ rifleId: RIFLE, muzzleVelocityMs: 50 })] }))
    expect(sel.preset.twistIn).toBeNull()
    expect(sel.unset).toContainEqual({ section: 'rifle', key: 'twistIn' })
    expect(sel.incomplete).toEqual([{ section: 'round', key: 'muzzleVelocityMs' }])
    expect(sel.preset.muzzleVelocityMs.value).not.toBe(50)
    // An out-of-range override under a custom round leaves the rifle's own value.
    expect(select({ roundId: ROUND }, lib({ rounds: [round({ overrides: { twistIn: 50, zeroM: 5 } })] })).preset).toMatchObject({ twistIn: P7.twistIn, zeroM: 100 })
    // A scope's travel is checked in the scope's own unit.
    const travel = (t: number, unit: 'mil' | 'moa') => select({ scopeId: SCOPE }, lib({ scopes: [scope({ scopeUnit: unit, clickValue: unit === 'mil' ? 0.1 : 0.25, travelUp: t })] })).preset.travelUp
    expect(travel(100, 'moa')).toBe(100)
    expect(travel(100, 'mil')).toBeNull()
  })

  it('marks a round without its mass incomplete', () => {
    const sel = select({ roundId: ROUND }, lib({ rounds: [round({ massGr: undefined })] }))
    expect(sel.incomplete).toEqual([{ section: 'round', key: 'massGr' }])
    expect(sel.unset.map((f) => f.key)).not.toContain('massGr')
  })

  it('lists every missing required field, the rifle first, in the form\'s order', () => {
    const sel = select(
      { roundId: ROUND, customRifleId: RIFLE, scopeId: SCOPE },
      lib({
        rifles: [rifle({ name: '' })],
        rounds: [round({ rifleId: RIFLE, name: undefined, dragModel: undefined, muzzleVelocityMs: undefined })],
        scopes: [scope({ rifleId: RIFLE, scopeUnit: undefined, clickValue: 0.5, sightHeightMm: undefined })],
      }),
    )
    expect(sel.incomplete).toEqual([
      { section: 'rifle', key: 'name' },
      { section: 'round', key: 'name' },
      { section: 'round', key: 'bc' },
      { section: 'round', key: 'muzzleVelocityMs' },
      { section: 'scope', key: 'scopeUnit' },
      { section: 'scope', key: 'clickValue' },
      { section: 'scope', key: 'sightHeightMm' },
    ])
    // The preset is still whole: its placeholders are tagged, never yours.
    expect(sel.preset.muzzleVelocityMs.source).toBe('missing')
    expect(sel.preset.drag.source).toBe('missing')
    expect(sel.preset.sightHeightMm.source).toBe('missing')
    expect(sel.unset.map((f) => f.key)).not.toContain('muzzleVelocityMs')
  })

  it('gives a custom rifle a generic scope tagged default', () => {
    const l = lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE })] })
    const p = select({ roundId: ROUND, customRifleId: RIFLE }, l).preset
    expect(p).toMatchObject({ zeroM: 100, clickValue: 0.1, travelUp: null, scopeUnit: null, magnification: null })
    expect(p.sightHeightMm).toEqual({ value: 60, trust: 'N', source: 'default' })
    expect(scopeValues(p, 'mil')).toMatchObject({ clickValue: 0.1, travelUp: null })
    // The round's own scope overrides go on top; its rifle overrides don't (the rifle is the item).
    const over = select({ roundId: ROUND, customRifleId: RIFLE }, lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE, overrides: { zeroM: 200, sightHeightMm: 45, twistIn: 11 } })] })).preset
    expect(over).toMatchObject({ zeroM: 200, sightHeightMm: yours(45), twistIn: null })
  })

  it('computes with a custom MOA scope after the display angle turns to MRAD', () => {
    const sel = select({ roundId: ROUND, scopeId: SCOPE }, lib({ rounds: [round()], scopes: [scope({ magnification: 25, travelUp: 60 })] }))
    expect(sel.scope).toEqual(scope({ magnification: 25, travelUp: 60 }))
    expect(sel.preset).toMatchObject({ scopeUnit: 'moa', clickValue: 0.25, zeroM: 100, travelUp: 60, sightHeightMm: yours(55), magnification: 25 })
    expect(sel.unset.map((f) => f.key)).not.toContain('travelUp')
    const s = solveReal(sel.preset, { ...DEFAULT_SETUP, distanceM: 800 }, DEFAULT_REAL_PROFILE, STANDARD_STATION, 'mil', { shares: false, hit: false })
    expect(s.reached).toBe(true)
    expect(s.inputs.find((i) => i.key === 'clickValue')).toMatchObject({ value: 0.1, source: 'default' })
    // Without its travel, the scope lists it as not set.
    expect(select({ scopeId: SCOPE }, lib({ scopes: [scope()] })).unset).toEqual([{ section: 'scope', key: 'travelUp' }])
    // A link's scope values don't show under a custom scope, so they don't read "from link"; its rifle values still do.
    const linked = resolveSelection(setup({ scopeId: SCOPE }), lib({ scopes: [scope()] }), {}, { zeroM: 300, twistIn: 10 }, new Set(['zeroM', 'twistIn']), true)
    expect([...linked.preset.linkKeys]).toEqual(['twistIn'])
    expect(linked.preset.zeroM).toBe(100)
  })

  it('opens the default preset for an unknown round and says the rifle is missing when cf came along', () => {
    const overrides = { p7: { zeroM: 200 }, p5: { zeroM: 300 } }
    const sel = select({ presetId: 'p5', roundId: 'u-gone', customRifleId: 'u-gone-rifle' }, lib({}), { overrides, fromUrl: true })
    expect(sel.preset).toEqual(resolvePreset(P7, overrides.p7))
    expect(sel).toMatchObject({ rifleId: 'axsr', rifle: null, round: null, scope: null, incomplete: [], unset: [], linkMissing: 'rifle' })
  })

  it('says the round is missing when only cr came, or when the rifle is here', () => {
    expect(select({ roundId: 'u-gone' }, lib({}), { fromUrl: true }).linkMissing).toBe('round')
    expect(select({ roundId: 'u-gone', customRifleId: RIFLE }, lib({ rifles: [rifle()] }), { fromUrl: true }).linkMissing).toBe('round')
    // A round whose rifle is in neither list can't be computed either.
    expect(select({ roundId: ROUND }, lib({ rounds: [round({ rifleId: 'u-nowhere' })] }), { fromUrl: true })).toMatchObject({ round: null, linkMissing: 'round' })
  })

  it('keeps a built-in round and its generic scope for an unknown cs', () => {
    const own: Overrides = { zeroM: 300 }
    const sel = select({ presetId: 'p5', scopeId: 'u-gone' }, lib({}), { own, fromUrl: true })
    expect(sel.preset).toEqual(resolvePreset(P5, own, NO_KEYS))
    expect(sel).toMatchObject({ scope: null, linkMissing: 'scope' })
    // A scope of another rifle is known: the generic scope, and nothing to say.
    const other = select({ presetId: 'p5', scopeId: SCOPE }, lib({ scopes: [scope()] }), { own, fromUrl: true })
    expect(other.preset).toEqual(resolvePreset(P5, own, NO_KEYS))
    expect(other).toMatchObject({ scope: null, linkMissing: null })
  })

  it('gives the overrides under the built-in values on screen, which the sheet tags and counts', () => {
    const own: Overrides = { twistIn: 10 }
    expect(resolveSelection(setup(), lib({}), { p7: { twistIn: 9 } }, own, NO_KEYS, false).own).toBe(own)
    // A custom round on the AXSR: the first preset's stored rifle and scope values, the round's own on top.
    const onAxsr = select({ roundId: ROUND }, lib({ rounds: [round({ overrides: { zeroM: 200 } })] }), { overrides: { p7: { twistIn: 9.5, muzzleVelocityMs: 850 } } })
    expect(onAxsr.own).toEqual({ twistIn: 9.5, zeroM: 200 })
    // A custom rifle has no preset under its rifle values: the round's scope overrides alone.
    const onOwn = select({ roundId: ROUND }, lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE, overrides: { zeroM: 200, twistIn: 11 } })] }))
    expect(onOwn.own).toEqual({ zeroM: 200 })
    // An unknown round shows the default preset, so its stored overrides.
    expect(select({ presetId: 'p5', roundId: 'u-gone' }, lib({}), { overrides: { p7: { zeroM: 300 } }, own: { zeroM: 150 } }).own).toEqual({ zeroM: 300 })
  })

  it('says nothing for a stored setup (fromUrl false)', () => {
    expect(select({ roundId: 'u-gone', customRifleId: 'u-gone-rifle', scopeId: 'u-gone' }, lib({})).linkMissing).toBeNull()
    expect(select({ scopeId: 'u-gone' }, lib({})).linkMissing).toBeNull()
  })
})

describe('editTarget', () => {
  const builtIn = select({}, lib({}))
  const builtInScope = select({ scopeId: SCOPE }, lib({ scopes: [scope()] }))
  const onAxsr = select({ roundId: ROUND }, lib({ rounds: [round()] }))
  const onAxsrScope = select({ roundId: ROUND, scopeId: SCOPE }, lib({ rounds: [round()], scopes: [scope()] }))
  const onOwn = select({ roundId: ROUND, customRifleId: RIFLE }, lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE })] }))
  const onOwnScope = select(
    { roundId: ROUND, customRifleId: RIFLE, scopeId: SCOPE },
    lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE })], scopes: [scope({ rifleId: RIFLE })] }),
  )
  const routes = (sel: Selection) => SECTIONS.map((s) => editTarget(sel, s))
  const preset = { to: 'preset' }
  const item = (kind: string, id: string) => ({ to: 'item', kind, id })
  const roundOverrides = { to: 'roundOverrides', id: ROUND }

  it('routes each section\'s edit', () => {
    // Columns: built-in round, custom round on a built-in rifle, custom round on a custom rifle; rows rifle, round, scope.
    expect(routes(builtIn)).toEqual([preset, preset, preset])
    expect(routes(builtInScope)).toEqual([preset, preset, item('scope', SCOPE)])
    expect(routes(onAxsr)).toEqual([roundOverrides, item('round', ROUND), roundOverrides])
    expect(routes(onAxsrScope)).toEqual([roundOverrides, item('round', ROUND), item('scope', SCOPE)])
    expect(routes(onOwn)).toEqual([item('rifle', RIFLE), item('round', ROUND), roundOverrides])
    expect(routes(onOwnScope)).toEqual([item('rifle', RIFLE), item('round', ROUND), item('scope', SCOPE)])
  })
})

describe('useSelection', () => {
  const seed = (l: Partial<Library>) => localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib(l)))
  const libRound = () => JSON.parse(localStorage.getItem(LIBRARY_KEY)!).rounds[0]
  const profiles = () => localStorage.getItem('gb.real.profiles')
  const po = (): PresetOverrides => ({ own: undefined, fromLink: false, linkKeys: NO_KEYS, useMine: vi.fn(), save: vi.fn() })

  beforeEach(() => {
    localStorage.clear()
    renderHook(() => useLibrary()).unmount()
  })

  it('saves each edit where it belongs', () => {
    seed({ rifles: [rifle()], rounds: [round(), round({ id: 'u-round-2', rifleId: RIFLE })] })
    const p = po()
    const { result, rerender } = renderHook(({ s }) => useSelection(s, vi.fn(), p, false), { initialProps: { s: setup({ roundId: ROUND }) } })
    // A custom round on the AXSR: the rifle and the generic scope go into the round's overrides, the round into the item.
    act(() => result.current.save('rifle', { twistIn: 11 }))
    act(() => result.current.save('scope', { zeroM: 200, name: 'not an override' }))
    act(() => result.current.save('round', { massGr: 180 }))
    expect(libRound()).toMatchObject({ massGr: 180, overrides: { twistIn: 11, zeroM: 200 } })
    expect(libRound().overrides).not.toHaveProperty('name')
    expect(result.current.sel.preset).toMatchObject({ twistIn: yours(11), zeroM: 200, bullet: { massGr: yours(180) } })
    act(() => result.current.save('rifle', { twistIn: undefined }))
    expect(libRound().overrides).toEqual({ zeroM: 200 })
    expect(p.save).not.toHaveBeenCalled()
    expect(profiles()).toBeNull()
    // A custom rifle's fields are its own.
    rerender({ s: setup({ roundId: 'u-round-2', customRifleId: RIFLE }) })
    act(() => result.current.save('rifle', { twistIn: 12, name: 'SSG' }))
    expect(JSON.parse(localStorage.getItem(LIBRARY_KEY)!).rifles[0]).toMatchObject({ name: 'SSG', twistIn: 12 })
    // A built-in round goes through the preset's save, as today.
    rerender({ s: setup() })
    act(() => result.current.save('rifle', { twistIn: 10 }))
    expect(p.save).toHaveBeenCalledWith({ twistIn: 10 })
  })

  // The AXSR's first preset holds a 1/8 MOA click and 100 MOA of travel; a scope field writes only the half it changed.
  const onStoredMoa = () => {
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { clickValue: 0.125, scopeUnit: 'moa', travelUp: 100 } } }))
    seed({ rounds: [round()] })
    const { result } = renderHook(() => useSelection(setup({ roundId: ROUND }), vi.fn(), po(), false))
    expect(result.current.sel.preset).toMatchObject({ clickValue: 0.125, travelUp: 100, scopeUnit: 'moa' })
    return result
  }

  it('keeps the click when the travel is edited under a custom round on a built-in rifle', () => {
    const result = onStoredMoa()
    act(() => result.current.save('scope', { travelUp: 30, scopeUnit: 'moa' }))
    expect(result.current.sel.preset).toMatchObject({ clickValue: 0.125, travelUp: 30, scopeUnit: 'moa' })
    expect(scopeValues(result.current.sel.preset, 'moa')).toMatchObject({ clickValue: 0.125, clickKnown: true })
    expect(libRound().overrides).toEqual({ clickValue: 0.125, travelUp: 30, scopeUnit: 'moa' })
  })

  it('keeps the travel when the click is edited under a custom round on a built-in rifle', () => {
    const result = onStoredMoa()
    act(() => result.current.save('scope', { clickValue: 0.25, scopeUnit: 'moa' }))
    expect(result.current.sel.preset).toMatchObject({ clickValue: 0.25, travelUp: 100, scopeUnit: 'moa' })
    // An edit of something else leaves the group as it is.
    act(() => result.current.save('scope', { zeroM: 200 }))
    expect(libRound().overrides).toEqual({ clickValue: 0.25, travelUp: 100, scopeUnit: 'moa', zeroM: 200 })
  })

  // The edit and the move go in one write, so the edit lands on the preset that stays on screen (setup.ts save).
  it('saves an edit under an unknown round to the default preset it shows, moving the setup there', () => {
    const p = po()
    const set = vi.fn()
    const { result } = renderHook(() => useSelection(setup({ presetId: 'p5', roundId: 'u-gone', customRifleId: 'u-gone-rifle' }), set, p, true))
    act(() => result.current.save('scope', { zeroM: 200 }))
    expect(p.save).toHaveBeenCalledWith({ zeroM: 200 }, { presetId: 'p7', roundId: null, customRifleId: null })
    expect(set).not.toHaveBeenCalled()
    expect(profiles()).toBeNull()
    // Any change of the setup drops the unknown ids too.
    act(() => result.current.update({ distanceM: 500 }))
    expect(set).toHaveBeenCalledWith({ distanceM: 500, presetId: 'p7', roundId: null, customRifleId: null })
  })

  it('drops an unknown scope with an edit to a custom item, and with a preset write', () => {
    seed({ rounds: [round()] })
    const set = vi.fn()
    const { result } = renderHook(() => useSelection(setup({ roundId: ROUND, scopeId: 'u-gone' }), set, po(), true))
    act(() => result.current.save('round', { massGr: 180 }))
    expect(libRound()).toMatchObject({ massGr: 180 })
    expect(set).toHaveBeenCalledWith({ scopeId: null })
    // A reset goes through savePreset, on a built-in round.
    const p = po()
    const builtIn = renderHook(() => useSelection(setup({ scopeId: 'u-gone' }), vi.fn(), p, true))
    act(() => builtIn.result.current.savePreset(null))
    expect(p.save).toHaveBeenCalledWith(null, { scopeId: null })
  })
})

describe('dropUnknown', () => {
  const drop = (s: Partial<RealSetup>, l: Library, patch: Partial<RealSetup> = {}) => dropUnknown(setup(s), select(s, l), patch)
  const gone = { presetId: 'p5', roundId: 'u-gone', customRifleId: 'u-gone-rifle' }

  it('drops what this device lacks and keeps what is on screen', () => {
    // An unknown round gives the preset shown, the default one; the ids that went with it go too.
    expect(drop({ ...gone, scopeId: 'u-gone-scope' }, lib({}))).toEqual({ presetId: 'p7', roundId: null, customRifleId: null, scopeId: null })
    // An unknown scope, or one of another rifle, gives the generic scope; the round stays.
    expect(drop({ presetId: 'p5', scopeId: 'u-gone' }, lib({}))).toEqual({ scopeId: null })
    expect(drop({ presetId: 'p5', scopeId: SCOPE }, lib({ scopes: [scope()] }))).toEqual({ scopeId: null })
    // A rifle id beside a built-in round names nothing selected.
    expect(drop({ customRifleId: RIFLE }, lib({ rifles: [rifle()] }))).toEqual({ customRifleId: null })
    // A selection this device has keeps everything.
    const own = lib({ rifles: [rifle()], rounds: [round({ rifleId: RIFLE })], scopes: [scope({ rifleId: RIFLE })] })
    expect(drop({ roundId: ROUND, customRifleId: RIFLE, scopeId: SCOPE }, own)).toEqual({})
    expect(drop({ roundId: ROUND, scopeId: SCOPE }, lib({ rounds: [round()], scopes: [scope()] }))).toEqual({})
  })

  it('keeps what the change sets, and drops what it leaves as it is', () => {
    expect(drop(gone, lib({}), { distanceM: 500 })).toEqual({ distanceM: 500, presetId: 'p7', roundId: null, customRifleId: null })
    // Picking the rifle of the link's own p: the pick's preset, not the one shown.
    const pick = { presetId: 'p5', roundId: null, customRifleId: null, scopeId: null }
    expect(drop(gone, lib({}), pick)).toEqual(pick)
    // A change that repeats the setup's ids, as a delete's does, drops them.
    expect(drop({ ...gone, scopeId: SCOPE }, lib({ scopes: [scope()] }), { ...gone, scopeId: null }))
      .toEqual({ presetId: 'p7', roundId: null, customRifleId: null, scopeId: null })
  })
})
