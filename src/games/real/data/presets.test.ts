import { describe, expect, it } from 'vitest'
import { M33_CD } from '../../../engine/__fixtures__/m33'
import { DEFAULT_REAL_PROFILE, EFFECTS, type Effect } from '../profile'
import { resolvePreset } from '../profiles'
import { DEFAULT_SETUP } from '../setup'
import { solveReal } from '../solve'
import { STANDARD_STATION } from '../station'
import { DEFAULT_PRESET_ID, PRESETS, rifles, roundsFor } from './presets'

const byId = (id: string) => PRESETS.find((p) => p.id === id)!
const isPositive = (n: number) => Number.isFinite(n) && n > 0

describe('REAL presets', () => {
  it('has P1-P9 then custom with unique ids', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'custom'])
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    expect(byId(DEFAULT_PRESET_ID)).toBeDefined()
  })

  it('has a short rifle name (1-10 characters) and a calibre (1-8) for the phone tags', () => {
    for (const p of PRESETS) {
      expect(p.rifleShort.length, p.id).toBeGreaterThanOrEqual(1)
      expect(p.rifleShort.length, p.id).toBeLessThanOrEqual(10)
      expect(p.calibre.length, p.id).toBeGreaterThanOrEqual(1)
      expect(p.calibre.length, p.id).toBeLessThanOrEqual(8)
    }
  })

  it('has finite positive numbers everywhere they are required', () => {
    for (const p of PRESETS) {
      const numbers = [
        p.twistIn.value, p.sightHeightMm.value, p.accuracyMoa.value, p.muzzleVelocityMs.value,
        p.bullet.massGr.value, p.bullet.diameterIn.value,
        ...(p.bullet.lengthMm ? [p.bullet.lengthMm.value] : []),
      ]
      for (const n of numbers) expect(isPositive(n), `${p.id}: ${n}`).toBe(true)
      expect(Number.isFinite(p.mvRefTempC.value)).toBe(true)
      expect(p.powderSensMsPerC.value).toBe(0)
      const d = p.drag.value
      if ('table' in d) expect(isPositive(d.sectionalDensity)).toBe(true)
      else expect(isPositive(d.bc)).toBe(true)
      for (const s of [p.barrel, p.twistIn, p.sightHeightMm, p.drag, p.muzzleVelocityMs]) {
        expect(s.source.length, p.id).toBeGreaterThan(0)
      }
    }
  })

  it('leaves P8 without a bullet length', () => {
    expect(byId('p8').bullet.lengthMm).toBeNull()
    for (const p of PRESETS.filter((q) => q.id !== 'p8')) expect(p.bullet.lengthMm).not.toBeNull()
  })

  it('gives P9 McCoy\'s 16 M33 points sorted by Mach, flagged as an estimate', () => {
    const p9 = byId('p9')
    const d = p9.drag.value
    expect('table' in d).toBe(true)
    if (!('table' in d)) return
    expect(d.table).toHaveLength(16)
    for (let i = 1; i < d.table.length; i++) expect(d.table[i][0]).toBeGreaterThan(d.table[i - 1][0])
    expect(d.sectionalDensity).toBe(0.3564)
    expect(p9.drag.trust).toBe('N')
    expect(p9.drag.source).toContain('McCoy')
  })

  it('trusts P6 and P7 drag as V or S', () => {
    expect(['V', 'S']).toContain(byId('p6').drag.trust)
    expect(['V', 'S']).toContain(byId('p7').drag.trust)
  })

  it('has a short round name for the tag: calibre, bullet and weight, at most 22 characters (I5)', () => {
    expect(byId('p7').short).toBe('.338 LM Scenar 250')
    for (const p of PRESETS) {
      expect(p.short.length, p.id).toBeGreaterThan(0)
      expect(p.short.length, p.short).toBeLessThanOrEqual(22)
    }
  })

  it('groups rounds by rifle', () => {
    expect(rifles()[0]).toBe('CZ BREN 2 14″')
    expect(rifles().filter((r) => r === 'Desert Tech HTI')).toHaveLength(1)
    expect(roundsFor('Desert Tech HTI').map((p) => p.id)).toEqual(['p8', 'p9'])
  })

  it('has a custom entry of all N estimates', () => {
    const c = byId('custom')
    expect(c.drag.value).toEqual({ model: 'G7', bc: 0.3 })
    expect(c.muzzleVelocityMs.value).toBe(800)
    expect(c.twistIn.value).toBe(10)
    expect(c.sightHeightMm.value).toBe(60)
    expect(c.accuracyMoa.value).toBe(1)
    expect(c.groupShots).toBe(3)
    expect(c.accuracyMoa.trust).toBe('N')
    expect(c.drag.source).toBe('your entry')
  })
})

// M5: the guard against a typo in a BC, an MV or a sight height. Research §6 (docs/superpowers/research/
// 2026-10-31-czech-rifles-ammo.md, "Kontrolní výpočet presetů"): the elevation in mrad above a 100 m zero at ICAO
// (15 °C, 0 m), with the preset's sight height and nothing else (spin drift is its own column there). These are the
// research's printed figures, not our own output; a dash in the table (P1 and P2 past 1000 m, P3 and P4 at 2000 m) has
// no anchor. P9 differs on purpose: the research flew G7 0.32, the preset flies McCoy's measured curve.
const RESEARCH_ELEVATION_MRAD: Record<string, Record<number, number>> = {
  p1: { 600: 5.70, 1000: 18.6 },
  p2: { 600: 7.43, 1000: 23.0 },
  p3: { 600: 5.38, 1000: 15.3, 1500: 37.3 },
  p4: { 600: 6.31, 1000: 16.9, 1500: 39.0 },
  p5: { 600: 5.76, 1000: 15.2, 1500: 35.4, 2000: 64.4 },
  p6: { 600: 4.18, 1000: 9.42, 1500: 19.3, 2000: 35.1 },
  p7: { 600: 3.52, 1000: 8.28, 1500: 18.0, 2000: 34.3 },
  p8: { 600: 2.86, 1000: 6.52, 1500: 13.0, 2000: 23.0 },
}
const ALL_OFF = { ...DEFAULT_REAL_PROFILE, effects: Object.fromEntries(EFFECTS.map((e) => [e, false])) as Record<Effect, boolean> }
const anchors = Object.entries(RESEARCH_ELEVATION_MRAD).flatMap(([id, row]) =>
  Object.entries(row).map(([d, mrad]) => ({ id, d: Number(d), mrad })),
)

describe('REAL presets against the research (M5)', () => {
  it.each(anchors)('$id at $d m: $mrad mrad, to 0.05', ({ id, d, mrad }) => {
    const preset = resolvePreset(byId(id), undefined)
    const s = solveReal(preset, { ...DEFAULT_SETUP, presetId: id, distanceM: d }, ALL_OFF, STANDARD_STATION, 'mil', { shares: false, hit: false })
    expect(s.reached).toBe(true)
    expect(Math.abs(s.elevation - mrad), `${s.elevation.toFixed(3)} vs ${mrad}`).toBeLessThanOrEqual(0.05)
  })

  it('flies P9 on the same M33 table the engine is validated against', () => {
    const d = byId('p9').drag.value
    expect('table' in d && d.table).toEqual(M33_CD)
  })
})
