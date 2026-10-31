import { describe, expect, it } from 'vitest'
import type { Setup } from '../../settings/url'
import { byName } from './data'
import { resolveSetup, WEAPONS, zeroRange } from './setup'

const raw: Setup = {
  weaponId: byName(WEAPONS, 'M700')!.id,
  barrelId: null,
  scopeId: '',
  zeroM: 100,
  ammoId: '',
  distanceM: 400,
  movement: 'walking',
  posture: 'standing',
  crossing: 90,
  direction: 1,
  accuracyMoa: null,
  rangeSigmaPct: 10,
}

describe('resolveSetup', () => {
  it('keeps the zero on the game\'s 50 m steps, from 100 m on a long rifle and from 50 m otherwise', () => {
    const m4a1 = byName(WEAPONS, 'M4A1')!.id
    expect(resolveSetup({ ...raw, zeroM: 50 }).setup.zeroM).toBe(100)
    expect(resolveSetup({ ...raw, zeroM: 175 }).setup.zeroM).toBe(200)
    expect(resolveSetup({ ...raw, weaponId: m4a1, zeroM: 50 }).setup.zeroM).toBe(50)
  })

  it('gives the zero range of a weapon and scope', () => {
    const r = resolveSetup(raw)
    expect(zeroRange(r.weapon, r.scope)).toEqual({ minM: 100, maxM: 1000, stepM: 50 })
  })

  it('keeps the same ammo list while only the distance or movement changes', () => {
    // Trajectories are memoised on this array; a new one on every slider step re-solves every round.
    expect(resolveSetup({ ...raw, distanceM: 600, movement: 'sprinting' }).ammoList).toBe(resolveSetup(raw).ammoList)
  })
})
