import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, readProfile, type Profile } from './profile'

describe('readProfile', () => {
  it('falls back to the defaults for garbage', () => {
    expect(readProfile(null)).toEqual(DEFAULT_PROFILE)
    expect(readProfile('x')).toEqual(DEFAULT_PROFILE)
    expect(readProfile([1, 2])).toEqual(DEFAULT_PROFILE)
  })

  it('starts on the head, kneeling', () => {
    expect(DEFAULT_PROFILE.aimZone).toBe('head')
    expect(DEFAULT_PROFILE.steadiness).toBe('kneeling')
  })

  it('drops bad enum values', () => {
    const p = readProfile({ steadiness: 'flying', aimZone: 'feet', rangeBy: 'feel' })
    expect(p.steadiness).toBe('kneeling')
    expect(p.aimZone).toBe('head')
    expect(p.rangeBy).toBe('distance')
  })

  it('forgets the old vendor ranks and inventory', () => {
    const p = readProfile({ vendors: { Gunny: 2 }, ownedAmmo: ['m80'], ownedWeapons: ['m700'], steadiness: 'standing' })
    expect(p).toEqual({ ...DEFAULT_PROFILE, steadiness: 'standing' })
  })

  it('reads the old supported hold as prone, the game having no rest', () => {
    expect(readProfile({ steadiness: 'supported' }).steadiness).toBe('prone')
    expect(readProfile({ steadiness: 'prone' }).steadiness).toBe('prone')
  })

  it('round-trips a valid profile', () => {
    const p: Profile = { steadiness: 'prone', aimZone: 'chest', setupDone: true, rangeBy: 'height' }
    expect(readProfile(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })
})
