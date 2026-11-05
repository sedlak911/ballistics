import { describe, expect, it } from 'vitest'
import type { AngleUnit } from '../../engine/units'
import { translate } from '../../i18n'
import { PRESETS } from './data/presets'
import type { CustomRound } from './library'
import { DEFAULT_REAL_PROFILE, EFFECTS, type Effect, type RealProfile } from './profile'
import { resolvePreset, type Overrides, type ResolvedPreset } from './profiles'
import { resolveSelection } from './selection'
import { DEFAULT_SETUP, type RealSetup } from './setup'
import { windAtBy } from './zones'
import { isYours } from './components/calcText'
import { solveReal, trueReal, type RealSolution } from './solve'
import { STANDARD_STATION, type Station } from './station'

const ALL = { shares: true, hit: true }

interface Case {
  id?: string
  o?: Overrides
  /** A load resolved elsewhere (a custom one), in place of `id` and `o`. */
  preset?: ResolvedPreset
  setup?: Partial<RealSetup>
  effects?: Partial<Record<Effect, boolean>>
  profile?: Partial<Omit<RealProfile, 'effects'>>
  station?: Partial<Station>
  unit?: AngleUnit
  need?: { shares: boolean; hit: boolean }
}

// P7 with no overrides, ISA at 0 m, 50° N, dial mode, MRAD, unless the case says otherwise.
function solve(c: Case = {}): RealSolution {
  const p = c.preset ?? resolvePreset(PRESETS.find((x) => x.id === (c.id ?? 'p7'))!, c.o)
  const profile = { ...DEFAULT_REAL_PROFILE, ...c.profile, effects: { ...DEFAULT_REAL_PROFILE.effects, ...c.effects } }
  return solveReal(p, { ...DEFAULT_SETUP, ...c.setup }, profile, { ...STANDARD_STATION, ...c.station }, c.unit ?? 'mil', c.need ?? ALL)
}

const manual = (value: number) => ({ value, source: 'manual' as const })

/** A custom rifle and round with the old Custom preset's values (a .308 175 gr), and `round` on top, resolved as the page does. */
function customLoad(round: Partial<CustomRound>): ResolvedPreset {
  const library = {
    v: 1 as const,
    rifles: [{ id: 'u-rifle', name: 'Custom', twistIn: 10, accuracyMoa: 1 }],
    rounds: [{ id: 'u-round', rifleId: 'u-rifle', name: 'Custom', massGr: 175, diameterIn: 0.308, lengthMm: 31.5, mvRefTempC: 15, powderSensMsPerC: 0, ...round }],
    scopes: [],
  }
  return resolveSelection({ ...DEFAULT_SETUP, roundId: 'u-round', customRifleId: 'u-rifle' }, library, {}, undefined, new Set(), false).preset
}
/** A slow, draggy load that doesn't reach 2500 m. */
const SLOW = customLoad({ muzzleVelocityMs: 300, bc: 0.15, dragModel: 'G1' })

function numbersIn(v: unknown, path = ''): [string, number][] {
  if (typeof v === 'number') return [[path, v]]
  if (v === null || typeof v !== 'object') return []
  return Object.entries(v).flatMap(([k, x]) => numbersIn(x, `${path}.${k}`))
}

const share = (s: RealSolution, e: Effect) => {
  const x = s.shares![e]
  if ('missing' in x) throw new Error(`${e} is missing ${x.missing}`)
  return x
}

describe('solveReal: P7 at 1000 m', () => {
  it('elevation is 8.2–8.5 mrad, and the hold is left with no wind (spin drift and Coriolis push right)', () => {
    const s = solve({ setup: { distanceM: 1000 } })
    expect(s.reached).toBe(true)
    expect(s.elevation).toBeGreaterThan(8.2)
    expect(s.elevation).toBeLessThan(8.5)
    expect(s.windage).toBeLessThan(0)
  })

  it('3 m/s from 9 h: windage −1.8 to −1.4 mrad; columns grow in magnitude and the middle is the windage', () => {
    const s = solve({ setup: { distanceM: 1000, windMs: 3, windClock: 9 } })
    expect(s.windage).toBeGreaterThan(-1.8)
    expect(s.windage).toBeLessThan(-1.4)
    expect(s.windSpeeds).toEqual([2, 3, 4])
    const [a, b, c] = s.windColumns.map(Math.abs)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(s.windColumns[1]).toBe(s.windage)
  })

  it('wind from 3 h drifts the hit left, so the hold is right', () => {
    expect(solve({ setup: { distanceM: 1000, windMs: 3, windClock: 3 } }).windage).toBeGreaterThan(0.8)
  })

  it('the outer columns match a full solve at that wind speed', () => {
    const s = solve({ setup: { distanceM: 1000, windMs: 3, windClock: 8 } })
    expect(s.windColumns[0]).toBeCloseTo(solve({ setup: { distanceM: 1000, windMs: 2, windClock: 8 } }).windage, 2)
    expect(s.windColumns[2]).toBeCloseTo(solve({ setup: { distanceM: 1000, windMs: 4, windClock: 8 } }).windage, 2)
  })

  it('1 m/s of full crosswind moves the hit about 42 cm (lag rule: 1.53 s − 1000/900)', () => {
    const s = solve({ setup: { distanceM: 1000 } })
    expect(s.perMsM).toBeGreaterThan(0.39)
    expect(s.perMsM).toBeLessThan(0.45)
    expect(s.perMsM).toBeCloseTo(s.timeS - 1000 / 900, 2)
  })

  it('dials round(elevation / 0.1) clicks', () => {
    for (const distanceM of [100, 300, 1000, 1500]) {
      const s = solve({ setup: { distanceM } })
      expect(s.dial.clicks).toBe(Math.round(s.elevation / 0.1))
    }
  })

  it('wind speeds never go below 0', () => {
    expect(solve({ setup: { windMs: 0.5 } }).windSpeeds).toEqual([0, 0.5, 1.5])
  })
})

describe('solveReal: warnings', () => {
  it('P7 is transonic at 1500 m, P1 subsonic at 800 m', () => {
    // P7: Mach 1.13 at 1250 m.
    expect(solve({ setup: { distanceM: 1250 } }).warnings).toContain('transonic')
    expect(solve({ id: 'p1', setup: { distanceM: 800 } }).warnings).toContain('subsonic')
    expect(solve({ setup: { distanceM: 1000 } }).warnings).not.toContain('transonic')
  })

  it('transonic or subsonic, never both: P7 is transonic at 1250 m and subsonic at 1500 m (Mach 0.94)', () => {
    expect(solve({ setup: { distanceM: 1250 } }).warnings).not.toContain('subsonic')
    const far = solve({ setup: { distanceM: 1500 } }).warnings
    expect(far).toContain('subsonic')
    expect(far).not.toContain('transonic')
  })

  it('P7 is an estimate for its sight height, not once the sight height is measured', () => {
    expect(solve().warnings).toContain('estimate')
    expect(solve({ o: { sightHeightMm: 55 } }).warnings).not.toContain('estimate')
  })

  it('P9 stays an estimate for its BC alone', () => {
    expect(solve({ id: 'p9', o: { sightHeightMm: 70, muzzleVelocityMs: 850 } }).warnings).toContain('estimate')
  })

  it('flags an implausible typed pressure, MV or BC, and nothing for P7 as it is', () => {
    expect(solve().warnings).not.toContain('implausible')
    expect(solve({ station: { pressureHPa: manual(550) } }).warnings).toContain('implausible')
    expect(solve({ station: { pressureKind: 'qnh', pressureHPa: manual(550) } }).warnings).toContain('implausible')
    expect(solve({ o: { muzzleVelocityMs: 150 }, setup: { distanceM: 100 } }).warnings).toContain('implausible')
    expect(solve({ o: { bc: 0.7 } }).warnings).toContain('implausible')
    expect(solve({ o: { bc: 0.1, dragModel: 'G1' } }).warnings).toContain('implausible')
    expect(solve({ o: { bc: 0.5, dragModel: 'G1' } }).warnings).not.toContain('implausible')
  })

  it('checks what was typed: a QNH high up, the standard pressure and a powder-shifted MV are fine', () => {
    // QNH 1013 at 4500 m is a station pressure of 577 hPa; the standard one at 5000 m is 540.
    expect(solve({ station: { pressureKind: 'qnh', pressureHPa: manual(1013), altitudeM: manual(4500) } }).warnings).not.toContain('implausible')
    expect(solve({ station: { altitudeM: manual(5000) } }).warnings).not.toContain('implausible')
    // 1250 m/s as typed; 1475 after the powder shift.
    expect(solve({ o: { muzzleVelocityMs: 1250, powderSensMsPerC: 5 }, station: { powderTempC: manual(60) } }).warnings).not.toContain('implausible')
  })

  it('flags a QNH typed as station pressure: more than 4 % off the standard pressure for the altitude', () => {
    const at800 = { pressureKind: 'station' as const, altitudeM: manual(800), pressureHPa: manual(1013) }
    expect(solve({ station: at800 }).warnings).toContain('implausible')
    expect(solve({ station: { ...at800, pressureKind: 'qnh' } }).warnings).not.toContain('implausible')
    expect(solve({ station: { pressureKind: 'station', pressureHPa: manual(1013) } }).warnings).not.toContain('implausible')
    // I2: at 400 m the ISA station pressure is 966 hPa, so a QNH of 1018 typed as station pressure is 5.4 % over.
    expect(solve({ station: { pressureKind: 'station', altitudeM: manual(400), pressureHPa: manual(1018) } }).warnings).toContain('implausible')
    // A deep low at sea level, 3.3 % under, is weather.
    expect(solve({ station: { pressureKind: 'station', pressureHPa: manual(980) } }).warnings).not.toContain('implausible')
  })

  it('flags a station pressure typed as QNH: more than 4 % off 1013.25', () => {
    const qnh = (v: number, altitudeM = 400) => solve({ station: { pressureKind: 'qnh', altitudeM: manual(altitudeM), pressureHPa: manual(v) } }).warnings
    expect(qnh(965)).toContain('implausible')
    expect(qnh(1018)).not.toContain('implausible')
    expect(qnh(980)).not.toContain('implausible')
    expect(solve({ station: { pressureKind: 'qnh', altitudeM: manual(400) } }).warnings).not.toContain('implausible')
  })

  it('a fresh station is QNH, and its standard pressure is the same air as before: P7 at 1000 m stays 8.276', () => {
    expect(STANDARD_STATION.pressureKind).toBe('qnh')
    for (const pressureKind of ['qnh', 'station'] as const) {
      const s = solve({ setup: { distanceM: 1000 }, station: { pressureKind } })
      expect(Math.abs(s.elevation - 8.276), pressureKind).toBeLessThanOrEqual(0.0015)
      expect(s.warnings).not.toContain('implausible')
    }
  })
})

describe('solveReal: effects', () => {
  it('P8 has no bullet length: spin drift and aerodynamic jump say so, and nothing is NaN (Review Focus 1)', () => {
    for (const distanceM of [100, 1000, 2500]) {
      const s = solve({ id: 'p8', setup: { distanceM, windMs: 3, windClock: 9 } })
      expect(s.shares!.spinDrift).toEqual({ missing: 'bulletLength' })
      expect(s.shares!.aeroJump).toEqual({ missing: 'bulletLength' })
      for (const [path, v] of numbersIn(s)) expect(Number.isFinite(v), `${distanceM} m ${path}`).toBe(true)
    }
  })

  it('every preset gives finite numbers everywhere', () => {
    for (const p of PRESETS)
      for (const distanceM of [25, 300, 1200, 2500]) {
        const s = solve({ id: p.id, setup: { distanceM, windMs: 4, windClock: 2, slopeDeg: -20 } })
        for (const [path, v] of numbersIn(s)) expect(Number.isFinite(v), `${p.id} ${distanceM} m ${path}`).toBe(true)
      }
  }, 30_000) // 40 full solves: ~3 s locally under a parallel run, slower on CI runners

  it('the earth’s curvature moves the elevation by under 0.01 mrad at 2000 m', () => {
    const on = solve({ setup: { distanceM: 2000 } })
    const off = solve({ setup: { distanceM: 2000 }, effects: { curvature: false } })
    expect(Math.abs(on.elevation - off.elevation)).toBeLessThan(0.01)
  })

  it('with no azimuth Coriolis has no vertical share but moves the hit about 8 cm right at 1000 m', () => {
    const c = share(solve({ setup: { distanceM: 1000 } }), 'coriolis')
    expect(Math.abs(c.yM)).toBeLessThan(1e-6)
    expect(c.xM).toBeGreaterThan(0.07)
    expect(c.xM).toBeLessThan(0.09)
  })

  it('a switched-off effect still reports what it would add, the same share as when on', () => {
    const D = 1000
    const c: Case = {
      setup: { distanceM: D, windMs: 3, windClock: 9 },
      station: { tempC: manual(30), humidityPct: manual(80), azimuthDeg: manual(90), powderTempC: manual(35) },
      o: { powderSensMsPerC: 1 },
    }
    const on = solve(c)
    for (const e of EFFECTS) {
      const off = solve({ ...c, effects: { [e]: false } })
      expect(share(on, e).on).toBe(true)
      expect(share(off, e).on).toBe(false)
      expect(share(off, e).yM).toBeCloseTo(share(on, e).yM, 9)
      expect(share(off, e).xM).toBeCloseTo(share(on, e).xM, 9)
      // Switching it off moves the answer by exactly its share: + up is a hit higher, + right a hit further right.
      expect(on.elevation - off.elevation, e).toBeCloseTo((-share(on, e).yM / D) * 1000, 6)
      expect(on.windage - off.windage, e).toBeCloseTo((-share(on, e).xM / D) * 1000, 6)
    }
  })

  it('the shares point the right way: humid air and warm powder lift the hit, spin drift goes right, wind from the left lowers it', () => {
    const s = solve({
      setup: { distanceM: 1000, windMs: 3, windClock: 9 },
      station: { tempC: manual(30), humidityPct: manual(80), azimuthDeg: manual(90), powderTempC: manual(35) },
      o: { powderSensMsPerC: 1 },
    })
    expect(share(s, 'humidity').yM).toBeGreaterThan(0)
    expect(share(s, 'powderTemp').yM).toBeGreaterThan(0)
    expect(share(s, 'spinDrift').xM).toBeGreaterThan(0.1)
    expect(share(s, 'aeroJump').yM).toBeLessThan(0)
    // Shooting east, the Eötvös effect lifts the hit.
    expect(share(s, 'coriolis').yM).toBeGreaterThan(0.03)
    expect(share(s, 'curvature').yM).toBeLessThan(0)
  })
})

describe('solveReal: twist direction (M10)', () => {
  it('a left-hand twist flips spin drift and the aerodynamic jump, and nothing else', () => {
    const setup = { distanceM: 1000, windMs: 3, windClock: 9 }
    const right = solve({ setup })
    const left = solve({ setup, o: { twist: 'left' } })
    expect(share(right, 'spinDrift').xM).toBeGreaterThan(0.1)
    expect(share(left, 'spinDrift').xM).toBeCloseTo(-share(right, 'spinDrift').xM, 9)
    expect(share(left, 'aeroJump').yM).toBeCloseTo(-share(right, 'aeroJump').yM, 9)
    // Coriolis stays, to a micrometre (its run differs from the base in flight time, so a hair of spin drift rides along).
    expect(share(left, 'coriolis').xM).toBeCloseTo(share(right, 'coriolis').xM, 6)
    expect(share(left, 'coriolis').yM).toBeCloseTo(share(right, 'coriolis').yM, 6)
    expect(left.explain!.twist).toBe('left')
    // Spin drift and jump move the hit: the hold left grows by twice the drift.
    expect(left.explain!.hitXM - right.explain!.hitXM).toBeCloseTo(-2 * share(right, 'spinDrift').xM, 6)
  })
})

describe('solveReal: the zero (R8)', () => {
  const cold: Case = { o: { powderSensMsPerC: 1 }, station: { powderTempC: manual(-5) } }

  it('stays zeroed at the reference MV, so cold powder moves the hit even at the zero distance', () => {
    expect(Math.abs(solve({ setup: { distanceM: 100 } }).elevation)).toBeLessThan(0.005)
    expect(solve({ ...cold, setup: { distanceM: 100 } }).elevation).toBeGreaterThan(0.02)
  })

  it('cold powder raises the elevation at 1000 m; switched off, the reference MV goes in', () => {
    const ref = solve({ setup: { distanceM: 1000 } })
    expect(solve({ ...cold, setup: { distanceM: 1000 } }).elevation).toBeGreaterThan(ref.elevation + 0.2)
    expect(solve({ ...cold, setup: { distanceM: 1000 }, effects: { powderTemp: false } }).elevation).toBeCloseTo(ref.elevation, 9)
  })
})

describe('solveReal: what is asked for', () => {
  it('leaves out the shares and the hit chance when not needed', () => {
    const s = solve({ need: { shares: false, hit: false } })
    expect(s.shares).toBeNull()
    expect(s.hit).toBeNull()
    const full = solve()
    expect(s.elevation).toBe(full.elevation)
    expect(s.windage).toBe(full.windage)
    expect(s.perMsM).toBe(full.perMsM)
    expect(solve({ need: { shares: true, hit: false } }).hit).toBeNull()
    expect(solve({ need: { shares: false, hit: true } }).shares).toBeNull()
  })

  it('refuses when the bullet doesn’t reach the distance', () => {
    const s = solve({ preset: SLOW, setup: { distanceM: 2500 } })
    expect(s.reached).toBe(false)
    expect(s.shares).toBeNull()
    expect(s.hit).toBeNull()
    expect(s.elevation).toBe(0)
    for (const [path, v] of numbersIn(s)) expect(Number.isFinite(v), path).toBe(true)
  })
})

describe('solveReal: hit chance', () => {
  it('P7 on a 50 cm target at 1000 m: the wind guess costs the most', () => {
    const h = solve({ setup: { distanceM: 1000, targetCm: 50 } }).hit!
    expect(h.chance).toBeGreaterThan(0.2)
    expect(h.chance).toBeLessThan(0.6)
    expect(h.dominant).toBe('wind')
    expect(h.sigmaX).toBeGreaterThan(h.sigmaY)
    // 1 MOA at 1000 m is 29 cm wide.
    expect(h.group!.widthM).toBeCloseTo(0.291, 2)
  })

  it('a bigger target is easier', () => {
    const small = solve({ setup: { distanceM: 800, targetCm: 30 } }).hit!.chance
    const big = solve({ setup: { distanceM: 800, targetCm: 100 } }).hit!.chance
    expect(big).toBeGreaterThan(small)
  })
})

describe('solveReal: the scope (R2: scope values carry their unit)', () => {
  it('in MOA the figures are 3.44× the MRAD ones', () => {
    const mil = solve({ setup: { distanceM: 1000 } })
    const moa = solve({ setup: { distanceM: 1000 }, unit: 'moa' })
    expect(moa.unit).toBe('moa')
    expect(moa.elevation).toBeCloseTo(mil.elevation * 3.4377, 3)
    expect(moa.dial.clicks).toBe(Math.round(moa.elevation / 0.25))
  })

  it('a travel stored in MRAD caps the dial in MRAD', () => {
    expect(solve({ setup: { distanceM: 1000 }, o: { travelUp: 5, scopeUnit: 'mil' } }).dial.hold).toBeGreaterThan(3)
  })

  it('a travel stored in MOA is kept in MOA: P7 at 1500 m dials 80 clicks and holds the rest', () => {
    const s = solve({ setup: { distanceM: 1500 }, o: { travelUp: 20, scopeUnit: 'moa' }, unit: 'moa' })
    expect(s.dial.clicks).toBe(80)
    expect(s.dial.hold).toBeCloseTo(s.elevation - 20, 9)
    expect(s.inputs.find((i) => i.key === 'travelUp')).toMatchObject({ value: 20, unit: 'MOA', source: 'yours' })
  })

  it('a travel stored in MRAD and shown in MOA is unknown: no hold split, ¼ MOA clicks', () => {
    const s = solve({ setup: { distanceM: 1500 }, o: { travelUp: 20, scopeUnit: 'mil' }, unit: 'moa' })
    expect(s.dial.hold).toBe(0)
    expect(s.dial.clicks).toBe(Math.round(s.elevation / 0.25))
    expect(s.inputs.find((i) => i.key === 'travelUp')).toBeUndefined()
    expect(s.inputs.find((i) => i.key === 'clickValue')).toMatchObject({ value: 0.25, source: 'default' })
  })

  it('without a stored unit the unit’s defaults apply: default click, unknown travel', () => {
    const moa = solve({ setup: { distanceM: 1500 }, o: { travelUp: 20 }, unit: 'moa' })
    expect(moa.dial.hold).toBe(0)
    expect(moa.dial.clicks).toBe(Math.round(moa.elevation / 0.25))
    expect(solve({ setup: { distanceM: 1000 }, o: { travelUp: 5 } }).dial.hold).toBe(0)
  })

  it('a ⅛ MOA click stored in MOA is kept; a click that is no MOA chip falls back to ¼ and keeps the travel', () => {
    const eighth = solve({ setup: { distanceM: 1000 }, o: { clickValue: 0.125, scopeUnit: 'moa' }, unit: 'moa' })
    expect(eighth.dial.clicks).toBe(Math.round(eighth.elevation / 0.125))
    const odd = solve({ setup: { distanceM: 1500 }, o: { clickValue: 0.1, travelUp: 20, scopeUnit: 'moa' }, unit: 'moa' })
    expect(odd.dial.clicks).toBe(80)
    expect(odd.dial.hold).toBeGreaterThan(0)
  })
})

describe('solveReal: regression anchors (P7, 1000 m, ISA 0 m, 50° N, MRAD, no overrides)', () => {
  const near = (actual: number, expected: number, tol = 0.0015) =>
    expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol)

  it('calm', () => {
    const s = solve({ setup: { distanceM: 1000 } })
    near(s.elevation, 8.276)
    near(s.windage, -0.338)
    near(s.perMsM, 0.425)
    near(share(s, 'spinDrift').xM, 0.261)
    near(share(s, 'coriolis').xM, 0.0766, 0.0005)
  })

  it('3 m/s from 9 h', () => {
    const s = solve({ setup: { distanceM: 1000, windMs: 3, windClock: 9 } })
    near(s.windage, -1.613)
    near(share(s, 'aeroJump').yM, -0.0908, 0.0005)
  })
})

describe('solveReal: inputs', () => {
  it('lists the sight height as an estimate and the powder temperature as the air temperature', () => {
    const s = solve()
    expect(s.inputs.find((i) => i.key === 'sightHeightMm')).toEqual({
      key: 'sightHeightMm', value: 60, unit: 'mm', source: 'estimate: nobody publishes the sight height', trust: 'N',
    })
    expect(s.inputs.find((i) => i.key === 'powderTempC')).toMatchObject({ value: 15, source: 'air' })
    expect(s.inputs.find((i) => i.key === 'stationPressureHPa')).toMatchObject({ value: 1013.25, source: 'standard' })
  })

  it('lists where a trued MV was trued, and nothing when it wasn’t', () => {
    expect(solve({ o: { muzzleVelocityMs: 912, truedAtM: 800 } }).inputs.find((i) => i.key === 'truedAtM')).toMatchObject({ value: 800, unit: 'm' })
    expect(solve().inputs.find((i) => i.key === 'truedAtM')).toBeUndefined()
  })

  // One rule with the settings sheet's tags: the scope's values are yours once you set them (fields.tsx presetFields).
  describe('the scope’s zero, click and travel', () => {
    const scopeIn = (s: RealSolution) => Object.fromEntries(['zeroM', 'clickValue', 'travelUp'].map((k) => {
      const i = s.inputs.find((x) => x.key === k) ?? null
      return [k, i === null ? null : { source: i.source, yours: isYours(i, false) }]
    }))

    it('at the preset’s defaults none is yours', () => {
      expect(scopeIn(solve())).toEqual({
        zeroM: { source: 'scope', yours: false }, clickValue: { source: 'default', yours: false }, travelUp: null,
      })
    })

    it('a zero you set on a built-in scope is yours, the click it didn’t touch is not', () => {
      const s = solve({ o: { zeroM: 300 } })
      expect(s.inputs.find((i) => i.key === 'zeroM')).toMatchObject({ value: 300, source: 'yours', trust: 'V' })
      expect(scopeIn(s)).toMatchObject({ zeroM: { yours: true }, clickValue: { source: 'default', yours: false } })
      // Set to the default figure, it is still yours: you set it.
      expect(scopeIn(solve({ o: { zeroM: 100 } })).zeroM).toEqual({ source: 'yours', yours: true })
    })

    it('a click and travel you set in the shown unit are yours; a shared link’s are from the link', () => {
      expect(scopeIn(solve({ o: { clickValue: 0.05, travelUp: 20, scopeUnit: 'mil' } }))).toEqual({
        zeroM: { source: 'scope', yours: false }, clickValue: { source: 'yours', yours: true }, travelUp: { source: 'yours', yours: true },
      })
      const p7 = PRESETS.find((x) => x.id === 'p7')!
      const linked = solve({ preset: resolvePreset(p7, { zeroM: 200, clickValue: 0.1, scopeUnit: 'mil' }, new Set(['zeroM', 'clickValue', 'scopeUnit'])) })
      expect(scopeIn(linked)).toMatchObject({ zeroM: { source: 'link', yours: true }, clickValue: { source: 'link', yours: true } })
      // Stored in MRAD and shown in MOA they aren't the scope's: the default click, no travel.
      expect(scopeIn(solve({ o: { clickValue: 0.05, travelUp: 20, scopeUnit: 'mil' }, unit: 'moa' }))).toMatchObject({
        clickValue: { source: 'default', yours: false }, travelUp: null,
      })
    })

    it('your own scope’s zero, click and travel are yours', () => {
      const library = {
        v: 1 as const, rifles: [], rounds: [],
        scopes: [{ id: 'u-scope', rifleId: 'axsr', name: 'Mine', scopeUnit: 'mil' as const, clickValue: 0.1, zeroM: 100, sightHeightMm: 55, travelUp: 30 }],
      }
      const preset = resolveSelection({ ...DEFAULT_SETUP, scopeId: 'u-scope' }, library, {}, undefined, new Set(), false).preset
      expect(scopeIn(solve({ preset }))).toEqual({
        zeroM: { source: 'yours', yours: true }, clickValue: { source: 'yours', yours: true }, travelUp: { source: 'yours', yours: true },
      })
    })
  })

  it('the muzzle velocity that went in follows the powder temperature', () => {
    const s = solve({ o: { powderSensMsPerC: 1 }, station: { powderTempC: manual(5) } })
    expect(s.inputs.find((i) => i.key === 'mvUsedMs')!.value).toBe(890)
    expect(s.inputs.find((i) => i.key === 'muzzleVelocityMs')!.value).toBe(900)
  })
})

describe('trueReal: the MV that reproduces an observed dial', () => {
  const p7 = () => resolvePreset(PRESETS.find((x) => x.id === 'p7')!, undefined)
  const profile = { ...DEFAULT_REAL_PROFILE, effects: { ...DEFAULT_REAL_PROFILE.effects } }

  it('gives back the MV that produced the dial the same calm air solves for', () => {
    const faster = resolvePreset(PRESETS.find((x) => x.id === 'p7')!, { muzzleVelocityMs: 930 })
    const dial = solveReal(faster, { ...DEFAULT_SETUP, distanceM: 800 }, profile, STANDARD_STATION, 'mil', { shares: false, hit: false }).elevation
    const mv = trueReal(p7(), profile, STANDARD_STATION, 'mil', 800, dial)
    expect(mv).not.toBeNull()
    expect(mv!).toBeCloseTo(930, 0)
  })

  it('refuses a figure that does not fit this load (ten times too big, or a negative one)', () => {
    expect(trueReal(p7(), profile, STANDARD_STATION, 'mil', 800, 49)).toBeNull()
    expect(trueReal(p7(), profile, STANDARD_STATION, 'mil', 800, -2)).toBeNull()
  })

  it('reads the figure in the scope unit', () => {
    const mil = trueReal(p7(), profile, STANDARD_STATION, 'mil', 800, 4.9)
    const moa = trueReal(p7(), profile, STANDARD_STATION, 'moa', 800, 4.9 * 3.4377467707849)
    expect(mil).not.toBeNull()
    expect(moa!).toBeCloseTo(mil!, 1)
  })

  for (const humidity of [true, false]) {
    it(`round-trips exactly with a powder sensitivity of 1.5 m/s per °C, cold powder, humidity ${humidity ? 'on' : 'off'}`, () => {
      const station = { ...STANDARD_STATION, humidityPct: manual(70), powderTempC: manual(10) }
      const eff = { ...DEFAULT_REAL_PROFILE.effects, humidity }
      const prof = { ...DEFAULT_REAL_PROFILE, effects: eff }
      const known = resolvePreset(PRESETS.find((x) => x.id === 'p7')!, { muzzleVelocityMs: 915, powderSensMsPerC: 1.5 })
      const dial = solveReal(known, { ...DEFAULT_SETUP, distanceM: 800 }, prof, station, 'mil', { shares: false, hit: false }).elevation
      const base = resolvePreset(PRESETS.find((x) => x.id === 'p7')!, { powderSensMsPerC: 1.5 })
      const mv = trueReal(base, prof, station, 'mil', 800, dial)
      expect(mv).not.toBeNull()
      expect(Math.abs(mv! - 915)).toBeLessThan(0.5)
      const back = resolvePreset(PRESETS.find((x) => x.id === 'p7')!, { muzzleVelocityMs: mv!, powderSensMsPerC: 1.5 })
      const again = solveReal(back, { ...DEFAULT_SETUP, distanceM: 800 }, prof, station, 'mil', { shares: false, hit: false }).elevation
      expect(Math.abs(again - dial)).toBeLessThan(0.005)
    })
  }
})


describe('solveReal: what the calculation view explains', () => {
  const D = 1000
  const windy: Case = { setup: { distanceM: D, windMs: 3, windClock: 9 } }
  const input = (s: RealSolution, key: string) => s.inputs.find((i) => i.key === key)!.value

  it('comes only with the shares, and not for an unreached distance', () => {
    expect(solve({ ...windy, need: { shares: false, hit: true } }).explain).toBeNull()
    expect(solve(windy).explain).not.toBeNull()
    expect(solve({ preset: SLOW, setup: { distanceM: 2500 } }).explain).toBeNull()
  })

  it('the hit against the line of sight is the answer: −hit / D is the elevation, and the windage', () => {
    const s = solve(windy)
    const x = s.explain!
    expect((-x.hitYM / D) * 1000).toBeCloseTo(s.elevation, 9)
    expect((-x.hitXM / D) * 1000).toBeCloseTo(s.windage, 9)
    // P7 at 1000 m: about 8.4 m under the line of sight with the aerodynamic jump of a 3 m/s wind from the left.
    expect(x.hitYM).toBeLessThan(-8.2)
    expect(x.hitYM).toBeGreaterThan(-8.5)
  })

  it('the lag rule: 3 m/s from 9 · (t − 1000/900) s, and the 3D wind drift agrees to a millimetre', () => {
    const s = solve(windy)
    const { wind } = s.explain!
    const lag = s.explain!.lag!
    expect(lag.crossMs).toBeCloseTo(3, 9)
    expect(lag.timeS).toBe(s.timeS)
    expect(lag.vacuumTimeS).toBeCloseTo(1000 / 900, 9)
    expect(lag.driftM).toBeCloseTo(3 * (s.timeS - 1000 / 900), 9)
    // P7: t ≈ 1.536 s, so about 1.27 m to the right.
    expect(lag.driftM).toBeGreaterThan(1.24)
    expect(lag.driftM).toBeLessThan(1.30)
    expect(Math.abs(wind!.xM - lag.driftM)).toBeLessThan(0.001)
    // A pure crosswind leaves the drop alone.
    expect(Math.abs(wind!.yM)).toBeLessThan(0.002)
  })

  it('the lag rule uses the muzzle velocity that went in', () => {
    const s = solve({ ...windy, o: { powderSensMsPerC: 1 }, station: { powderTempC: manual(5) } })
    expect(s.explain!.lag!.vacuumTimeS).toBeCloseTo(1000 / 890, 9)
  })

  it('a headwind lowers the hit and doesn’t push it sideways; no wind, no wind share', () => {
    const head = solve({ setup: { distanceM: D, windMs: 5, windClock: 12 } }).explain!
    expect(head.wind!.yM).toBeLessThan(-0.03)
    // Only through Coriolis, which the longer flight lets act a little longer.
    expect(Math.abs(head.wind!.xM)).toBeLessThan(0.001)
    expect(head.lag!.crossMs).toBeCloseTo(0, 9)
    const calm = solve({ setup: { distanceM: D } }).explain!
    expect(calm.wind).toEqual({ yM: 0, xM: 0 })
    expect(calm.lag!.driftM).toBe(0)
  })

  it('the windage is the wind, the spin drift and Coriolis added up', () => {
    const s = solve(windy)
    const x = s.explain!
    expect(x.wind!.xM + share(s, 'spinDrift').xM + share(s, 'coriolis').xM).toBeCloseTo(x.hitXM, 3)
  })

  it('the zero is solved with the reference MV, and the shifted MV is there even with the switch off (R8)', () => {
    const cold: Case = { ...windy, o: { powderSensMsPerC: 1 }, station: { powderTempC: manual(5) } }
    for (const powderTemp of [true, false]) {
      const x = solve({ ...cold, effects: { powderTemp } }).explain!
      expect(x.zeroMvMs).toBe(900)
      expect(x.shiftedMvMs).toBe(890)
    }
  })

  it('names the drag, the twist and the wind along the line of fire', () => {
    const x = solve({ setup: { distanceM: D, windMs: 4, windClock: 12 } }).explain!
    expect(x.dragModel).toBe('G7')
    expect(x.dragNoteKey).toBeNull()
    expect(x.twist).toBe('right')
    expect(x.tailMs).toBeCloseTo(-4, 9)
    const p9 = solve({ id: 'p9', setup: { distanceM: D } }).explain!
    expect(p9.dragModel).toBe('table')
    expect(translate('en', p9.dragNoteKey!)).toMatch(/NATO reference round/)
    expect(solve(windy).explain!.tailMs).toBeCloseTo(0, 9)
  })

  it('no slope, no rifleman’s rule comparison', () => {
    expect(solve(windy).explain!.slope).toBeNull()
  })

  it('the rifleman’s rule is the level answer at D·cos θ; at 15° it hits about 17 cm low at 1000 m (research §6)', () => {
    const s = solve({ setup: { distanceM: D, slopeDeg: 15 } })
    const r = s.explain!.slope!
    const level = D * Math.cos((15 * Math.PI) / 180)
    expect(r.horizontalM).toBeCloseTo(level, 9)
    expect(r.elevation).toBe(s.elevation)
    expect(r.riflemanElevation).toBeCloseTo(solve({ setup: { distanceM: level } }).elevation, 6)
    expect(r.differenceM).toBeCloseTo(((r.riflemanElevation - r.elevation) / 1000) * D, 9)
    expect(r.differenceM).toBeLessThan(-0.15)
    expect(r.differenceM).toBeGreaterThan(-0.2)
    // Downhill it hits low too, but less: gravity along the path speeds the bullet up, which shrinks the error; the
    // denser air below enlarges it again, by less.
    const down = solve({ setup: { distanceM: D, slopeDeg: -15 } }).explain!.slope!.differenceM
    expect(down).toBeLessThan(-0.1)
    expect(down).toBeGreaterThan(r.differenceM)
  })

  it('1° of cant: sin 1° · (α·D − h), α the bore plus the elevation (the bore sits h under the scope)', () => {
    const s = solve(windy)
    const alphaRad = (input(s, 'boreAngleMrad') + s.elevation) / 1000
    expect(s.explain!.cantAlphaRad).toBeCloseTo(alphaRad, 12)
    expect(s.explain!.cantPerDegM).toBeCloseTo(Math.sin(Math.PI / 180) * (alphaRad * D - 0.06), 9)
    // P7 at 1000 m: about 16.6 cm. At the zero it is only the bore's own rise over the sight height.
    expect(s.explain!.cantPerDegM).toBeGreaterThan(0.16)
    expect(s.explain!.cantPerDegM).toBeLessThan(0.17)
    expect(solve({ setup: { distanceM: 100 } }).explain!.cantPerDegM).toBeLessThan(0.002)
  })

  it('agrees with the research’s 3D figures for its .338 LM at 1000 m: 2° of cant 35 cm, the rifleman’s rule at 15° 17 cm low', () => {
    // Research §6 base: 890 m/s, G7 0.310, 45 mm sight height, 100 m zero, ICAO at sea level.
    const o: Overrides = { muzzleVelocityMs: 890, bc: 0.31, sightHeightMm: 45 }
    const x = solve({ o, setup: { distanceM: D }, effects: { coriolis: false } }).explain!
    expect(Math.abs(2 * x.cantPerDegM - 0.35)).toBeLessThan(0.01)
    // Its rifleman's rule at 15°, −17 cm, doesn't say how its air changes along the path; ours thins with height.
    expect(Math.abs(solve({ o, setup: { distanceM: D, slopeDeg: 15 }, effects: { coriolis: false } }).explain!.slope!.differenceM + 0.17)).toBeLessThan(0.03)
  })
})

describe('solveReal: an optional input that is missing switches its effect off', () => {
  const hot = { ...STANDARD_STATION, tempC: manual(35) }
  const run = (nulls: Partial<Record<'twistIn' | 'mvRefTempC' | 'powderSensMsPerC' | 'accuracyMoa', null>> & { diameterIn?: null; lengthMm?: null }, o?: Overrides, effects?: Partial<Record<Effect, boolean>>) => {
    const base = resolvePreset(PRESETS.find((x) => x.id === 'p7')!, o)
    const { diameterIn, lengthMm, ...top } = nulls
    const p = {
      ...base,
      ...top,
      bullet: { ...base.bullet, ...(diameterIn === null ? { diameterIn: null } : {}), ...(lengthMm === null ? { lengthMm: null } : {}) },
    }
    const profile = { ...DEFAULT_REAL_PROFILE, effects: { ...DEFAULT_REAL_PROFILE.effects, ...effects } }
    return solveReal(p, { ...DEFAULT_SETUP, distanceM: 800, windMs: 3, windClock: 9 }, profile, hot, 'mil', ALL)
  }
  const has = (s: RealSolution, key: string) => s.inputs.some((i) => i.key === key)
  const mvUsed = (s: RealSolution) => s.inputs.find((i) => i.key === 'mvUsedMs')!.value

  it('leaves the MV unshifted and says why when the powder sensitivity is missing', () => {
    const s = run({ powderSensMsPerC: null })
    expect(s.shares!.powderTemp).toEqual({ missing: 'powderSens' })
    expect(mvUsed(s)).toBe(900)
    expect(has(s, 'powderSensMsPerC')).toBe(false)
  })

  it("the same when the MV's reference temperature is missing", () => {
    const s = run({ mvRefTempC: null }, { powderSensMsPerC: 1.5 })
    expect(s.shares!.powderTemp).toEqual({ missing: 'mvRefTemp' })
    expect(mvUsed(s)).toBe(900)
    expect(has(s, 'mvRefTempC')).toBe(false)
  })

  it('switches spin drift and the jump off without the twist', () => {
    const s = run({ twistIn: null })
    expect(s.shares!.spinDrift).toEqual({ missing: 'twist' })
    expect(s.shares!.aeroJump).toEqual({ missing: 'twist' })
    expect(has(s, 'sg')).toBe(false)
    const off = run({}, undefined, { spinDrift: false, aeroJump: false })
    expect(s.windage).toBeCloseTo(off.windage, 12)
    expect(s.elevation).toBeCloseTo(off.elevation, 12)
  })

  it('the same without the diameter, or without the length: twist, then length, then diameter', () => {
    expect(run({ diameterIn: null }).shares!.spinDrift).toEqual({ missing: 'diameter' })
    expect(run({ diameterIn: null }).shares!.aeroJump).toEqual({ missing: 'diameter' })
    expect(run({ lengthMm: null }).shares!.spinDrift).toEqual({ missing: 'bulletLength' })
    expect(run({ lengthMm: null, diameterIn: null }).shares!.spinDrift).toEqual({ missing: 'bulletLength' })
    expect(run({ twistIn: null, lengthMm: null, diameterIn: null }).shares!.spinDrift).toEqual({ missing: 'twist' })
    expect(has(run({ diameterIn: null }), 'diameterIn')).toBe(false)
  })

  it('leaves the rifle out of the hit chance without the accuracy', () => {
    const s = run({ accuracyMoa: null })
    expect(s.hit!.group).toBeNull()
    expect(s.hit!.x.rifle).toBeUndefined()
    expect(has(s, 'accuracyMoa')).toBe(false)
  })

  it('keeps every built-in preset with all its inputs, none null', () => {
    for (const preset of PRESETS) {
      const p = resolvePreset(preset, undefined)
      expect([p.twistIn, p.mvRefTempC, p.powderSensMsPerC, p.accuracyMoa, p.bullet.diameterIn].every((v) => v !== null)).toBe(true)
      expect(p.magnification).toBeNull()
    }
  })
})

describe('zones', () => {
  const at1500 = { distanceM: 1500, windMs: 3, windClock: 9 }

  it('zones off is 0.1.7', () => {
    const plain = solve({ setup: at1500 })
    const off = solve({ setup: { ...at1500, zonesOn: false, windMid: { ms: 6, clock: 3 }, windFar: { ms: 1, clock: 12 } } })
    expect(off.windage).toBe(plain.windage)
    expect(off.windColumns).toEqual(plain.windColumns)
    expect(off.explain).toEqual(plain.explain)
    expect(off.zoneSpeeds).toBeNull()
    expect(off.zoneWeights).toBeNull()
    expect(off.explain!.zones).toBeNull()
  })

  it('equal zones equal one wind', () => {
    const one = solve({ setup: at1500 })
    const three = solve({ setup: { ...at1500, zonesOn: true } })
    expect(three.windage).toBeCloseTo(one.windage, 6)
  })

  it('weights at 1500 m', () => {
    // The .308 175 gr, closest to the research load (G7 ~0.24, ~790 m/s).
    const w = solve({ id: 'p5', setup: { ...at1500, zonesOn: true } }).zoneWeights!
    expect(w).toHaveLength(3)
    // Measured on p5 at 1500 m: [45, 47, 8] %.
    expect(w[0]).toBeGreaterThanOrEqual(43)
    expect(w[0]).toBeLessThanOrEqual(47)
  })

  it('a calm near wind with a far wind of its own', () => {
    const calm = solve({ setup: { distanceM: 1500, windMs: 0, windClock: 9, zonesOn: true, windFar: { ms: 4, clock: 9 } } })
    const full = solve({ setup: { distanceM: 1500, windMs: 4, windClock: 9 } })
    const none = solve({ setup: { distanceM: 1500, windMs: 0, windClock: 9 } })
    expect(Math.sign(calm.windage - none.windage)).toBe(Math.sign(full.windage - none.windage))
    expect(Math.abs(calm.windage - none.windage)).toBeLessThan(Math.abs(full.windage - none.windage))
    expect(calm.windSpeeds[1]).toBe(0)
    expect(calm.zoneSpeeds![1]).toEqual([0, 0, 4])
  })

  it('columns with zones', () => {
    const sigma = DEFAULT_REAL_PROFILE.windSigmaMs
    const s = solve({ setup: { ...at1500, zonesOn: true, windMid: { ms: 1, clock: 9 }, windFar: { ms: 5, clock: 9 } } })
    expect(s.zoneSpeeds![0]).toEqual([3, 1, 5].map((v) => Math.max(0, v - sigma)))
    expect(s.zoneSpeeds![1]).toEqual([3, 1, 5])
    expect(s.zoneSpeeds![2]).toEqual([3, 1, 5].map((v) => v + sigma))
    const [lo, mid, hi] = s.windColumns
    expect(mid).toBe(s.windage)
    expect(Math.min(lo, hi)).toBeLessThan(mid)
    expect(Math.max(lo, hi)).toBeGreaterThan(mid)
  })

  it('explain with zones', () => {
    const s = solve({ setup: { ...at1500, zonesOn: true, windMid: { ms: 1, clock: 9 }, windFar: { ms: 5, clock: 9 } } })
    const x = s.explain!
    expect(x.lag).toBeNull()
    expect(x.zones!.map((z) => z.name)).toEqual(['near', 'mid', 'far'])
    expect(x.zones!.reduce((a, z) => a + z.driftM, 0)).toBeCloseTo(x.wind!.xM, 9)
  })

  it('each zone line carries its 1 m/s drift, the weights’ own', () => {
    const s = solve({ setup: { ...at1500, zonesOn: true, windFar: { ms: 5, clock: 9 } } })
    const zones = s.explain!.zones!
    const sum = zones.reduce((a, z) => a + z.perMsM, 0)
    for (const z of zones) expect(z.perMsM).toBeGreaterThan(0)
    expect(zones.map((z) => Math.round((z.perMsM / sum) * 100))).toEqual(s.zoneWeights)
  })

  it('a zone is its own only with a wind of its own; the near one never', () => {
    const zones = solve({ setup: { ...at1500, zonesOn: true, windFar: { ms: 5, clock: 9 } } }).explain!.zones!
    expect(zones.map((z) => [z.name, z.own])).toEqual([['near', false], ['mid', false], ['far', true]])
  })

  // Near 3 m/s from 9, far ~5.7 from 2 at 1000 m: the zones' straight-line parts nearly cancel, and a split by part / Σparts
  // blew the remainder up (the near line read 6.3, 38.6 and 26.6 cm where the near zone alone drifted ~21 cm).
  it('each zone line stays near its own drift when the zones nearly cancel', () => {
    const at1000 = { distanceM: 1000, windMs: 3, windClock: 9, zonesOn: true }
    for (const ms of [5.6, 5.7, 5.8]) {
      const lines = solve({ id: 'p5', setup: { ...at1000, windFar: { ms, clock: 2 } } }).explain!.zones!
      const nearAlone = solve({ id: 'p5', setup: { ...at1000, windFar: { ms: 0, clock: 2 } } }).explain!.wind!.xM
      const farAlone = solve({ id: 'p5', setup: { ...at1000, windMs: 0, windFar: { ms, clock: 2 } } }).explain!.wind!.xM
      expect(Math.abs(lines[0].driftM - nearAlone)).toBeLessThan(0.01)
      expect(Math.abs(lines[1].driftM - farAlone)).toBeLessThan(0.01)
    }
  })

  it('the jump uses the near zone', () => {
    const jump = (s: Partial<RealSetup>) => share(solve({ id: 'p5', setup: s }), 'aeroJump').yM
    const zoned = jump({ distanceM: 1500, windMs: 4, windClock: 9, zonesOn: true, windMid: { ms: 6, clock: 3 }, windFar: { ms: 8, clock: 3 } })
    expect(zoned).toBe(jump({ distanceM: 1500, windMs: 4, windClock: 9 }))
    expect(zoned).not.toBeCloseTo(jump({ distanceM: 1500, windMs: 8, windClock: 3 }), 4)
  })

  it('under 1000 m the zones are inactive', () => {
    const off = solve({ setup: { distanceM: 950, windMs: 3, windClock: 9 } })
    const on = solve({ setup: { distanceM: 950, windMs: 3, windClock: 9, zonesOn: true, windFar: { ms: 6, clock: 3 } } })
    expect(on.windage).toBe(off.windage)
    expect(on.zoneSpeeds).toBeNull()
  })

  it('the linear outer columns agree with explicit ±σ runs for a turning wind', () => {
    const sigma = DEFAULT_REAL_PROFILE.windSigmaMs
    const zones = { near: { ms: 4, clock: 9 }, mid: { ms: 2, clock: 12 }, far: { ms: 3, clock: 3 } }
    const s = solve({ setup: { distanceM: 1500, windMs: 4, windClock: 9, zonesOn: true, windMid: zones.mid, windFar: zones.far } })
    const explicit = (dv: number) =>
      solve({
        setup: {
          distanceM: 1500, zonesOn: true, windClock: 9,
          windMs: Math.max(0, zones.near.ms + dv),
          windMid: { ...zones.mid, ms: Math.max(0, zones.mid.ms + dv) },
          windFar: { ...zones.far, ms: Math.max(0, zones.far.ms + dv) },
        },
      }).windage
    for (const [col, dv] of [[0, -sigma], [2, sigma]] as const) {
      expect(Math.abs(s.windColumns[col] - explicit(dv))).toBeLessThan(0.02 * Math.abs(s.windColumns[col]))
    }
  })

  it('windAtBy with no zones is calm', () => {
    expect(windAtBy({ ...DEFAULT_SETUP, distanceM: 200, zonesOn: true }, () => ({ x: 1, z: 1 }))(10)).toEqual({ x: 0, z: 0 })
  })
})
