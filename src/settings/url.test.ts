import { describe, expect, it } from 'vitest'
import { hasSetupParams, readDisplay, readSetup, writeSetup, type Display, type Setup } from './url'

const defaults: Setup = {
  weaponId: 'm700', barrelId: 'm700-barrel', scopeId: 'vudu', zeroM: 100, ammoId: 'm80a1',
  distanceM: 400, movement: 'sprinting', posture: 'standing', crossing: 90, direction: 1,
  accuracyMoa: null, rangeSigmaPct: 10,
}
const known = new Set(['m700', 'svd', 'm700-barrel', 'vudu', 'pso', 'm80a1', 'm61', 'recon'])
const isValidId = (_field: string, id: string) => known.has(id)
const display: Display = { lang: 'en', system: 'metric', angle: 'mil' }

describe('readSetup', () => {
  it('falls back to defaults for unknown ids and garbage values', () => {
    const s = readSetup(new URLSearchParams('w=deleted-gun&z=abc&d=-5&mv=flying&x=60&dir=7'), isValidId, defaults)
    expect(s).toEqual(defaults)
  })

  it('clamps distance to 50–1000 m', () => {
    expect(readSetup(new URLSearchParams('d=5000'), isValidId, defaults).distanceM).toBe(1000)
    expect(readSetup(new URLSearchParams('d=30'), isValidId, defaults).distanceM).toBe(50)
  })

  it('snaps zero to 50 m steps within 50–1000 m', () => {
    expect(readSetup(new URLSearchParams('z=110'), isValidId, defaults).zeroM).toBe(100)
    expect(readSetup(new URLSearchParams('z=130'), isValidId, defaults).zeroM).toBe(150)
    expect(readSetup(new URLSearchParams('z=5'), isValidId, defaults).zeroM).toBe(50)
    expect(readSetup(new URLSearchParams('z=4000'), isValidId, defaults).zeroM).toBe(1000)
  })

  it('reads the real accuracy and the distance uncertainty, clamped', () => {
    const s = readSetup(new URLSearchParams('acc=1.76&rs=7'), isValidId, defaults)
    expect(s.accuracyMoa).toBe(1.76)
    expect(s.rangeSigmaPct).toBe(7)
    expect(readSetup(new URLSearchParams('acc=abc'), isValidId, defaults).accuracyMoa).toBeNull()
    expect(readSetup(new URLSearchParams('acc=none'), isValidId, defaults).accuracyMoa).toBeNull()
    expect(readSetup(new URLSearchParams('acc=99'), isValidId, defaults).accuracyMoa).toBe(20)
    expect(readSetup(new URLSearchParams('rs=0'), isValidId, defaults).rangeSigmaPct).toBe(1)
    expect(readSetup(new URLSearchParams('rs=99'), isValidId, defaults).rangeSigmaPct).toBe(50)
    expect(readSetup(new URLSearchParams('rs=x'), isValidId, defaults).rangeSigmaPct).toBe(10)
  })

  it('keeps a kneeling target still', () => {
    const s = readSetup(new URLSearchParams('po=kneeling&mv=sprinting'), isValidId, defaults)
    expect(s.posture).toBe('kneeling')
    expect(s.movement).toBe('standing')
    expect(readSetup(new URLSearchParams('po=lying'), isValidId, defaults).posture).toBe('standing')
  })

  it('keeps a prone target still', () => {
    const s = readSetup(new URLSearchParams('po=prone&mv=jogging'), isValidId, defaults)
    expect(s.posture).toBe('prone')
    expect(s.movement).toBe('standing')
  })

  it('accepts "none" for the barrel and ignores the old armor keys', () => {
    const s = readSetup(new URLSearchParams('h=none&t=recon&b=none'), isValidId, defaults)
    expect(s.barrelId).toBeNull()
    expect(s).not.toHaveProperty('helmetId')
    expect(writeSetup(s, display).has('t')).toBe(false)
  })

  it('round-trips through writeSetup', () => {
    const s: Setup = {
      weaponId: 'svd', barrelId: null, scopeId: 'pso', zeroM: 300, ammoId: 'm61', distanceM: 625,
      movement: 'standing', posture: 'kneeling', crossing: 45, direction: -1,
      accuracyMoa: 1.76, rangeSigmaPct: 7,
    }
    expect(readSetup(writeSetup(s, display), isValidId, defaults)).toEqual(s)
  })
})

describe('hasSetupParams', () => {
  it('is true only when the link carries at least one setup key', () => {
    expect(hasSetupParams(new URLSearchParams(''))).toBe(false)
    expect(hasSetupParams(new URLSearchParams('l=cs&u=imperial&a=moa'))).toBe(false)
    expect(hasSetupParams(new URLSearchParams('d=600'))).toBe(true)
    expect(hasSetupParams(new URLSearchParams('rs=5'))).toBe(true)
    expect(hasSetupParams(writeSetup(defaults, display))).toBe(true)
  })
})

describe('readDisplay', () => {
  it('prefers URL params, then stored values, then defaults', () => {
    expect(readDisplay(new URLSearchParams('l=cs'), { system: 'imperial' })).toEqual({ lang: 'cs', system: 'imperial', angle: 'mil' })
    expect(readDisplay(new URLSearchParams('l=xx&u=furlongs&a=deg'), {})).toEqual(display)
  })

  it('ignores the old view switch in links and storage', () => {
    expect(readDisplay(new URLSearchParams('v=full'), { view: 'full' } as never)).toEqual(display)
    expect(writeSetup(defaults, display).has('v')).toBe(false)
  })

  it('round-trips through writeSetup', () => {
    const d: Display = { lang: 'cs', system: 'imperial', angle: 'moa' }
    expect(readDisplay(writeSetup(defaults, d), {})).toEqual(d)
  })
})
