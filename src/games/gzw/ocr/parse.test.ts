import { describe, expect, it } from 'vitest'
import { byName, gzw } from '../data'
import { foldLabel, parseOcrText } from './parse'

// Real tesseract.js output for the owner's screenshots (2026-10-30), preprocessed as in preprocess.ts.
const WEAPON_PANEL = 'M4A1 | Pe | - | A SERRE | 4 | Ad | 100 % | 1.76 MOA | 22% | 46 % | -2% | -10 % | Fo | Assault Rifle | Single / Auto | 800 rpm | COLT | M4 Buff... | DD Butts. | M4 Upper | Moe ML... | M-Lok 3 | M600IB | M-Lok 3 | AN/PEQ. | 2 - | - | - | Py | o | - | - | SR | M- | RVG | AR-1516" | JPGS-10D | KAC QD | QDSS N | MicroR... | - | t | . | P | AR15 Mag | Supreme | EXPSZ | DD Grip | Z5 | Ie | 11 | a | an'.split(' | ')
const GEAR_SCREEN = 'CHARACTER | GEAR | AR15 | AR1S | ARIS | ARIS | M855... | FMJS.. | FM 5. | FMI Sy. | EKP-8-... | EKP-8-... | Micro | EKP-8-... | Micro | Micro | M855. | Micro | Micro | EKP-8-... | MK18 | EKP-8-... | EKP-8-... | EKP-8-... | EKP-8-... | Micro | EKP-8-.. | EKP-8-.. | Micro | EKP-8-.. | M855... | M855 | M855. | M855... | M855. | M855. | M855. | M8555.'.split(' | ')

const m4a1 = byName(gzw.weapons, 'M4A1')!
const m700 = byName(gzw.weapons, 'M700')!

describe('foldLabel', () => {
  it('drops punctuation and folds letters OCR mistakes for digits', () => {
    expect(foldLabel('AR-15 16"')).toBe('AR1516')
    expect(foldLabel('ARIS')).toBe('AR15')
    expect(foldLabel('EXPSZ')).toBe('EXP52')
    expect(foldLabel('m855...')).toBe('M855')
  })
})

describe('parseOcrText', () => {
  it('reads the weapon, barrel and accuracy off the weapon panel', () => {
    const f = parseOcrText(WEAPON_PANEL, { data: gzw, currentWeapon: m700 })
    expect(f.weapons.map((w) => w.name)).toEqual(['M4A1'])
    expect(f.barrels.map((b) => b.name)).toEqual(['AR-15 Barrel - 16"'])
    expect(f.accuracyMoa).toBe(1.76)
    expect(f.scopes).toEqual([])
    expect(f.ammo).toEqual([])
  })

  it('finds the ammo on the gear screen, settling truncated labels by context', () => {
    const f = parseOcrText(GEAR_SCREEN, { data: gzw, currentWeapon: m4a1 })
    const found = Object.fromEntries(f.ammo.map((a) => [a.ammo.name, a.stacks]))
    expect(found['5.56x45mm AP (M855)']).toBeGreaterThanOrEqual(8)
    expect(found['5.56x45mm FMJ']).toBeGreaterThanOrEqual(1)
    expect(Object.keys(found).every((n) => n.startsWith('5.56x45mm'))).toBe(true)
    expect(f.weapons).toEqual([])
    expect(f.unknown).toContain('MK18')
  })

  it('finds nothing in unrelated text', () => {
    const f = parseOcrText(['hello', 'world', '1234', 'The quick brown fox'], { data: gzw, currentWeapon: m4a1 })
    expect(f).toEqual({ weapons: [], barrels: [], scopes: [], accuracyMoa: null, ammo: [], ambiguous: [], unknown: [] })
  })

  it('collects every weapon on the screen, in order, once each', () => {
    const f = parseOcrText(['M4A1', 'M700 7.62x51mm', 'Glock 17', 'M4A1'], { data: gzw, currentWeapon: m700 })
    expect(f.weapons.map((w) => w.name)).toEqual(['M4A1', 'M700', 'Glock 17'])
  })

  it('settles a round by any weapon on the screen, not only the first', () => {
    const f = parseOcrText(['AKM', 'M700', 'HPBT..'], { data: gzw, currentWeapon: m4a1 })
    expect(f.ammo.map((a) => a.ammo.name)).toEqual(['7.62x51mm HPBT'])
    expect(f.ambiguous).toEqual([])
  })

  it('ignores an accuracy outside what any weapon has', () => {
    expect(parseOcrText(['99.5 MOA'], { data: gzw, currentWeapon: m4a1 }).accuracyMoa).toBeNull()
    expect(parseOcrText(['0.05 MOA'], { data: gzw, currentWeapon: m4a1 }).accuracyMoa).toBeNull()
  })

  it('leaves a truncated label it cannot settle for the owner to pick', () => {
    const f = parseOcrText(['M855..'], { data: gzw, currentWeapon: m4a1 })
    expect(f.ammo).toEqual([])
    expect(f.ambiguous).toHaveLength(1)
    expect(f.ambiguous[0].candidates.map((a) => a.name).sort()).toEqual(['5.56x45mm AP (M855)', '5.56x45mm AP (M855A1)'])
  })
})
