import { saturationVaporPressureHPa } from '../../../engine/atmosphere'
import type { BudgetSource } from '../../../engine/budget'
import { millerTerms, MPH_PER_MS } from '../../../engine/spin'
import { angleFromRad, radFromAngle, toDisplay, type UnitSystem } from '../../../engine/units'
import type { T, TKey } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import type { Effect } from '../profile'
import type { RealSolution } from '../solve'
import {
  angleLabel, calibresText, degreesText, elevationAngleText, fix, hitHeightText, holdText, inputValue, lagFigures, latitudeText, len,
  lengthParts, litzFigures, MM_PER_IN, muzzleCrossMs, num, sgText, shareLines, SIGMA_X, SIGMA_Y, sigmaPart, signedLen, term, windageParts,
} from './calcText'
import { chanceText, clickDigits, LEFT_RIGHT, lengthText, NBSP, rounded, UP_DOWN } from './realText'

// The working under a step's ⓘ (spec §6): the step's formula in symbols, then the same formula with this shot's numbers
// and the result. The formulas are the code's own (solve.ts and the engine), every number is one the step uses, formatted
// as the step's body formats it, and a value you set is a `{ yours }` piece, green like the body's.

export type Piece = string | { yours: string }
export interface WorkLine { kind: 'symbols' | 'numbers' | 'text'; pieces: Piece[] }
export type StepId =
  | 'air' | 'mv' | 'flight' | 'elevation' | 'wind' | 'spinDrift' | 'coriolis' | 'aeroJump' | 'curvature' | 'windage' | 'hit' | 'slope' | 'cant'
export interface WorkEnv { t: T; lang: Lang; sys: UnitSystem; effects: Record<Effect, boolean>; yours: (key: string) => boolean }

const MINUS = '−'

/** `{name}` placeholders replaced by pieces; a Piece[] value is spliced in; text between stays as strings. */
export function fill(template: string, values: Record<string, Piece | Piece[]>): Piece[] {
  const out: Piece[] = []
  let at = 0
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index > at) out.push(template.slice(at, m.index))
    const v = values[m[1]]
    // A placeholder without a value stays as written, as `translate` leaves it.
    if (v === undefined) out.push(m[0])
    else if (Array.isArray(v)) out.push(...v)
    else out.push(v)
    at = m.index + m[0].length
  }
  if (at < template.length) out.push(template.slice(at))
  return out
}

type FormulaId =
  | 'qnh' | 'vapour' | 'density' | 'mv' | 'elevation' | 'clicks' | 'leftOver' | 'clicksCapped' | 'lag' | 'zones'
  | 'miller' | 'litz' | 'jump' | 'windage' | 'sigmaX' | 'sigmaY' | 'slope' | 'slopeDiff' | 'cant'
type Values = Record<string, Piece | Piece[]>

/** What every step's working reads: the solution, the display, and the helpers that format and mark its figures. */
interface Ctx {
  s: RealSolution
  env: WorkEnv
  /** An input the solution always lists (a miss throws in development, as in the sheet). */
  val: (key: string) => number
  /** An input a custom item may lack. */
  opt: (key: string) => number | null
  /** A figure, marked yours when you set the input `key` it prints. */
  of: (text: string, key: string) => Piece
  /** The formula's two lines; its symbols alone when the solution lacks its numbers (`null`). */
  formula: (id: FormulaId, values: Values | null) => WorkLine[]
  text: (key: TKey, values?: Values) => WorkLine
  /** The distance in metres, as the body prints it (in brackets under imperial); always yours. */
  distance: Piece
  /** What an effect moves the hit, as the step's result prints it; none for a share the solution couldn't get. */
  gives: (e: Effect) => WorkLine[]
}

/** A figure and its unit, never split across lines. */
const withUnit = (v: string, u: string) => `${v}${NBSP}${u}`

function context(s: RealSolution, env: WorkEnv): Ctx {
  const { t, lang } = env
  const val = (key: string) => inputValue(s.inputs, key)
  const text = (key: TKey, values: Values = {}): WorkLine => ({ kind: 'text', pieces: fill(t(key), values) })
  return {
    s,
    env,
    val,
    opt: (key) => s.inputs.find((i) => i.key === key)?.value ?? null,
    of: (text, key) => (env.yours(key) ? { yours: text } : text),
    formula: (id, values) => {
      const symbols: WorkLine = { kind: 'symbols', pieces: [t(`calc.f.${id}`)] }
      return values === null ? [symbols] : [symbols, { kind: 'numbers', pieces: fill(t(`calc.n.${id}`), values) }]
    },
    text,
    distance: { yours: withUnit(num(val('distanceM'), 1, lang), 'm') },
    gives: (e) => {
      const sh = s.shares?.[e]
      if (!s.reached || !sh || 'missing' in sh) return []
      return [text('calc.w.gives', { v: shareLines(sh.yM, sh.xM, val('distanceM'), s.unit, env.sys, lang).join('; ') })]
    },
  }
}

/** Step 1, as airState and stationFromQnh compute it (engine/atmosphere.ts). */
function air({ env, val, opt, of, formula }: Ctx): WorkLine[] {
  const { lang } = env
  const tempC = val('tempC')
  const p = val('stationPressureHPa')
  const qnh = opt('qnhHPa')
  // With the humidity effect off the flight flies dry air: e is 0 in the density the step shows.
  const rh = env.effects.humidity ? val('humidityPct') / 100 : 0
  const e = fix(rh * saturationVaporPressureHPa(tempC), 2, lang)
  const t = of(num(tempC, 1, lang), 'tempC')
  return [
    ...(qnh === null
      ? []
      : formula('qnh', { q: of(fix(qnh, 1, lang), 'qnhHPa'), h: of(num(val('altitudeM'), 0, lang), 'altitudeM'), r: withUnit(fix(p, 1, lang), 'hPa') })),
    // A 0 for the switched-off humidity isn't the humidity you set.
    ...formula('vapour', { rh: env.effects.humidity ? of(fix(rh, 2, lang), 'humidityPct') : fix(0, 2, lang), t, r: withUnit(e, 'hPa') }),
    ...formula('density', {
      p: of(fix(p, 1, lang), 'stationPressureHPa'), e, T: of(fix(tempC + 273.15, 2, lang), 'tempC'),
      r: withUnit(fix(val('densityKgM3'), 3, lang), 'kg/m³'),
    }),
  ]
}

/** Step 2, as muzzleVelocityAt (engine/spin.ts) in flightBasis (solve.ts). */
function mv({ s, env, val, opt, of, formula, text }: Ctx): WorkLine[] {
  const { lang } = env
  const ref = val('muzzleVelocityMs')
  const sens = opt('powderSensMsPerC')
  const refTemp = opt('mvRefTempC')
  if (sens === null || refTemp === null) return [text('calc.w.mvNone', { v: of(withUnit(num(ref, 1, lang), 'm/s'), 'muzzleVelocityMs') })]
  // The shifted MV, the effect on or off; a shot that falls short has no explanation, and its MV used is the shifted one
  // only with the effect on.
  const shifted = s.explain?.shiftedMvMs ?? (env.effects.powderTemp ? val('mvUsedMs') : null)
  return formula('mv', shifted === null ? null : {
    v: of(num(ref, 1, lang), 'muzzleVelocityMs'), k: of(num(sens, 2, lang), 'powderSensMsPerC'),
    tp: of(num(val('powderTempC'), 1, lang), 'powderTempC'), tr: of(num(refTemp, 1, lang), 'mvRefTempC'),
    r: withUnit(num(shifted, 1, lang), 'm/s'),
  })
}

/** Step 3: the simulation (engine/flight.ts) has no formula to show, only its method and what it produced. */
function flight({ s, env, text, distance }: Ctx): WorkLine[] {
  const { lang } = env
  const sim = text('calc.w.sim', { method: env.t('calc.in.method') })
  if (!s.reached) return [sim]
  return [sim, text('calc.w.flight', {
    d: distance, t: withUnit(fix(s.timeS, 3, lang), 's'), v: withUnit(num(s.velocityMs, 0, lang), 'm/s'), m: fix(s.mach, 2, lang),
  })]
}

/**
 * The working's one rule for digits: its figures print as the body prints them, with `k` more decimals only where the
 * body's would make the printed numbers give a different result than the one printed, at the result's own digits. The
 * fewest `k` from 0 to `max` for which they give it; `max` when none does.
 */
const extraDecimals = (gives: (k: number) => boolean, max = 3): number => {
  for (let k = 0; k < max; k++) if (gives(k)) return k
  return max
}
/** Rounded as a reader rounds what they worked out from printed figures: 1.45, not 1.4500000000000002. */
const readerRounded = (v: number, digits: number): number => rounded(+v.toFixed(9), digits)

/** Step 4: the elevation (solveReal's toUnit) and the clicks, as dialFor (engine/dial.ts) gives them. */
function elevation({ s, env, val, of, formula, distance }: Ctx): WorkLine[] {
  const { lang } = env
  const x = s.explain
  if (!s.reached || x === null) return [...formula('elevation', null), ...formula('clicks', null)]
  const U = angleLabel(s.unit)
  const d = val('distanceM')
  const E = Math.abs(s.elevation)
  // The body's figures: the angle in MRAD, and in MOA the same angle in MOA after it.
  const lines = formula('elevation', {
    y: hitHeightText(x.hitYM, lang), d: distance, r: elevationAngleText(x.hitYM, d, s.elevation, s.unit, lang),
  })

  const click = val('clickValue')
  const digits = clickDigits(click)
  const n = Math.abs(s.dial.clicks)
  const c = of(withUnit(num(click, 3, lang), U), 'clickValue')
  // E prints with the body's 2 decimals, more where 2 would round the clicks (or the hold) across.
  const eText = (gives: (e: number) => boolean) => withUnit(fix(E, 2 + extraDecimals((k) => gives(rounded(E, 2 + k))), lang), U)
  // Capped as the body tells it: a hold that shows at the click's digits.
  if (rounded(s.dial.hold, digits) > 0) {
    const e = eText((v) => readerRounded(v - n * click, digits) === rounded(s.dial.hold, digits))
    return [...lines, ...formula('clicksCapped', {
      e, c, tr: of(withUnit(num(val('travelUp'), 2, lang), U), 'travelUp'), n: String(n), r: withUnit(fix(s.dial.hold, digits, lang), U),
    })]
  }
  const e = eText((v) => readerRounded(v / click, 0) === n)
  // The body's figure; signed like the formula, since the clicks may overshoot the angle by under half a click.
  const left = lengthText(radFromAngle(s.dial.remainder, s.unit) * d, env.sys)
  const over = E - n * click < 0 && !left.startsWith(`0${NBSP}`)
  return [
    ...lines,
    ...formula('clicks', { e, c, r: String(n) }),
    ...formula('leftOver', { e, n: String(n), c, d: distance, r: `${over ? MINUS : ''}${left}` }),
  ]
}

/** Step 5: the lag rule, the check on the flight's drift (explainShot), or with zones each zone's 1 m/s drift (zoneLines). */
function wind({ s, env, val, of, formula, text, distance }: Ctx): WorkLine[] {
  const { lang } = env
  const x = s.explain
  if (!s.reached || x === null) return formula('lag', null)
  if (x.zones !== null) {
    const legend = text('calc.w.zones')
    if (x.wind === null) return [...formula('zones', null), legend]
    // As the body: a zone is yours with a wind of its own, or following a near wind you set by hand.
    const windYours = env.yours('windMs')
    // What the printed parts multiply to; the rest is what they leave of the drift, so the line adds up as printed.
    let sum = 0
    const parts = x.zones.flatMap((z, i): Piece[] => {
      const w = rounded(z.crossMs, 1)
      sum += w * rounded(z.perMsM, 3)
      // After the first term a crosswind from the right joins with − and prints its magnitude, never `+ −`.
      const join = i === 0 ? [] : [w < 0 ? ` ${MINUS} ` : ' + ']
      const wText = fix(i === 0 ? z.crossMs : Math.abs(z.crossMs), 1, lang)
      return [...join, z.own || windYours ? { yours: wText } : wText, ` · ${fix(z.perMsM, 3, lang)}`]
    })
    const rest = x.wind.xM - sum
    return [...formula('zones', {
      parts, rest: `${rounded(rest, 3) < 0 ? MINUS : '+'} ${fix(Math.abs(rest), 3, lang)}`, r: withUnit(fix(x.wind.xM, 2, lang), 'm'),
    }), legend]
  }
  const lag = x.lag
  if (lag === null) return formula('lag', null)
  const f = lagFigures(lag, val('distanceM'), lang)
  const lines = formula('lag', {
    w: of(withUnit(f.w, 'm/s'), 'windMs'), t: withUnit(f.t, 's'), d: distance, v: withUnit(f.v, 'm/s'), lag: withUnit(f.lag, 's'),
    r: withUnit(f.drift, 'm'),
  })
  return x.wind === null ? lines : [...lines, text('calc.w.windFlight', { r: withUnit(fix(Math.abs(x.wind.xM), 2, lang), 'm') })]
}

/** Step 6: Miller's Sg (engine/spin.ts millerSg, from millerTerms), then Litz's drift (spinDriftM) at the time of flight. */
function spinDrift({ s, env, val, opt, of, formula, text }: Ctx): WorkLine[] {
  const { lang, sys } = env
  const sg = opt('sg')
  const share = s.shares?.spinDrift
  // No Sg without the twist, the bullet's length and its diameter (solveReal's `bullet`).
  if (!s.reached || sg === null || !share || 'missing' in share) return [...formula('miller', null), ...formula('litz', null)]
  // The inputs as solveReal hands them to millerSg: the shot's MV and the measured air.
  const m = millerTerms(
    { massGr: val('massGr'), diameterIn: val('diameterIn'), lengthIn: val('lengthMm') / MM_PER_IN },
    val('twistIn'), val('mvUsedMs'), val('tempC'), val('stationPressureHPa'),
  )
  // Every rounded figure of Miller's gets the same k: the length alone moves Sg by up to 0.3 %, and v, T and P can tip a
  // result that sits near its last digit.
  const digits = (k: number) => ({ m: 1 + k, tw: 2 + k, d: 3 + k, l: 2 + k, v: k, T: 1 + k, P: 2 + k })
  const km = extraDecimals((k) => {
    const g = digits(k)
    const [M, tw, d, l, v, T, P] = [rounded(m.massGr, g.m), rounded(m.twistCal, g.tw), rounded(m.diameterIn, g.d), rounded(m.lengthCal, g.l),
      rounded(m.vFtS, g.v), rounded(m.tempF, g.T), rounded(m.pressureInHg, g.P)]
    const again = ((30 * M) / (tw ** 2 * d ** 3 * l * (1 + l ** 2))) * (v / 2800) ** (1 / 3) * ((T + 460) / 519) * (29.92 / P)
    return readerRounded(again, 2) === rounded(sg, 2)
  })
  const g = digits(km)
  // Litz's Sg and t, the same way at the inches' one decimal.
  const inches = litzFigures(sg, s.timeS, share.xM, lang).in
  const kl = extraDecimals((k) => fix(readerRounded(1.25 * (rounded(sg, 2 + k) + 1.2) * rounded(s.timeS, 3 + k) ** 1.83, 1), 1, lang) === inches)
  const f = litzFigures(sg, s.timeS, share.xM, lang, kl)
  const r = withUnit(f.in, 'in')
  return [
    ...formula('miller', {
      m: of(num(m.massGr, g.m, lang), 'massGr'), tw: of(fix(m.twistCal, g.tw, lang), 'twistIn'), d: of(num(m.diameterIn, g.d, lang), 'diameterIn'),
      l: of(fix(m.lengthCal, g.l, lang), 'lengthMm'), v: num(m.vFtS, g.v, lang), T: of(num(m.tempF, g.T, lang), 'tempC'),
      P: of(fix(m.pressureInHg, g.P, lang), 'stationPressureHPa'), r: sgText(sg, lang),
    }),
    text('calc.w.millerUnits'),
    // Litz gives inches; in the sheet's length unit too, unless that is inches.
    ...formula('litz', { sg: f.sg, t: withUnit(f.t, 's'), r: sys === 'imperial' ? r : `${r} = ${len(share.xM, sys, lang)}` }),
  ]
}

/** Step 7: the simulation adds −2 Ω × v (engine/flight.ts), its horizontal part only with an azimuth; the share it gives. */
function coriolis({ env, val, opt, of, text, gives }: Ctx): WorkLine[] {
  const { t, lang } = env
  const azimuth = opt('azimuthDeg')
  return [
    text('calc.w.coriolis', { lat: of(latitudeText(val('latitudeDeg'), t, lang), 'latitudeDeg') }),
    ...(azimuth === null ? [] : [text('calc.w.coriolisDir', { az: of(degreesText(azimuth, lang), 'azimuthDeg') })]),
    ...gives('coriolis'),
  ]
}

/** Step 8: Litz's jump (engine/spin.ts aeroJumpRad) for the crosswind at the muzzle, in MOA, then at the target. */
function aeroJump({ s, env, val, opt, of, formula, text }: Ctx): WorkLine[] {
  const { lang, sys } = env
  const sg = opt('sg')
  const share = s.shares?.aeroJump
  const x = s.explain
  if (!s.reached || x === null || sg === null || !share || 'missing' in share) return formula('jump', null)
  // |J| from the code's own share; its sign (up or down) is the step's result.
  const moa = angleFromRad(Math.abs(share.yM) / val('distanceM'), 'moa')
  const lengthMm = val('lengthMm')
  const diameterIn = val('diameterIn')
  const mph = Math.abs(muzzleCrossMs(x)) * MPH_PER_MS
  // Sg, L and W at the body's digits, more where they would round J across its second decimal.
  const k = extraDecimals((n) => readerRounded(
    (0.01 * rounded(sg, 2 + n) - 0.0024 * rounded(lengthMm / MM_PER_IN / diameterIn, 1 + n) + 0.032) * rounded(mph, 1 + n), 2,
  ) === rounded(moa, 2))
  return [
    ...formula('jump', {
      sg: sgText(sg, lang, k), l: of(calibresText(lengthMm, diameterIn, lang, k), 'lengthMm'),
      w: of(withUnit(fix(mph, 1 + k, lang), 'mph'), 'windMs'),
      r: `${withUnit(fix(moa, 2, lang), 'MOA')} ≈ ${len(share.yM, sys, lang)}`,
    }),
    text('calc.w.jumpUnits'),
  ]
}

/** Step 9: the simulation turns gravity toward the earth's centre (engine/flight.ts); the share it gives. */
function curvature({ text, gives }: Ctx): WorkLine[] {
  return [text('calc.w.curvature'), ...gives('curvature')]
}

/** The windage: −hitXM / D (solveReal's toUnit), with the body's sum of the wind, the spin drift and Coriolis. */
function windage({ s, env, val, formula, distance }: Ctx): WorkLine[] {
  const { lang, sys } = env
  if (!s.reached || s.explain === null) return formula('windage', null)
  const parts = windageParts(s)
  const perM = toDisplay(1, 'length', sys).value
  const d = rounded(val('distanceM'), 1)
  // The body's terms, more decimals only where they would round the hold across its last digit.
  const extra = extraDecimals((k) => {
    const sum = parts.reduce((a, m) => a + Math.sign(m) * lengthParts(m, sys, k).value, 0)
    return readerRounded(angleFromRad(-sum / perM / d, s.unit), 1) === rounded(s.windage, 1)
  })
  // + right: after the first, a term to the left joins with − and prints its magnitude.
  const terms = parts.map((m, i) => {
    const tm = term(m, sys, LEFT_RIGHT, lang, extra)
    const left = tm.startsWith(LEFT_RIGHT[0])
    const magnitude = tm === '0' ? tm : tm.slice(1)
    if (i === 0) return left ? `${MINUS}${magnitude}` : magnitude
    return `${left ? ` ${MINUS} ` : ' + '}${magnitude}`
  })
  return formula('windage', { parts: terms, u: toDisplay(1, 'length', sys).unit, d: distance, r: holdText(s.windage, s.unit, lang) })
}

/** Step 10: the σ per axis in quadrature (engine/budget.ts errorBudget), then hitChanceCircle's integral. */
function hit({ s, env, val, of, formula, text }: Ctx): WorkLine[] {
  const { lang, sys } = env
  const h = s.hit
  if (h === null) return [...formula('sigmaX', null), ...formula('sigmaY', null)]
  // The body's parts, more decimals only where √ of their squares would round away from the σ shown.
  const squares = (budget: Partial<Record<BudgetSource, number>>, order: BudgetSource[], sigma: number) => {
    const parts = order.flatMap((source) => (budget[source] === undefined ? [] : [budget[source]]))
    const r = lengthParts(sigma, sys)
    const extra = extraDecimals((k) =>
      readerRounded(Math.sqrt(parts.reduce((a, m) => a + lengthParts(m, sys, k).value ** 2, 0)), r.digits) === r.value)
    return parts.map((m) => `${sigmaPart(m, sys, lang, extra)}²`).join(' + ')
  }
  const cm = of(withUnit(num(val('targetCm'), 1, lang), 'cm'), 'targetCm')
  const p = chanceText(h.chance)
  return [
    ...formula('sigmaX', { parts: squares(h.x, SIGMA_X, h.sigmaX), r: len(h.sigmaX, sys, lang) }),
    ...formula('sigmaY', { parts: squares(h.y, SIGMA_Y, h.sigmaY), r: len(h.sigmaY, sys, lang) }),
    // As hitChanceCircle: a σ of 0 leaves one axis, whose share has a closed form (σx keeps the wind's, so it never is;
    // both at 0 is the same form's limit, 1).
    h.sigmaX <= 0 || h.sigmaY <= 0
      ? text('calc.w.hitPClosed', { flat: h.sigmaY <= 0 ? 'σy' : 'σx', sigma: h.sigmaY <= 0 ? 'σx' : 'σy', cm, p })
      : text('calc.w.hitP', { cm, p }),
  ]
}

/** The slope: the rifleman's rule flies D · cos θ (explainShot), and lands Δ off the exact answer. */
function slope({ s, env, val, of, formula, distance }: Ctx): WorkLine[] {
  const { lang, sys } = env
  const sl = s.explain?.slope ?? null
  if (sl === null) return []
  const U = angleLabel(s.unit)
  const d = rounded(val('distanceM'), 1)
  const r = signedLen(sl.differenceM, sys, UP_DOWN, lang)
  // Both elevations at the body's 2 decimals, more where (E_rule − E) · D would land on another Δ than the one printed:
  // 0.01 MRAD is 1 cm at 1000 m, and Δ prints to the mm.
  const k = extraDecimals((n) => {
    const diff = readerRounded(rounded(sl.riflemanElevation, 2 + n) - rounded(sl.elevation, 2 + n), 2 + n)
    return signedLen(radFromAngle(diff, s.unit) * d, sys, UP_DOWN, lang) === r
  })
  return [
    ...formula('slope', { d: distance, deg: of(degreesText(val('slopeDeg'), lang), 'slopeDeg'), r: withUnit(num(sl.horizontalM, 1, lang), 'm') }),
    ...formula('slopeDiff', {
      er: withUnit(fix(sl.riflemanElevation, 2 + k, lang), U), e: withUnit(fix(sl.elevation, 2 + k, lang), U), d: distance, r,
    }),
  ]
}

/** Cant: sin 1° · (α · D − h), as explainShot computes cantPerDegM. */
function cant({ s, env, val, of, formula, distance }: Ctx): WorkLine[] {
  const { lang, sys } = env
  const x = s.explain
  if (!s.reached || x === null) return formula('cant', null)
  const h = val('sightHeightMm') / 1000
  const d = rounded(val('distanceM'), 1)
  const r = len(x.cantPerDegM, sys, lang)
  // α to 5 decimals of a radian, h to the mm; more only where they would round the result across its last digit.
  const extra = extraDecimals((k) => len(Math.sin(Math.PI / 180) * (rounded(x.cantAlphaRad, 5 + k) * d - rounded(h, 3 + k)), sys, lang) === r)
  return formula('cant', {
    a: withUnit(fix(x.cantAlphaRad, 5 + extra, lang), 'rad'), d: distance,
    h: of(withUnit(fix(h, 3 + extra, lang), 'm'), 'sightHeightMm'), r,
  })
}

const STEPS: Record<StepId, (c: Ctx) => WorkLine[]> = {
  air, mv, flight, elevation, wind, spinDrift, coriolis, aeroJump, curvature, windage, hit, slope, cant,
}

/** A step's working; [] for a step without one (the slope on the level). */
export function working(step: StepId, s: RealSolution, env: WorkEnv): WorkLine[] {
  return STEPS[step](context(s, env))
}
