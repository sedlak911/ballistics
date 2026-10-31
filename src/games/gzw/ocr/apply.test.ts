import { describe, expect, it } from 'vitest'
import { byName, gzw } from '../data'
import { applyImport, fastestWeapon } from './apply'

const m4a1 = byName(gzw.weapons, 'M4A1')!
const m700 = byName(gzw.weapons, 'M700')!
const m855 = byName(gzw.ammo, '5.56x45mm AP (M855)')!
const barrel16 = byName(gzw.barrels, 'AR-15 Barrel - 16"')!

describe('applyImport', () => {
  it('switches to the chosen weapon, with its barrel, accuracy and round', () => {
    const r = applyImport({ weapon: m4a1, barrel: barrel16, scope: null, accuracyMoa: 1.76, ammo: m855 }, { currentWeapon: m700 })
    expect(r.setup).toEqual({ weaponId: m4a1.id, barrelId: barrel16.id, accuracyMoa: 1.76, ammoId: m855.id })
  })

  it('keeps the setup as it is for a weapon the app cannot show', () => {
    const akm = byName(gzw.weapons, 'AKM')!
    const r = applyImport({ weapon: akm, barrel: null, scope: null, accuracyMoa: 3.5, ammo: null }, { currentWeapon: m4a1 })
    expect(r.setup).toEqual({})
  })

  it('changes nothing when the round does not fit the current weapon', () => {
    const r = applyImport({ weapon: null, barrel: null, scope: null, accuracyMoa: null, ammo: m855 }, { currentWeapon: m700 })
    expect(r.setup).toEqual({})
  })
})

describe('fastestWeapon', () => {
  it('takes the highest muzzle velocity, each weapon with its best round', () => {
    // M855A1 leaves the M4A1 at 970 m/s; M61, the M700's best, at 838 m/s.
    expect(fastestWeapon([m700, m4a1], { barrels: [], ammo: [] })?.name).toBe('M4A1')
  })

  it('counts the rounds and barrel found on the screen', () => {
    // 5.56 HPBT 861 m/s against M61 through the 26" heavy barrel (+6 %), 888 m/s.
    const hpbt = byName(gzw.ammo, '5.56x45mm HPBT')!
    const m61 = byName(gzw.ammo, '7.62x51mm AP (M61)')!
    const heavy = byName(gzw.barrels, 'M700 Heavy Barrel - 26"')!
    expect(fastestWeapon([m4a1, m700], { barrels: [heavy], ammo: [hpbt, m61] })?.name).toBe('M700')
  })

  it('passes over a weapon the app cannot show', () => {
    const akm = byName(gzw.weapons, 'AKM')!
    expect(fastestWeapon([akm], { barrels: [], ammo: [] })).toBeNull()
  })
})
