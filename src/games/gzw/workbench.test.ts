import { describe, expect, it } from 'vitest'
import { byId, byName, gzw } from './data'
import type { GzwData } from './types'
import { accuracyFor, projectileFor, workbenchAmmo, workbenchWeapons } from './workbench'

const weapon = (name: string) => byName(gzw.weapons, name)!

describe('workbenchWeapons', () => {
  it('lists scoped rifles and leaves out shotguns', () => {
    const names = workbenchWeapons(gzw).map((w) => w.name)
    expect(names).toEqual(expect.arrayContaining(['M700', 'SVD', 'M4A1']))
    expect(names).not.toContain('Mossberg 590')
  })

  it('leaves out weapons whose ammo has no muzzle velocity', () => {
    const stripped: GzwData = { ...gzw, ammo: gzw.ammo.map((a) => (a.caliber === '7.62x51mm' ? { ...a, muzzleVelocityMs: null } : a)) }
    expect(workbenchWeapons(stripped).map((w) => w.name)).not.toContain('M700')
  })
})

describe('workbenchAmmo', () => {
  it('lists the five M700 rounds, best penetration first', () => {
    const list = workbenchAmmo(gzw, weapon('M700'))
    expect(list).toHaveLength(5)
    expect(list[0].name).toBe('7.62x51mm AP (M61)')
  })

  it('skips rounds without a muzzle velocity', () => {
    const m80 = byName(gzw.ammo, '7.62x51mm FMJ (M80)')!
    const stripped: GzwData = { ...gzw, ammo: gzw.ammo.map((a) => (a.id === m80.id ? { ...a, muzzleVelocityMs: null } : a)) }
    expect(workbenchAmmo(stripped, weapon('M700')).map((a) => a.id)).not.toContain(m80.id)
  })
})

describe('accuracyFor', () => {
  it('uses the barrel accuracy and the ammo modifier', () => {
    // M80A1 is +3 % (a tighter group) in the wiki's Ballistics chart; its ammo page has the sign flipped.
    const acc = accuracyFor(weapon('M700'), byName(gzw.barrels, 'M700 Barrel - 22"')!, byName(gzw.ammo, '7.62x51mm FMJ (M80A1)')!)
    expect(acc).toBeCloseTo(0.61 * 0.97, 4)
  })

  it('is unknown when neither the weapon nor the barrel has a value', () => {
    expect(accuracyFor(weapon('SKS'), null, byName(gzw.ammo, '7.62x39mm PS (57-N-231C)')!)).toBeNull()
  })

  it('uses the accuracy read from the weapon panel instead of the barrel, still with the ammo modifier', () => {
    const m80a1 = byName(gzw.ammo, '7.62x51mm FMJ (M80A1)')!
    expect(accuracyFor(weapon('M700'), byName(gzw.barrels, 'M700 Barrel - 22"')!, m80a1, 1.76)).toBeCloseTo(1.76 * 0.97, 4)
    expect(accuracyFor(weapon('SKS'), null, byName(gzw.ammo, '7.62x39mm PS (57-N-231C)')!, 2)).not.toBeNull()
  })
})

describe('projectileFor', () => {
  it('applies the barrel velocity modifier and a sourced BC', () => {
    const m80 = byName(gzw.ammo, '7.62x51mm FMJ (M80)')!
    const heavy = byName(gzw.barrels, 'M700 Heavy Barrel - 26"')!
    const { projectile, genericBc } = projectileFor(m80, heavy)
    expect(projectile.muzzleVelocityMs).toBeCloseTo(817 * 1.06, 6)
    expect(projectile.dragModel).toBe('G7')
    expect(genericBc).toBe(false)
  })

  it('applies the 20" AR-15 barrel\'s +20 % from its wiki infobox', () => {
    const m855 = byName(gzw.ammo, '5.56x45mm AP (M855)')!
    const { projectile } = projectileFor(m855, byName(gzw.barrels, 'AR-15 Barrel - 20"')!)
    expect(projectile.muzzleVelocityMs).toBeCloseTo(920 * 1.2, 6)
  })

  it('keeps the round\'s own speed through a barrel whose modifier is unknown', () => {
    const m80 = byName(gzw.ammo, '7.62x51mm FMJ (M80)')!
    const barrel = { ...byName(gzw.barrels, 'M700 Barrel - 22"')!, velocityModifierPct: null }
    expect(projectileFor(m80, barrel).projectile.muzzleVelocityMs).toBe(m80.muzzleVelocityMs)
  })

  it('gets a positive speed for every round of every weapon on the bench', () => {
    // A zero speed would give a one-point trajectory; workbenchAmmo must keep such rounds out.
    for (const w of workbenchWeapons(gzw)) {
      for (const a of workbenchAmmo(gzw, w)) {
        expect(a.muzzleVelocityMs, `${w.name} / ${a.name}`).toBeGreaterThan(0)
        for (const id of [null, ...w.barrelIds]) {
          const barrel = id === null ? null : byId(gzw.barrels, id)!
          expect(projectileFor(a, barrel).projectile.muzzleVelocityMs, `${w.name} / ${a.name} / ${id}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('falls back to the caliber BC and says so', () => {
    const m62 = byName(gzw.ammo, '7.62x51mm Tracer (M62)')!
    const { projectile, genericBc } = projectileFor(m62, null)
    expect(projectile.muzzleVelocityMs).toBe(820)
    expect(genericBc).toBe(true)
  })
})
