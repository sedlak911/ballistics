import { describe, expect, it } from 'vitest'
import { dialFor } from '../../../engine/dial'
import { normalCdf } from '../../../engine/hitChance'
import { millerTerms } from '../../../engine/spin'
import { angleFromRad, radFromAngle, type AngleUnit, type UnitSystem } from '../../../engine/units'
import { translate, type TKey } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import { PRESETS } from '../data/presets'
import type { CustomRifle, CustomRound } from '../library'
import { DEFAULT_REAL_PROFILE, type Effect, type RealProfile } from '../profile'
import { resolvePreset, type Overrides, type ResolvedPreset } from '../profiles'
import { resolveSelection } from '../selection'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { solveReal, type RealSolution } from '../solve'
import { STANDARD_STATION, type Station } from '../station'
import { fix, isYours, len, num, shareLines, signedLen, term } from './calcText'
import { fill, working, type Piece, type StepId, type WorkEnv, type WorkLine } from './calcWorking'
import { arrowed, chanceText, LEFT_RIGHT, lengthText, NBSP, rounded, UP_DOWN } from './realText'

const manual = (value: number) => ({ value, source: 'manual' as const })
const model = (value: number) => ({ value, source: 'model' as const })

// 12 °C typed, the rest from the weather model: a QNH of 1008.4 hPa at 310 m, 71 % humidity.
const STATION: Station = {
  ...STANDARD_STATION,
  tempC: manual(12), pressureHPa: model(1008.4), pressureKind: 'qnh', humidityPct: model(71), altitudeM: model(310),
}

interface Case {
  preset?: ResolvedPreset
  o?: Overrides
  setup?: Partial<RealSetup>
  station?: Partial<Station>
  effects?: Partial<Record<Effect, boolean>>
  profile?: Partial<RealProfile>
  unit?: AngleUnit
}

// P7 at 600 m in the station above, shares and hit asked for, MRAD, unless the case says otherwise.
function solve(c: Case = {}): RealSolution {
  const p = c.preset ?? resolvePreset(PRESETS.find((x) => x.id === 'p7')!, c.o)
  const profile = { ...DEFAULT_REAL_PROFILE, ...c.profile, effects: { ...DEFAULT_REAL_PROFILE.effects, ...c.effects } }
  return solveReal(p, { ...DEFAULT_SETUP, distanceM: 600, ...c.setup }, profile, { ...STATION, ...c.station }, c.unit ?? 'mil', { shares: true, hit: true })
}

function env(s: RealSolution, o: { lang?: Lang; sys?: UnitSystem; effects?: Partial<Record<Effect, boolean>>; windByHand?: boolean } = {}): WorkEnv {
  const lang = o.lang ?? 'en'
  return {
    t: (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    lang,
    sys: o.sys ?? 'metric',
    effects: { ...DEFAULT_REAL_PROFILE.effects, ...o.effects },
    yours: (key) => isYours(s.inputs.find((i) => i.key === key) ?? null, o.windByHand ?? false),
  }
}

/** A custom round on a custom rifle, resolved as the page does. */
function customLoad(round: Partial<CustomRound>, rifle: Partial<CustomRifle> = {}): ResolvedPreset {
  const library = {
    v: 1 as const,
    rifles: [{ id: 'u-rifle', name: 'Custom', twistIn: 10, accuracyMoa: 1, ...rifle }],
    rounds: [{ id: 'u-round', rifleId: 'u-rifle', name: 'Custom', massGr: 175, diameterIn: 0.308, lengthMm: 31.5, bc: 0.243, dragModel: 'G7' as const, ...round }],
    scopes: [],
  }
  return resolveSelection({ ...DEFAULT_SETUP, roundId: 'u-round', customRifleId: 'u-rifle' }, library, {}, undefined, new Set(), false).preset
}

const plain = (p: Piece) => (typeof p === 'string' ? p : p.yours)
/** A line as it reads, the no-break spaces as plain ones. */
const str = (l: WorkLine) => l.pieces.map(plain).join('').replaceAll(NBSP, ' ')
/** The pieces marked yours, as they read. */
const mine = (l: WorkLine) => l.pieces.filter((p) => typeof p !== 'string').map((p) => plain(p).replaceAll(NBSP, ' '))
const en = (key: TKey, vars?: Record<string, string | number>) => translate('en', key, vars)
const N = '(−?[\\d.]+)'
const match = (l: WorkLine, re: string) => {
  const m = str(l).match(new RegExp(`^${re}$`))
  if (!m) throw new Error(`"${str(l)}" doesn't match ${re}`)
  return m.slice(1)
}
const nums = (xs: string[]) => xs.map((x) => Number(x.replace('−', '-')))
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('fill', () => {
  it('replaces placeholders by pieces and keeps the text between', () => {
    expect(fill('a {x} b {y}', { x: '1', y: { yours: '2' } })).toEqual(['a ', '1', ' b ', { yours: '2' }])
  })

  it('splices an array value in', () => {
    expect(fill('{p} = {r}', { p: ['1', ' + ', { yours: '2' }], r: '3' })).toEqual(['1', ' + ', { yours: '2' }, ' = ', '3'])
  })

  it('repeats a placeholder that comes twice', () => {
    expect(fill('{t} / {t}', { t: { yours: '5' } })).toEqual([{ yours: '5' }, ' / ', { yours: '5' }])
  })
})

describe('working: air', () => {
  it('the air working is the code’s density', () => {
    const s = solve()
    const lines = working('air', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'symbols', 'numbers', 'symbols', 'numbers'])
    expect(lines.filter((l) => l.kind === 'symbols').map(str)).toEqual([en('calc.f.qnh'), en('calc.f.vapour'), en('calc.f.density')])
    const value = (key: string) => s.inputs.find((i) => i.key === key)!.value

    // The station pressure from the QNH.
    const [q, h, p0] = nums(match(lines[1], `p = ${N} · \\(1 − 2\\.25577·10⁻⁵ · ${N}\\)\\^5\\.25588 = ${N} hPa`))
    expect(q).toBe(1008.4)
    expect(h).toBe(310)
    expect(Math.abs(q * (1 - 2.25577e-5 * h) ** 5.25588 - p0)).toBeLessThan(0.1)
    expect(p0).toBe(Number(fix(value('stationPressureHPa'), 1, 'en')))

    // The vapour pressure, Buck's.
    const [rh, t, t2, t3, e0] = nums(match(lines[3], `e = ${N} · 6\\.1121 · exp\\(\\(18\\.678 − ${N} / 234\\.5\\) · ${N} / \\(257\\.14 \\+ ${N}\\)\\) = ${N} hPa`))
    expect([t, t2, t3]).toEqual([12, 12, 12])
    expect(Math.abs(rh * 6.1121 * Math.exp(((18.678 - t / 234.5) * t) / (257.14 + t)) - e0)).toBeLessThan(0.006)

    // The density, recomputed from the printed p, e and T.
    const [p, e, T, e2, T2, rho] = match(lines[5], `ρ = 100 · \\(${N} − ${N}\\) / \\(287\\.06 · ${N}\\) \\+ 100 · ${N} / \\(461\\.5 · ${N}\\) = ${N} kg/m³`)
    expect([e2, T2]).toEqual([e, T])
    const [pv, ev, Tv] = nums([p, e, T])
    expect(pv).toBe(p0)
    expect(ev).toBe(e0)
    expect(Math.abs((100 * (pv - ev)) / (287.06 * Tv) + (100 * ev) / (461.5 * Tv) - value('densityKgM3'))).toBeLessThan(0.002)
    expect(rho).toBe(fix(value('densityKgM3'), 3, 'en'))

    // 12 °C is typed (yours), the 71 % comes from the model.
    expect(lines[3].pieces).toContainEqual({ yours: '12' })
    expect(lines[3].pieces).toContain('0.71')
    expect(mine(lines[3])).not.toContain('0.71')
  })

  it('no pressure line without QNH', () => {
    const s = solve({ station: { pressureHPa: { value: 1013.25, source: 'standard' } } })
    const lines = working('air', s, env(s))
    expect(str(lines[0])).toBe(en('calc.f.vapour'))
    expect(lines).toHaveLength(4)
  })

  it('humidity off zeroes e', () => {
    const s = solve({ effects: { humidity: false } })
    const lines = working('air', s, env(s, { effects: { humidity: false } }))
    expect(str(lines[3])).toMatch(/^e = 0\.00 · /)
    expect(str(lines[3])).toMatch(/ = 0\.00 hPa$/)
  })

  it('a typed humidity is yours, but not the 0.00 that stands for it with the effect off', () => {
    const typed = { humidityPct: manual(71) }
    const on = solve({ station: typed })
    expect(working('air', on, env(on))[3].pieces).toContainEqual({ yours: '0.71' })
    const off = solve({ station: typed, effects: { humidity: false } })
    const line = working('air', off, env(off, { effects: { humidity: false } }))[3]
    expect(line.pieces[1]).toBe('0.00')
    expect(mine(line)).not.toContain('0.00')
    expect(mine(line)).toContain('12')
  })

  it('writes a decimal comma in Czech', () => {
    const s = solve()
    const lines = working('air', s, env(s, { lang: 'cs' }))
    expect(str(lines[0])).toBe('p = QNH · (1 − 2,25577·10⁻⁵ · h)^5,25588')
    expect(str(lines[1])).toMatch(/^p = 1008,4 · \(1 − 2,25577·10⁻⁵ · 310\)\^5,25588 = \d+,\d hPa$/)
  })
})

describe('working: muzzle velocity', () => {
  const round = { muzzleVelocityMs: 900, mvRefTempC: 15, powderSensMsPerC: 0.8 }

  it('the powder shift, with your numbers', () => {
    const s = solve({ preset: customLoad(round), station: { powderTempC: manual(20) } })
    const lines = working('mv', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers'])
    expect(str(lines[0])).toBe('v = v_ref + sens · (t_powder − t_ref)')
    expect(str(lines[1])).toBe('v = 900 + 0.8 · (20 − 15) = 904 m/s')
    expect(lines[1].pieces).toContainEqual({ yours: '20' })
    const cs = working('mv', s, env(s, { lang: 'cs' }))
    expect(str(cs[0])).toBe('v = v_ref + citlivost · (t_prach − t_ref)')
    expect(str(cs[1])).toBe('v = 900 + 0,8 · (20 − 15) = 904 m/s')
  })

  it('without the sensitivity, one line says nothing shifts', () => {
    const s = solve({ preset: customLoad({ muzzleVelocityMs: 900, mvRefTempC: 15 }), station: { powderTempC: manual(20) } })
    const lines = working('mv', s, env(s))
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe('text')
    expect(str(lines[0])).toBe(en('calc.w.mvNone', { v: '900 m/s' }))
  })
})

describe('working: flight', () => {
  it('names the method and gives the figures it produced', () => {
    const s = solve()
    const lines = working('flight', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['text', 'text'])
    expect(str(lines[0])).toBe(en('calc.w.sim', { method: en('calc.in.method') }))
    expect(mine(lines[1])).toEqual(['600 m'])
    expect(str(lines[1])).toBe(en('calc.w.flight', {
      d: '600 m', t: `${fix(s.timeS, 3, 'en')} s`, v: `${num(s.velocityMs, 0, 'en')} m/s`, m: fix(s.mach, 2, 'en'),
    }))
  })
})

describe('working: elevation', () => {
  it('the angle, the clicks and what is left over', () => {
    const s = solve()
    const lines = working('elevation', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'symbols', 'numbers', 'symbols', 'numbers'])
    expect(lines.filter((l) => l.kind === 'symbols').map(str)).toEqual([en('calc.f.elevation'), en('calc.f.clicks'), en('calc.f.leftOver')])

    const [y, d, e] = nums(match(lines[1], `E = ${N} m / ${N} m = ${N} MRAD`))
    expect(d).toBe(600)
    expect(Math.abs((y / d) * 1000 - e)).toBeLessThan(0.006)
    expect(e).toBe(Number(fix(Math.abs(s.elevation), 2, 'en')))
    expect(mine(lines[1])).toEqual(['600 m'])

    const [ec, c, n] = nums(match(lines[3], `n = round\\(${N} MRAD / ${N} MRAD\\) = ${N}`))
    expect(n).toBe(Math.abs(s.dial.clicks))
    expect(Math.round(+(ec / c).toFixed(9))).toBe(n)

    const [el, nl, cl, dl] = nums(match(lines[5], `\\(${N} MRAD − ${N} · ${N} MRAD\\) · ${N} m ≈ (.+)`).slice(0, 4))
    expect([el, nl, cl, dl]).toEqual([ec, n, c, 600])
    const left = str(lines[5]).split('≈ ')[1]
    expect(left.replace('−', '')).toBe(lengthText(Math.abs(s.dial.remainder) / 1000 * 600, 'metric').replace(NBSP, ' '))
  })

  it('a travel too short: the dial is capped and the rest is held', () => {
    const s = solve({ o: { travelUp: 2, scopeUnit: 'mil' } })
    expect(s.dial.hold).toBeGreaterThan(0)
    const lines = working('elevation', s, env(s))
    const symbols = lines.filter((l) => l.kind === 'symbols').map(str)
    expect(symbols).toEqual([en('calc.f.elevation'), en('calc.f.clicksCapped')])
    const [e, c, tr, c2, n, e2, n2, c3, h] =
      nums(match(lines[3], `n = min\\(round\\(${N} MRAD / ${N} MRAD\\), floor\\(${N} MRAD / ${N} MRAD\\)\\) = ${N}, H = ${N} MRAD − ${N} · ${N} MRAD = ${N} MRAD`))
    expect([c2, c3, e2, n2]).toEqual([c, c, e, n])
    expect(tr).toBe(2)
    expect(n).toBe(Math.abs(s.dial.clicks))
    expect(n).toBe(Math.min(Math.round(e / c), Math.floor(tr / c + 1e-9)))
    expect(h).toBe(Number(fix(s.dial.hold, 1, 'en')))
    expect(Number(fix(e - n * c, 1, 'en'))).toBe(h)
    // Marked as the body marks the travel: a travel you set is yours.
    expect(isYours(s.inputs.find((i) => i.key === 'travelUp')!, false)).toBe(true)
    expect(mine(lines[3]).includes('2 MRAD')).toBe(true)
  })

  // E = 3.446 MRAD dials 34 clicks of 0.1, but printed as 3.45 it would read round(34.5) = 35: E gets a third decimal.
  it('where two decimals of E would round across a click, E keeps enough for the clicks to come out', () => {
    const real = solve()
    const s: RealSolution = { ...real, elevation: 3.446, dial: dialFor(3.446, 0.1, null) }
    expect(s.dial.clicks).toBe(34)
    expect(Math.round(Number(fix(3.446, 2, 'en')) / 0.1)).toBe(35)
    const lines = working('elevation', s, env(s))
    expect(str(lines[3])).toBe('n = round(3.446 MRAD / 0.1 MRAD) = 34')
    const [e, c, n] = nums(match(lines[3], `n = round\\(${N} MRAD / ${N} MRAD\\) = ${N}`))
    expect(Math.round(+(e / c).toFixed(9))).toBe(n)
    expect(str(lines[5])).toMatch(/^\(3\.446 MRAD − 34 · 0\.1 MRAD\) · 600 m ≈ /)
    // Where two decimals do: the body's two.
    const plainE: RealSolution = { ...real, elevation: 3.432, dial: dialFor(3.432, 0.1, null) }
    expect(str(working('elevation', plainE, env(plainE))[3])).toBe('n = round(3.43 MRAD / 0.1 MRAD) = 34')
  })

  it('capped, E keeps enough decimals for the hold to come out', () => {
    // Travel 2 MRAD: 20 clicks; the hold 3.446 − 2.0 = 1.446 prints 1.4, but 3.45 − 2.0 would round to 1.5.
    const real = solve({ o: { travelUp: 2, scopeUnit: 'mil' } })
    const s: RealSolution = { ...real, elevation: 3.446, dial: dialFor(3.446, 0.1, 2) }
    expect(fix(s.dial.hold, 1, 'en')).toBe('1.4')
    const line = str(working('elevation', s, env(s))[3])
    expect(line).toBe('n = min(round(3.446 MRAD / 0.1 MRAD), floor(2 MRAD / 0.1 MRAD)) = 20, H = 3.446 MRAD − 20 · 0.1 MRAD = 1.4 MRAD')
  })

  it('in MOA the angles are in MOA and match the body; in imperial what is left over is in inches', () => {
    const s = solve({ unit: 'moa' })
    const lines = working('elevation', s, env(s, { sys: 'imperial' }))
    const moa = fix(Math.abs(s.elevation), 2, 'en')
    // The body: `… = {mrad} MRAD = {moa} MOA`.
    expect(str(lines[1])).toMatch(new RegExp(` = ${esc(fix(Math.abs(s.explain!.hitYM) / 600 * 1000, 2, 'en'))} MRAD = ${esc(moa)} MOA$`))
    const [ec, c, n] = nums(match(lines[3], `n = round\\(${N} MOA / ${N} MOA\\) = ${N}`))
    expect(c).toBe(0.25)
    expect(n).toBe(Math.abs(s.dial.clicks))
    expect(Math.round(ec / c)).toBe(n)
    expect(str(lines[5])).toMatch(/ ≈ −?\d+ in$/)
  })
})

describe('working: wind', () => {
  it('the lag rule with the numbers, then the flight’s own drift', () => {
    const s = solve({ setup: { windMs: 3, windClock: 9 } })
    const lag = s.explain!.lag!
    const lines = working('wind', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'text'])
    expect(str(lines[0])).toBe(en('calc.f.lag'))
    const [w, t, d, v, w2, l, r] = nums(match(lines[1], `${N} m/s · \\(${N} s − ${N} m / ${N} m/s\\) = ${N} m/s · ${N} s = ${N} m`))
    expect(w2).toBe(w)
    expect(d).toBe(600)
    expect(r).toBe(Number(fix(Math.abs(lag.driftM), 2, 'en')))
    expect(Math.abs(t - d / v - l)).toBeLessThan(0.0011)
    expect(Math.abs(w * l - r)).toBeLessThan(0.006)
    expect(mine(lines[1])).toEqual(['600 m'])
    expect(str(lines[2])).toBe(en('calc.w.windFlight', { r: `${fix(Math.abs(s.explain!.wind!.xM), 2, 'en')} m` }))

    const byHand = working('wind', s, env(s, { windByHand: true }))
    expect(mine(byHand[1])).toEqual(['3.0 m/s', '600 m', '3.0 m/s'])
  })

  /** The zones line's terms, w signed by its joiner (the first by its own sign), and the rest; checks they add up to r. */
  function zoneSum(l: WorkLine, xM: number) {
    const text = str(l)
    const terms = [...text.matchAll(/(?:^|([+−]) )(−?[\d.]+) · ([\d.]+)/g)].map((m) => [(m[1] === '−' ? -1 : 1) * nums([m[2]])[0], Number(m[3])])
    const [sign, rest, r] = match(l, `.+ ([+−]) ${N} = ${N} m`)
    const sum = terms.reduce((a, [w, sv]) => a + w * sv, 0) + (sign === '−' ? -1 : 1) * Number(rest)
    expect(Math.abs(sum - xM)).toBeLessThan(0.01)
    expect(r).toBe(fix(xM, 2, 'en'))
    expect(text).not.toContain('+ −')
    return terms
  }

  it('with zones, one w · s per shown zone, adding up to the drift, then what s is', () => {
    const s = solve({ setup: { distanceM: 1600, windMs: 3, windClock: 9, zonesOn: true, windFar: { ms: 5, clock: 9 } } })
    const x = s.explain!
    expect(x.zones).toHaveLength(3)
    const lines = working('wind', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'text'])
    expect(str(lines[0])).toBe(en('calc.f.zones'))
    expect(zoneSum(lines[1], x.wind!.xM)).toHaveLength(3)
    expect(str(lines[2])).toBe(en('calc.w.zones'))
    expect(str(working('wind', s, env(s, { lang: 'cs' }))[2])).toMatch(/^sᵢ je snos, který dá 1 m\/s bočního větru jen v té zóně/)
  })

  it('a zone with a crosswind from the right joins with −, and the sum still holds', () => {
    const s = solve({ setup: { distanceM: 1500, windMs: 3, windClock: 9, zonesOn: true, windMid: { ms: 0, clock: 12 }, windFar: { ms: 3, clock: 3 } } })
    const line = working('wind', s, env(s))[1]
    expect(str(line)).toMatch(/^3\.0 · [\d.]+ \+ 0\.0 · [\d.]+ − 3\.0 · [\d.]+ [+−] [\d.]+ = −?[\d.]+ m$/)
    expect(zoneSum(line, s.explain!.wind!.xM).map(([w]) => w)).toEqual([3, 0, -3])
  })

  it('a zone is yours with a wind of its own, or following a near wind set by hand', () => {
    const farOwn = solve({ setup: { distanceM: 1600, windMs: 3, windClock: 9, zonesOn: true, windFar: { ms: 5, clock: 9 } } })
    // A forecast near wind: only the far zone's own is yours.
    expect(mine(working('wind', farOwn, env(farOwn))[1])).toEqual(['5.0'])
    // By hand: the near one and the middle one that follows it too.
    expect(mine(working('wind', farOwn, env(farOwn, { windByHand: true }))[1])).toEqual(['3.0', '3.0', '5.0'])
    const midOwn = solve({ setup: { distanceM: 1600, windMs: 3, windClock: 9, zonesOn: true, windMid: { ms: 4, clock: 9 } } })
    expect(mine(working('wind', midOwn, env(midOwn))[1])).toEqual(['4.0'])
  })
})

// P7 at 1000 m, a 4 m/s wind from 9 o'clock, 10° uphill, shooting east (an azimuth you typed).
const SHOT: Case = { setup: { distanceM: 1000, windMs: 4, windClock: 9, slopeDeg: 10 }, station: { azimuthDeg: manual(90) } }
const valueOf = (s: RealSolution, key: string) => s.inputs.find((i) => i.key === key)!.value
const shareOf = (s: RealSolution, e: Effect) => s.shares![e] as { yM: number; xM: number; on: boolean }
/** The no-break spaces as plain ones, as `str` reads a line. */
const sp = (x: string) => x.replaceAll(NBSP, ' ')
/** The gives line for an effect's share, as the step's result prints it. */
const givesLine = (s: RealSolution, e: Effect, sys: UnitSystem = 'metric') => {
  const sh = shareOf(s, e)
  return sp(en('calc.w.gives', { v: shareLines(sh.yM, sh.xM, valueOf(s, 'distanceM'), s.unit, sys).join('; ') }))
}
/** A body term (`→20`, `←5.6`, `0`) as a signed number, + right. */
const signedTerm = (m: number, sys: UnitSystem = 'metric') => Number(term(m, sys, LEFT_RIGHT).replace('→', '').replace('←', '-'))
/** The terms of a printed sum, each signed by its joiner (the first by its own sign). */
const terms = (sum: string) =>
  [...sum.matchAll(/(?:^|([+−]) )(−?[\d.]+)/g)].map((m) => (m[1] === '−' ? -1 : 1) * nums([m[2]])[0])
/** A result worked out from printed figures, rounded at the printed result's digits as a reader would. */
const worked = (v: number, digits: number) => fix(+v.toFixed(9), digits, 'en')

/**
 * The working's digit rule on a line's figures: each is its value at its body digits plus one k for all, the printed
 * figures give the printed result (`gives`), and with k − 1 they wouldn't have. Returns k.
 */
function ruleK(printed: string[], values: number[], base: number[], gives: (xs: number[]) => boolean): number {
  const at = (k: number) => values.map((v, i) => rounded(v, base[i] + k))
  const k = [0, 1, 2, 3].find((n) => at(n).every((v, i) => v === nums([printed[i]])[0]))
  expect(k, `${printed.join(', ')} aren't ${values.join(', ')} at one k`).toBeDefined()
  expect(gives(nums(printed))).toBe(true)
  if (k! > 0) expect(gives(at(k! - 1))).toBe(false)
  return k!
}

/** Miller's Sg from m, the twist, d, the length (both in calibres), v (ft/s), T (°F) and P (inHg), as the line prints it. */
const miller = ([m, tw, d, l, v, T, P]: number[]) =>
  ((30 * m) / (tw ** 2 * d ** 3 * l * (1 + l ** 2))) * (v / 2800) ** (1 / 3) * ((T + 460) / 519) * (29.92 / P)
const MILLER = `Sg = 30 · ${N} / \\(${N}² · ${N}³ · ${N} · \\(1 \\+ ${N}²\\)\\) · \\(${N} / 2800\\)\\^\\(1/3\\) · \\(${N} \\+ 460\\) / 519 · 29\\.92 / ${N} = ${N}`
const LITZ = `SD = 1\\.25 · \\(${N} \\+ 1\\.2\\) · ${N} s\\^1\\.83 = ${N} in = (.+)`
const JUMP = `J = \\(0\\.01 · ${N} − 0\\.0024 · ${N} \\+ 0\\.032\\) · ${N} mph = ${N} MOA ≈ (.+)`
const SLOPE_DIFF = (U: string) => `Δ = \\(${N} ${U} − ${N} ${U}\\) · ${N} m ≈ (.+)`

/** Checks Miller's line against the code (millerTerms) and the digit rule; returns k. */
function checkMiller(s: RealSolution, l: WorkLine): number {
  const [m, tw, d, len1, len2, v, T, P, r] = match(l, MILLER)
  expect(len2).toBe(len1)
  expect(r).toBe(fix(valueOf(s, 'sg'), 2, 'en'))
  const x = millerTerms(
    { massGr: valueOf(s, 'massGr'), diameterIn: valueOf(s, 'diameterIn'), lengthIn: valueOf(s, 'lengthMm') / 25.4 },
    valueOf(s, 'twistIn'), valueOf(s, 'mvUsedMs'), valueOf(s, 'tempC'), valueOf(s, 'stationPressureHPa'),
  )
  return ruleK([m, tw, d, len1, v, T, P], [x.massGr, x.twistCal, x.diameterIn, x.lengthCal, x.vFtS, x.tempF, x.pressureInHg],
    [1, 2, 3, 2, 0, 1, 2], (xs) => worked(miller(xs), 2) === r)
}

/** Checks Litz's line: the body's inches, from the printed Sg and t at the inches' digit; returns k. */
function checkLitz(s: RealSolution, l: WorkLine, sys: UnitSystem = 'metric'): number {
  const spin = shareOf(s, 'spinDrift')
  const [sg, t, inch, after] = sys === 'metric' ? match(l, LITZ) : [...match(l, `SD = 1\\.25 · \\(${N} \\+ 1\\.2\\) · ${N} s\\^1\\.83 = ${N} in`), '']
  // The body's {in}, and the same drift in the sheet's length unit (imperial: inches once).
  expect(inch).toBe(fix(Math.abs(spin.xM) / 0.0254, 1, 'en'))
  if (sys === 'metric') expect(after).toBe(sp(len(spin.xM, 'metric')))
  return ruleK([sg, t], [valueOf(s, 'sg'), s.timeS], [2, 3], ([a, b]) => worked(1.25 * (a + 1.2) * b ** 1.83, 1) === inch)
}

/** Checks the jump's line: J from the printed Sg, L and W at J's two decimals, J the code's share; returns k. */
function checkJump(s: RealSolution, l: WorkLine): number {
  const [sg, L, w, J, at] = match(l, JUMP)
  const jump = shareOf(s, 'aeroJump')
  const d = valueOf(s, 'distanceM')
  expect(J).toBe(fix(angleFromRad(Math.abs(jump.yM) / d, 'moa'), 2, 'en'))
  expect(at).toBe(sp(len(jump.yM, 'metric')))
  const calibres = valueOf(s, 'lengthMm') / 25.4 / valueOf(s, 'diameterIn')
  const mph = Math.abs(s.explain!.lag!.crossMs) / 0.44704
  return ruleK([sg, L, w], [valueOf(s, 'sg'), calibres, mph], [2, 1, 1], ([a, b, c]) => worked((0.01 * a - 0.0024 * b + 0.032) * c, 2) === J)
}

/** Checks the slope's Δ: (E_rule − E) · D from the printed elevations lands on the printed Δ; returns k. */
function checkSlopeDiff(s: RealSolution, l: WorkLine, sys: UnitSystem = 'metric'): number {
  const sl = s.explain!.slope!
  const [er, e, d, r] = match(l, SLOPE_DIFF(s.unit === 'mil' ? 'MRAD' : 'MOA'))
  expect(r).toBe(sp(signedLen(sl.differenceM, sys, UP_DOWN)))
  return ruleK([er, e], [sl.riflemanElevation, sl.elevation], [2, 2],
    ([a, b]) => sp(signedLen(radFromAngle(+(a - b).toFixed(9), s.unit) * Number(d), sys, UP_DOWN)) === r)
}

describe('working: spin drift', () => {
  it('Miller is the code’s', () => {
    const s = solve(SHOT)
    const lines = working('spinDrift', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'text', 'symbols', 'numbers'])
    expect([str(lines[0]), str(lines[2]), str(lines[3])]).toEqual([en('calc.f.miller'), en('calc.w.millerUnits'), en('calc.f.litz')])
    checkMiller(s, lines[1])
    const [m, , d, , , , T] = match(lines[1], MILLER)
    expect(nums([m, d, T])).toEqual([250, 0.338, 53.6])
    // 12 °C typed: its 53.6 °F is yours; the rest are the preset's.
    expect(mine(lines[1])).toEqual(['53.6'])
    checkLitz(s, lines[4])
  })

  // The 0.1.11 screenshot's shot (standard air, 12 °C typed): at the body's digits Miller read
  // 30 · 250 / (27.66² · 0.338³ · 4.59 · (1 + 4.59²)) · (2953 / 2800)^(1/3) · (53.6 + 460) / 519 · 29.92 / 29.92 = 2.5246,
  // so 2.52 against the Sg of 2.53 it printed.
  it('the screenshot’s shot: Miller keeps a decimal more, and the line gives the Sg it prints', () => {
    const s = solve({ ...SHOT, station: { ...STANDARD_STATION, tempC: manual(12), azimuthDeg: manual(90) } })
    expect(fix(valueOf(s, 'sg'), 2, 'en')).toBe('2.53')
    expect(worked(miller([250, 27.66, 0.338, 4.59, 2953, 53.6, 29.92]), 2)).toBe('2.52')
    const lines = working('spinDrift', s, env(s))
    expect(checkMiller(s, lines[1])).toBeGreaterThan(0)
    checkLitz(s, lines[4])
    checkJump(s, working('aeroJump', s, env(s))[1])
    // Its slope read (8.15 − 8.24) · 1000 m = 9 cm against ↓8.3 cm.
    expect(checkSlopeDiff(s, working('slope', s, env(s))[3])).toBeGreaterThan(0)
  })

  it('in imperial the Litz drift is in inches once', () => {
    const s = solve(SHOT)
    const litz = working('spinDrift', s, env(s, { sys: 'imperial' }))[4]
    expect(str(litz)).toMatch(new RegExp(` = ${esc(fix(Math.abs(shareOf(s, 'spinDrift').xM) / 0.0254, 1, 'en'))} in$`))
    expect(str(litz)).not.toContain(' in = ')
    checkLitz(s, litz, 'imperial')
  })

  it('over many shots, Miller’s, Litz’s, the jump’s and the slope’s printed numbers give their printed results', () => {
    for (const tempC of [-15, -3, 4, 9, 17, 23, 31]) {
      for (const [distanceM, windMs] of [[300, 2], [700, 5], [1200, 7]]) {
        const s = solve({ setup: { distanceM, windMs, windClock: 9, slopeDeg: 8 }, station: { tempC: manual(tempC), pressureHPa: model(990 + tempC) } })
        const spin = working('spinDrift', s, env(s))
        checkMiller(s, spin[1])
        checkLitz(s, spin[4])
        checkJump(s, working('aeroJump', s, env(s))[1])
        checkSlopeDiff(s, working('slope', s, env(s))[3])
      }
    }
  })

  it('no twist, no numbers', () => {
    const s = solve({ ...SHOT, preset: customLoad({}, { twistIn: undefined }) })
    expect(s.shares!.spinDrift).toEqual({ missing: 'twist' })
    const view = (id: StepId) => working(id, s, env(s)).map((l) => [l.kind, str(l)])
    expect(view('spinDrift')).toEqual([['symbols', en('calc.f.miller')], ['symbols', en('calc.f.litz')]])
    expect(view('aeroJump')).toEqual([['symbols', en('calc.f.jump')]])
  })
})

describe('working: Coriolis and curvature', () => {
  it('Coriolis: the simulation at your latitude, the direction, and what it gives', () => {
    const s = solve(SHOT)
    const lines = working('coriolis', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['text', 'text', 'text'])
    expect(str(lines[0])).toBe(en('calc.w.coriolis', { lat: en('calc.in.north', { v: '50' }) }))
    // The standard latitude isn't yours; the azimuth you typed is.
    expect(mine(lines[0])).toEqual([])
    expect(str(lines[1])).toBe(en('calc.w.coriolisDir', { az: '90°' }))
    expect(lines[1].pieces).toContainEqual({ yours: '90°' })
    const sh = shareOf(s, 'coriolis')
    expect(str(lines[2])).toContain(sp(shareLines(sh.yM, sh.xM, 1000, 'mil', 'metric')[0]))
    expect(str(lines[2])).toBe(givesLine(s, 'coriolis'))
  })

  it('Coriolis without a direction has no Eötvös line; a share it can’t get, no gives line', () => {
    const s = solve({ setup: SHOT.setup })
    const lines = working('coriolis', s, env(s))
    expect(lines.map(str)).toEqual([en('calc.w.coriolis', { lat: en('calc.in.north', { v: '50' }) }), givesLine(s, 'coriolis')])
    const lost: RealSolution = { ...s, shares: { ...s.shares!, coriolis: { missing: 'reach' } } }
    expect(working('coriolis', lost, env(lost)).map(str)).toEqual([str(lines[0])])
  })

  it('curvature: one text line and a gives line', () => {
    const s = solve(SHOT)
    const lines = working('curvature', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['text', 'text'])
    expect(lines.map(str)).toEqual([en('calc.w.curvature'), givesLine(s, 'curvature')])
  })
})

describe('working: aerodynamic jump', () => {
  it('J from its printed numbers is the printed MOA', () => {
    const s = solve(SHOT)
    const lines = working('aeroJump', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'text'])
    expect([str(lines[0]), str(lines[2])]).toEqual([en('calc.f.jump'), en('calc.w.jumpUnits')])
    checkJump(s, lines[1])
    // The wind is yours only by hand.
    expect(mine(lines[1])).toEqual([])
    expect(mine(working('aeroJump', s, env(s, { windByHand: true }))[1])).toEqual(['8.9 mph'])
  })
})

describe('working: windage', () => {
  /** The hold that printed terms give: −Σ over D, in the scope's unit. */
  const holdOf = (printed: number[], s: RealSolution, sys: UnitSystem) => {
    const perM = sys === 'metric' ? 100 : 1 / 0.0254
    const H = angleFromRad(-printed.reduce((a, b) => a + b, 0) / perM / valueOf(s, 'distanceM'), s.unit)
    return rounded(+H.toFixed(9), 1)
  }
  /**
   * Checks the printed terms are the body's with k more decimals, k the fewest for which they give the hold shown; k.
   * Signed + right, as the body's `→`/`←`.
   */
  function bodyTerms(sum: string, s: RealSolution, sys: UnitSystem, parts: number[]): number {
    const printed = terms(sum)
    const at = (k: number) => parts.map((m) => Number(term(m, sys, LEFT_RIGHT, 'en', k).replace('→', '').replace('←', '-')))
    const k = [0, 1, 2, 3].find((n) => at(n).every((v, i) => v === printed[i]))
    expect(k).toBeDefined()
    expect(holdOf(printed, s, sys)).toBe(rounded(s.windage, 1))
    if (k! > 0) expect(holdOf(at(k! - 1), s, sys)).not.toBe(rounded(s.windage, 1))
    return k!
  }
  const allParts = (s: RealSolution) => [s.explain!.wind!.xM, shareOf(s, 'spinDrift').xM, shareOf(s, 'coriolis').xM]

  it('the hold is the body’s, from the body’s terms', () => {
    const s = solve(SHOT)
    const lines = working('windage', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers'])
    expect(str(lines[0])).toBe(en('calc.f.windage'))
    const [sum, d, r] = match(lines[1], `H = −\\((.+)\\) cm / ${N} m = (.+)`)
    expect(d).toBe('1000')
    expect(r).toBe(`${arrowed(s.windage, LEFT_RIGHT)} MRAD`)
    // The body's own terms give the hold here.
    expect(terms(sum)).toEqual(allParts(s).map((m) => signedTerm(m)))
    expect(bodyTerms(sum, s, 'metric', allParts(s))).toBe(0)
    expect(str(lines[1])).not.toContain('+ −')
    expect(mine(lines[1])).toEqual(['1000 m'])
  })

  it('in MOA and imperial the hold is in MOA and the terms in inches', () => {
    const s = solve({ ...SHOT, unit: 'moa' })
    const lines = working('windage', s, env(s, { sys: 'imperial' }))
    const [sum, r] = match(lines[1], `H = −\\((.+)\\) in / 1000 m = (.+)`)
    expect(r).toBe(`${arrowed(s.windage, LEFT_RIGHT)} MOA`)
    // The body's 63 + 10 + 3.0 in would give 6.6 MOA against the 6.7 shown: a decimal more.
    expect(bodyTerms(sum, s, 'imperial', allParts(s))).toBe(1)
  })

  it('a term to the left joins with −, and leaves out what is switched off', () => {
    const s = solve({ ...SHOT, setup: { ...SHOT.setup, windClock: 3 }, effects: { coriolis: false } })
    const e = env(s, { effects: { coriolis: false } })
    const [sum] = match(working('windage', s, e)[1], `H = −\\((.+)\\) cm / 1000 m = (.+)`)
    expect(sum).toMatch(/^−[\d.]+ \+ [\d.]+$/)
    bodyTerms(sum, s, 'metric', [s.explain!.wind!.xM, shareOf(s, 'spinDrift').xM])
  })

  // 161.46 + 25.46 + 8.70 cm is a hold of 1.956 MRAD, shown 2.0; the body's 161 + 25 + 8.7 would give 1.947, so 1.9.
  it('where the body’s terms would round the hold across its last digit, they keep a decimal more', () => {
    const real = solve(SHOT)
    const share = (xM: number) => ({ yM: 0, xM, on: true })
    const s: RealSolution = {
      ...real, windage: -1.9562,
      explain: { ...real.explain!, wind: { yM: 0, xM: 1.6146 } },
      shares: { ...real.shares!, spinDrift: share(0.2546), coriolis: share(0.087) },
    }
    const line = working('windage', s, env(s))[1]
    expect(str(line)).toBe('H = −(161.5 + 25.5 + 8.70) cm / 1000 m = ←2.0 MRAD')
    const [sum] = match(line, `H = −\\((.+)\\) cm / 1000 m = (.+)`)
    expect(bodyTerms(sum, s, 'metric', allParts(s))).toBe(1)
  })
})

describe('working: hit chance', () => {
  /** The body's figure for a σ part: `len`'s without its unit. */
  const bodyPart = (m: number) => len(m, 'metric').split(NBSP)[0]
  const present = (xs: (number | undefined)[]) => xs.filter((v): v is number => v !== undefined)
  /** The squared parts and the result of a σ line; checks √ of the printed squares is the printed σ, at its digits. */
  function quadrature(l: WorkLine, axis: 'x' | 'y', sigma: number) {
    const [inside, r] = match(l, `σ${axis} = √\\((.+)\\) = ${N} cm`)
    expect(inside).toMatch(/^[\d.]+²( \+ [\d.]+²)*$/)
    const parts = [...inside.matchAll(/([\d.]+)²/g)].map((m) => m[1])
    expect(`${r} cm`).toBe(sp(len(sigma, 'metric')))
    const digits = r.includes('.') ? r.split('.')[1].length : 0
    const again = Math.sqrt(nums(parts).reduce((a, v) => a + v * v, 0))
    expect(fix(+again.toFixed(9), digits, 'en')).toBe(r)
    return parts
  }

  it('the σ add in quadrature, the body’s parts in its order, and P is the code’s', () => {
    const s = solve(SHOT)
    const hit = s.hit!
    const lines = working('hit', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'symbols', 'numbers', 'text'])
    expect([str(lines[0]), str(lines[2])]).toEqual([en('calc.f.sigmaX'), en('calc.f.sigmaY')])
    expect(quadrature(lines[1], 'x', hit.sigmaX)).toEqual(present([hit.x.wind, hit.x.rifle, hit.x.hold]).map(bodyPart))
    expect(quadrature(lines[3], 'y', hit.sigmaY)).toEqual(present([hit.y.rifle, hit.y.mv, hit.y.bc, hit.y.hold]).map(bodyPart))
    expect(str(lines[4])).toContain(chanceText(hit.chance))
    expect(str(lines[4])).toBe(en('calc.w.hitP', { cm: `${num(valueOf(s, 'targetCm'), 1, 'en')} cm`, p: chanceText(hit.chance) }))
  })

  it('with an MV spread its part comes between the rifle and the BC', () => {
    const s = solve({ ...SHOT, preset: customLoad({ mvSdMs: 4 }) })
    const hit = s.hit!
    expect(hit.y.mv).toBeDefined()
    expect(quadrature(working('hit', s, env(s))[3], 'y', hit.sigmaY)).toEqual(present([hit.y.rifle, hit.y.mv, hit.y.bc, hit.y.hold]).map(bodyPart))
  })

  // 40.4, 12.4 and 5.0 cm give σ 42.55, shown 43 cm; the body's 40, 12 and 5.0 would give 42.06, so 42.
  it('where the body’s parts would round √ away from the σ shown, they keep a decimal more', () => {
    const real = solve(SHOT)
    const x = { wind: 0.404, rifle: 0.124, hold: 0.05 }
    const sigmaX = Math.hypot(x.wind, x.rifle, x.hold)
    const s: RealSolution = { ...real, hit: { ...real.hit!, x, sigmaX } }
    expect(len(sigmaX, 'metric')).toBe(`43${NBSP}cm`)
    expect(str(working('hit', s, env(s))[1])).toBe('σx = √(40.4² + 12.4² + 5.00²) = 43 cm')
    expect(quadrature(working('hit', s, env(s))[1], 'x', sigmaX)).toEqual(['40.4', '12.4', '5.00'])
  })

  it('without a rifle accuracy its part is left out', () => {
    const s = solve({ ...SHOT, preset: customLoad({}, { accuracyMoa: undefined }) })
    const lines = working('hit', s, env(s))
    expect(str(lines[1])).toMatch(/^σx = √\([\d.]+² \+ [\d.]+²\) = /)
  })

  it('with no hit, only the symbols lines', () => {
    const s: RealSolution = { ...solve(SHOT), hit: null }
    expect(working('hit', s, env(s)).map((l) => [l.kind, str(l)])).toEqual([['symbols', en('calc.f.sigmaX')], ['symbols', en('calc.f.sigmaY')]])
  })

  // No rifle accuracy, no MV SD, a BC SD of 0 % and a hold of 0 MRAD: nothing spreads up and down.
  it('with σy at 0 the chance is the closed form the code uses, and the line says so, not Simpson', () => {
    const s = solve({ ...SHOT, preset: customLoad({}, { accuracyMoa: undefined }), profile: { bcSdPct: 0, holdSigmaMrad: 0 } })
    const hit = s.hit!
    expect(hit.sigmaY).toBe(0)
    expect(hit.chance).toBeCloseTo(2 * normalCdf(0.25 / hit.sigmaX) - 1, 12)
    const [, , , sigmaY, p] = working('hit', s, env(s))
    expect(str(sigmaY)).toMatch(/ = 0\.0 cm$/)
    expect(str(p)).toBe(en('calc.w.hitPClosed', { flat: 'σy', sigma: 'σx', cm: '50 cm', p: chanceText(hit.chance) }))
    const cs = working('hit', s, env(s, { lang: 'cs' }))[4]
    expect(str(cs)).toBe(translate('cs', 'calc.w.hitPClosed', { flat: 'σy', sigma: 'σx', cm: '50 cm', p: chanceText(hit.chance) }))
    for (const l of [p, cs]) expect(str(l)).not.toContain('Simpson')
  })
})

describe('working: slope and cant', () => {
  it('the horizontal distance, and how far the rule is off', () => {
    const s = solve(SHOT)
    const lines = working('slope', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers', 'symbols', 'numbers'])
    expect([str(lines[0]), str(lines[2])]).toEqual([en('calc.f.slope'), en('calc.f.slopeDiff')])
    expect(str(lines[1])).toBe(`D_h = 1000 m · cos 10° = ${num(1000 * Math.cos((10 * Math.PI) / 180), 1, 'en')} m`)
    expect(mine(lines[1])).toEqual(['1000 m', '10°'])
    // (E_rule − E) · D from the printed elevations rounds to the printed Δ; the body's 2 decimals where they do.
    checkSlopeDiff(s, lines[3])
    expect(match(lines[3], SLOPE_DIFF('MRAD'))[2]).toBe('1000')
    expect(mine(lines[3])).toEqual(['1000 m'])
  })

  it('in MOA the elevations are the body’s MOA; in imperial the difference is in inches', () => {
    const s = solve({ ...SHOT, unit: 'moa' })
    const sl = s.explain!.slope!
    const line = working('slope', s, env(s, { sys: 'imperial' }))[3]
    // The body prints them as ↑28.32 MOA: at k = 0 the same figures.
    if (checkSlopeDiff(s, line, 'imperial') === 0) {
      const [er, e] = match(line, SLOPE_DIFF('MOA'))
      expect([er, e]).toEqual([arrowed(sl.riflemanElevation, UP_DOWN, 2).slice(1), arrowed(sl.elevation, UP_DOWN, 2).slice(1)])
    }
    expect(match(line, SLOPE_DIFF('MOA'))[3]).toMatch(/ in$/)
  })

  it('on the level, no slope working', () => {
    const s = solve({ ...SHOT, setup: { ...SHOT.setup, slopeDeg: 0 } })
    expect(s.explain!.slope).toBeNull()
    expect(working('slope', s, env(s))).toEqual([])
  })

  it('cant: sin 1° · (α · D − h) from the printed numbers is the code’s', () => {
    const s = solve(SHOT)
    const x = s.explain!
    const lines = working('cant', s, env(s))
    expect(lines.map((l) => l.kind)).toEqual(['symbols', 'numbers'])
    expect(str(lines[0])).toBe(en('calc.f.cant'))
    const [a, d, h, r] = match(lines[1], `Δx = sin 1° · \\(${N} rad · ${N} m − ${N} m\\) = (.+)`)
    expect(nums([d, h])).toEqual([1000, 0.06])
    const again = Math.sin(Math.PI / 180) * (Number(a) * Number(d) - Number(h))
    expect(Math.abs(again - x.cantPerDegM)).toBeLessThan(0.001)
    expect(r).toBe(sp(len(x.cantPerDegM, 'metric')))
    // The printed numbers give the printed figure.
    expect(sp(len(again, 'metric'))).toBe(r)
    expect(mine(lines[1])).toEqual(['1000 m'])
    const imperial = str(working('cant', s, env(s, { sys: 'imperial' }))[1])
    expect(imperial).toMatch(new RegExp(` = ${esc(sp(len(x.cantPerDegM, 'imperial')))}$`))
  })
})

describe('working: in Czech', () => {
  it('the word swaps and decimal commas', () => {
    const s = solve(SHOT)
    const e = env(s, { lang: 'cs' })
    const cs = (id: StepId, i: number) => str(working(id, s, e)[i])
    expect(cs('windage', 0)).toBe('H = −(vítr + rotace + Coriolis) / D')
    expect(cs('hit', 0)).toBe('σx = √(σvítr² + σpuška² + σdržení²)')
    expect(cs('hit', 2)).toBe('σy = √(σpuška² + σMV² + σBC² + σdržení²)')
    expect(cs('slope', 2)).toBe('Δ = (E_pravidlo − E) · D')
    expect(cs('spinDrift', 3)).toBe('SD = 1,25 · (Sg + 1,2) · t^1,83')
    expect(cs('aeroJump', 1)).toMatch(/^J = \(0,01 · \d+,\d\d+ − 0,0024 · \d+,\d+ \+ 0,032\) · 8,9\d* mph = \d+,\d\d MOA ≈ \d+(,\d)? cm$/)
    expect(cs('cant', 1)).toMatch(/^Δx = sin 1° · \(0,\d{5,8} rad · 1000 m − 0,060\d* m\) = \d+(,\d)? cm$/)
    // The latitude's `s. š.` isn't followed by a second full stop.
    expect(cs('coriolis', 0)).toBe(translate('cs', 'calc.w.coriolis', { lat: '50° s. š.' }))
    expect(cs('coriolis', 0)).not.toContain('..')
  })

  it('one separator per line: every number of every step’s working has a decimal comma in Czech', () => {
    const s = solve({ ...SHOT, unit: 'moa' })
    const steps: StepId[] = ['air', 'mv', 'flight', 'elevation', 'wind', 'spinDrift', 'coriolis', 'aeroJump', 'curvature', 'windage', 'hit', 'slope', 'cant']
    for (const sys of ['metric', 'imperial'] as const) {
      const lines = steps.flatMap((id) => working(id, s, env(s, { lang: 'cs', sys })).map(str))
      expect(lines.filter((l) => /\d\.\d/.test(l))).toEqual([])
      // The results that echo the step's own figures: the hold, the gives lines and the rule's Δ.
      expect(lines.some((l) => /= ←\d+,\d MOA$/.test(l))).toBe(true)
      expect(lines.some((l) => /^Posune zásah →\d+(,\d)? (cm|in) · \d+,\d\d MOA/.test(l))).toBe(true)
      expect(lines.some((l) => /≈ ↓\d+(,\d)? (cm|in)$/.test(l))).toBe(true)
    }
  })
})

