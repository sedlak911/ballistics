import { describe, expect, it } from 'vitest'
import { PRESETS } from './data/presets'
import { CLICK_CHIPS, defaultClick, linkOverrides, OVERRIDE_RANGES, readLinkOverrides, readOverrides, resolvePreset, writeLinkOverrides, type Overrides } from './profiles'

const p7 = PRESETS.find((p) => p.id === 'p7')!

describe('readOverrides', () => {
  it('gives nothing for garbage', () => {
    expect(readOverrides(null)).toEqual({})
    expect(readOverrides('x')).toEqual({})
    expect(readOverrides([1])).toEqual({})
  })

  it('drops an unknown preset and a non-number value but keeps the rest', () => {
    const r = readOverrides({
      p7: { muzzleVelocityMs: 'fast', sightHeightMm: 60, bc: NaN, zeroM: 200, dragModel: 'G9', groupShots: 5 },
      zzz: { zeroM: 100 },
    })
    expect(r).toEqual({ p7: { sightHeightMm: 60, zeroM: 200, groupShots: 5 } })
  })

  it('keeps a twist direction only when it is right or left (M10)', () => {
    expect(readOverrides({ p7: { twist: 'left' }, p6: { twist: 'up' }, p5: { twist: 'right' } })).toEqual({ p7: { twist: 'left' }, p5: { twist: 'right' } })
  })

  it('keeps the scope unit only when it is one of the units', () => {
    expect(readOverrides({ p7: { travelUp: 20, scopeUnit: 'moa' }, p6: { travelUp: 20, scopeUnit: 'mrad' } })).toEqual({
      p7: { travelUp: 20, scopeUnit: 'moa' },
      p6: { travelUp: 20 },
    })
  })

  // M7: a stored value is one a menu field could have written, or it isn't the user's: dropped, never clamped into "yours".
  it('drops a value outside its menu field\'s bounds and keeps a null travel', () => {
    const r = readOverrides({ p7: { muzzleVelocityMs: -5, bc: 99, zeroM: 2500, sightHeightMm: 300, travelUp: null, massGr: 250 } })
    expect(r).toEqual({ p7: { travelUp: null, massGr: 250 } })
    expect(readOverrides({ p7: { zeroM: 2500 } })).toEqual({})
  })

  // The travel is cleaned against its own unit's bounds: MRAD 1-60, MOA 3.44-200; no unit reads as MRAD.
  it('cleans the travel against its unit\'s bounds', () => {
    const travel = (travelUp: number, scopeUnit?: 'mil' | 'moa') => readOverrides({ p7: { travelUp, scopeUnit } }).p7?.travelUp
    expect(travel(60, 'mil')).toBe(60)
    expect(travel(61, 'mil')).toBeUndefined()
    expect(travel(1, 'mil')).toBe(1)
    expect(travel(3, 'moa')).toBeUndefined()
    expect(travel(3.44, 'moa')).toBe(3.44)
    expect(travel(200, 'moa')).toBe(200)
    expect(travel(150)).toBeUndefined()
    expect(travel(20)).toBe(20)
  })

  // (d): a trued distance without its MV means nothing.
  it('drops a lone trued distance, in storage and in a link, and keeps it beside its MV', () => {
    expect(readOverrides({ p7: { truedAtM: 600 } })).toEqual({})
    expect(readOverrides({ p7: { truedAtM: 600, muzzleVelocityMs: 5 } })).toEqual({})
    expect(readOverrides({ p7: { truedAtM: 600, muzzleVelocityMs: 830 } })).toEqual({ p7: { truedAtM: 600, muzzleVelocityMs: 830 } })
    expect(readLinkOverrides(writeLinkOverrides({ truedAtM: 600 }))).toBeNull()
  })

  it('keeps the edges of every field', () => {
    // The travel has bounds per unit (below); the rest are the same in any unit.
    const lo = Object.fromEntries(Object.entries(OVERRIDE_RANGES).filter(([k]) => k !== 'travelUp').map(([k, r]) => [k, r.min]))
    const hi = Object.fromEntries(Object.entries(OVERRIDE_RANGES).filter(([k]) => k !== 'travelUp').map(([k, r]) => [k, r.max]))
    expect(readOverrides({ p7: lo }).p7).toEqual(lo)
    expect(readOverrides({ p7: hi }).p7).toEqual(hi)
    expect(OVERRIDE_RANGES).toMatchObject({ zeroM: { min: 25, max: 600 }, sightHeightMm: { min: 20, max: 120 }, muzzleVelocityMs: { min: 200, max: 1300 } })
  })
})

describe('resolvePreset', () => {
  it('marks an overridden MV as yours, trust V, and leaves the rest', () => {
    const r = resolvePreset(p7, { muzzleVelocityMs: 800 })
    expect(r.muzzleVelocityMs).toEqual({ value: 800, trust: 'V', source: 'yours' })
    expect(r.twistIn).toEqual(p7.twistIn)
  })

  it('a stored zero of 2500 m is not the user\'s: the preset\'s 100 m applies (M7)', () => {
    expect(resolvePreset(p7, readOverrides({ p7: { zeroM: 2500 } }).p7).zeroM).toBe(100)
  })

  it('turns the twist left when told, right by default (M10)', () => {
    expect(resolvePreset(p7, undefined).twist).toBe('right')
    expect(resolvePreset(p7, { twist: 'left' }).twist).toBe('left')
    expect(readLinkOverrides(writeLinkOverrides({ twist: 'left' }))).toEqual({ twist: 'left' })
  })

  it('defaults the scope values', () => {
    expect(resolvePreset(p7, undefined)).toMatchObject({ zeroM: 100, clickValue: 0.1, travelUp: null, scopeUnit: null, truedAtM: null })
    expect(resolvePreset(p7, { zeroM: 200, clickValue: 0.05, travelUp: 12, scopeUnit: 'mil', truedAtM: 400 })).toMatchObject({ zeroM: 200, clickValue: 0.05, travelUp: 12, scopeUnit: 'mil', truedAtM: 400 })
  })

  it('applies a BC override to the drag', () => {
    const r = resolvePreset(p7, { bc: 0.3, dragModel: 'G1' })
    expect(r.drag).toEqual({ value: { model: 'G1', bc: 0.3 }, trust: 'V', source: 'yours' })
  })
})

describe('resolvePreset drag', () => {
  const p9 = PRESETS.find((p) => 'table' in p.drag.value)!
  const g = PRESETS.find((p) => !('table' in p.drag.value))!
  const model = (g.drag.value as { model: 'G1' | 'G7' }).model
  const other = model === 'G1' ? 'G7' : 'G1'

  it('ignores bc and dragModel on a table preset', () => {
    expect(resolvePreset(p9, { dragModel: 'G1' }).drag).toEqual(p9.drag)
    expect(resolvePreset(p9, { bc: 0.5 }).drag).toEqual(p9.drag)
  })

  it('takes a BC alone with the preset\'s model', () => {
    expect(resolvePreset(g, { bc: 0.3 }).drag).toEqual({ value: { model, bc: 0.3 }, trust: 'V', source: 'yours' })
  })

  it('ignores a different model alone, since a BC belongs to its model', () => {
    expect(resolvePreset(g, { dragModel: other }).drag).toEqual(g.drag)
  })

  it('applies a model and a BC together', () => {
    expect(resolvePreset(g, { dragModel: other, bc: 0.3 }).drag.value).toEqual({ model: other, bc: 0.3 })
  })
})

describe('clicks', () => {
  it('has the unit defaults and chips', () => {
    expect(defaultClick('mil')).toBe(0.1)
    expect(defaultClick('moa')).toBe(0.25)
    expect(CLICK_CHIPS).toEqual({ mil: [0.1, 0.05], moa: [0.25, 0.125] })
  })
})

// What a link would carry, written by hand: base64url of a JSON text.
const b64 = (json: string) => btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('the overrides in a shared link (I3)', () => {
  const o: Overrides = {
    muzzleVelocityMs: 905.3, truedAtM: 548.64, sightHeightMm: 0.1 + 64.9, bc: 0.3219999, dragModel: 'G1', zeroM: 125,
    clickValue: 0.125, travelUp: null, scopeUnit: 'moa', groupShots: 5, mvSdMs: 0, powderSensMsPerC: 1 / 3,
  }

  it('round-trips every kind of field exactly, in URL-safe characters', () => {
    const text = writeLinkOverrides(o)!
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(new URLSearchParams({ o: text }).toString()).toBe(`o=${text}`)
    expect(readLinkOverrides(text)).toEqual(o)
    expect(readLinkOverrides(writeLinkOverrides({ travelUp: 20, scopeUnit: 'mil' }))).toEqual({ travelUp: 20, scopeUnit: 'mil' })
  })

  it('writes nothing for no overrides and reads nothing from nothing', () => {
    expect(writeLinkOverrides(undefined)).toBeNull()
    expect(writeLinkOverrides({})).toBeNull()
    expect(readLinkOverrides(null)).toBeNull()
    expect(readLinkOverrides('')).toBeNull()
  })

  it('survives garbage: what is not base64 JSON gives nothing, a bad field is dropped and the rest kept', () => {
    for (const bad of ['garbage', '%%%', 'a', b64('not json'), b64('[1,2]'), b64('null'), b64('"x"'), b64('{"muzzleVelocityMs":"fast"}')]) {
      expect(readLinkOverrides(bad), bad).toBeNull()
    }
    expect(readLinkOverrides(b64('{"muzzleVelocityMs":"fast","sightHeightMm":65,"dragModel":"G9","zzz":1}'))).toEqual({ sightHeightMm: 65 })
  })

  it('puts the link on top of the stored values, field by field', () => {
    expect(linkOverrides(undefined, { sightHeightMm: 65 })).toEqual({ sightHeightMm: 65 })
    expect(linkOverrides({ sightHeightMm: 70, zeroM: 200 }, { sightHeightMm: 65, muzzleVelocityMs: 905 }))
      .toEqual({ sightHeightMm: 65, zeroM: 200, muzzleVelocityMs: 905 })
  })

  it('takes a pair whole: a BC with its model, a click and travel with their unit, a trued distance with its MV', () => {
    const stored: Overrides = { dragModel: 'G1', bc: 0.5, clickValue: 0.125, travelUp: 20, scopeUnit: 'moa', muzzleVelocityMs: 910, truedAtM: 800, zeroM: 200 }
    expect(linkOverrides(stored, { bc: 0.33 })).toEqual({ bc: 0.33, clickValue: 0.125, travelUp: 20, scopeUnit: 'moa', muzzleVelocityMs: 910, truedAtM: 800, zeroM: 200 })
    expect(linkOverrides(stored, { clickValue: 0.1, scopeUnit: 'mil' })).toEqual({ dragModel: 'G1', bc: 0.5, clickValue: 0.1, scopeUnit: 'mil', muzzleVelocityMs: 910, truedAtM: 800, zeroM: 200 })
    expect(linkOverrides(stored, { muzzleVelocityMs: 905 })).toEqual({ dragModel: 'G1', bc: 0.5, clickValue: 0.125, travelUp: 20, scopeUnit: 'moa', muzzleVelocityMs: 905, zeroM: 200 })
  })
})
