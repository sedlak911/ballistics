import type { BudgetSource } from '../../../engine/budget'
import { angleFromRad, LENGTH_TO_MM, toDisplay, type AngleUnit, type UnitSystem } from '../../../engine/units'
import type { T } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import type { RealExplain, RealInput, RealSolution } from '../solve'
import { LINK_SOURCE } from '../profiles'
import { arrowed, LEFT_RIGHT, NBSP, rounded, UP_DOWN, type Arrows } from './realText'

// Formatting for the calculation sheet. Like the answer, a direction comes from the value as shown (`> 0`, `< 0`), so
// whatever rounds to zero prints as a plain 0. Negative numbers in the working get a real minus sign.

const MINUS = '−'
/** What a value the sheet couldn't get prints as, in production; in development and tests the miss throws. */
const DASH = '—'

/**
 * An input's value by its key. A key the solution doesn't list is a bug in the sheet, never a 0: it throws in
 * development and tests, and in production gives NaN, which every formatter here prints as a dash.
 */
export function inputValue(inputs: RealInput[], key: string): number {
  const found = inputs.find((i) => i.key === key)
  if (found) return found.value
  if (import.meta.env.DEV) throw new Error(`calculation sheet: the solution lists no input '${key}'`)
  return NaN
}

/** Up to `digits` decimals, trailing zeros dropped; a decimal comma in Czech; never −0. */
export function num(v: number, digits: number, lang: Lang): string {
  if (!Number.isFinite(v)) return DASH
  const s = String(rounded(v, digits))
  return (lang === 'cs' ? s.replace('.', ',') : s).replace('-', MINUS)
}

/** Exactly `digits` decimals; a decimal comma in Czech; never −0. */
export function fix(v: number, digits: number, lang: Lang): string {
  if (!Number.isFinite(v)) return DASH
  const s = rounded(v, digits).toFixed(digits)
  return (lang === 'cs' ? s.replace('.', ',') : s).replace('-', MINUS)
}

/**
 * A length at the target in cm (in): one decimal below 10, whole from 10, plus `extra` where the working needs them to
 * keep its arithmetic true. Magnitude and its digits.
 */
export function lengthParts(m: number, sys: UnitSystem, extra = 0): { value: number; digits: number; unit: string } {
  const d = toDisplay(Math.abs(m), 'length', sys)
  const digits = (rounded(d.value, 1) < 10 ? 1 : 0) + extra
  return { value: rounded(d.value, digits), digits, unit: d.unit }
}

/** `7.7 cm`, `26 cm`: magnitude with its unit; figures keep the point unless a language is given. */
export function len(m: number, sys: UnitSystem, lang: Lang = 'en'): string {
  if (!Number.isFinite(m)) return DASH
  const { value, digits, unit } = lengthParts(m, sys)
  return `${fix(value, digits, lang)}${NBSP}${unit}`
}

/** A term of a sum: `→7.7` (`→7,7` in Czech), `←26`, or `0`, without the unit; `extra` decimals for the working. */
export function term(m: number, sys: UnitSystem, arrows: Arrows, lang: Lang = 'en', extra = 0): string {
  if (!Number.isFinite(m)) return DASH
  const { value, digits } = lengthParts(m, sys, extra)
  if (value === 0) return '0'
  return `${m > 0 ? arrows[1] : arrows[0]}${fix(value, digits, lang)}`
}

/** `→26 cm`, `↓9.1 cm`, or `0.0 cm` when it rounds to nothing: a figure, so it keeps the point unless a language is given. */
export function signedLen(m: number, sys: UnitSystem, arrows: Arrows, lang: Lang = 'en'): string {
  const t = term(m, sys, arrows, lang)
  if (t === DASH) return DASH
  return t === '0' ? len(0, sys, lang) : `${t}${NBSP}${lengthParts(m, sys).unit}`
}

/** The scope unit's label inside REAL. */
export const angleLabel = (unit: AngleUnit) => (unit === 'mil' ? 'MRAD' : 'MOA')

// Figures that a step's body and its working (calcWorking.ts) both print, built once so the two can't drift apart.

/** Step 4's height of the hit against the line of sight, magnitude: `0.214 m` under 1 m, `2.14 m` from 1 m. */
export function hitHeightText(yM: number, lang: Lang): string {
  const y = Math.abs(yM)
  return `${fix(y, y < 1 ? 3 : 2, lang)}${NBSP}m`
}

/** Step 4's angle, |y| / D: `3.57 MRAD`, and in MOA the elevation after it, `3.57 MRAD = 12.27 MOA`. */
export function elevationAngleText(yM: number, d: number, elevation: number, unit: AngleUnit, lang: Lang): string {
  const mrad = `${fix((Math.abs(yM) / d) * 1000, 2, lang)}${NBSP}MRAD`
  return unit === 'moa' ? `${mrad} = ${fix(Math.abs(elevation), 2, lang)}${NBSP}MOA` : mrad
}

/**
 * Step 5's lag-rule figures, without units: the crosswind `w` (m/s), the time of flight `t` and the delay `lag` (s), the
 * distance `d` (m), the MV `v` (m/s) and the drift (m), magnitudes.
 */
export function lagFigures(
  lag: { crossMs: number; timeS: number; vacuumTimeS: number; driftM: number }, d: number, lang: Lang,
): { w: string; t: string; d: string; v: string; lag: string; drift: string } {
  return {
    w: fix(Math.abs(lag.crossMs), 1, lang),
    t: fix(lag.timeS, 3, lang),
    d: num(d, 1, lang),
    v: num(d / lag.vacuumTimeS, 1, lang),
    lag: fix(lag.timeS - lag.vacuumTimeS, 3, lang),
    drift: fix(Math.abs(lag.driftM), 2, lang),
  }
}

const IN_M = 0.0254
/** The one mm-per-inch of the calculation sheet and its working. */
export const MM_PER_IN = LENGTH_TO_MM.in

// `extra`: the decimals the working adds where the body's would make its printed arithmetic round across (calcWorking.ts).

/** Miller's Sg, as steps 6 and 8 print it: `2.55`. */
export const sgText = (sg: number, lang: Lang, extra = 0): string => fix(sg, 2 + extra, lang)

/** Step 6's Litz figures, without units: Sg, the time of flight (s) and the drift in inches, a magnitude. */
export function litzFigures(sg: number, timeS: number, driftM: number, lang: Lang, extra = 0): { sg: string; t: string; in: string } {
  return { sg: sgText(sg, lang, extra), t: fix(timeS, 3 + extra, lang), in: fix(Math.abs(driftM) / IN_M, 1, lang) }
}

/** Step 8's bullet length in calibres: `4.6`. */
export const calibresText = (lengthMm: number, diameterIn: number, lang: Lang, extra = 0): string =>
  fix(lengthMm / MM_PER_IN / diameterIn, 1 + extra, lang)

/** The crosswind at the muzzle, m/s, + blowing right: the lag rule's, or with zones the near one's (the aerodynamic jump's). */
export const muzzleCrossMs = (x: RealExplain): number => x.lag?.crossMs ?? x.zones?.[0].crossMs ?? 0

/** Step 7's latitude: `50° N`, `33.87° S`. */
export const latitudeText = (lat: number, t: T, lang: Lang): string =>
  t(lat < 0 ? 'calc.in.south' : 'calc.in.north', { v: num(Math.abs(lat), 2, lang) })

/** An angle in degrees, as the azimuth and the slope print it: `90°`, `10.5°`. */
export const degreesText = (deg: number, lang: Lang): string => `${num(deg, 1, lang)}°`

/** The windage's sum, m, + right: the wind's own share, then the spin drift and Coriolis when they are on. */
export function windageParts(s: RealSolution): number[] {
  const parts = [s.explain?.wind?.xM ?? 0]
  for (const e of ['spinDrift', 'coriolis'] as const) {
    const sh = s.shares?.[e]
    if (sh && !('missing' in sh) && sh.on) parts.push(sh.xM)
  }
  return parts
}

/** The windage's hold, a figure: `←0.4 MRAD`; with a language its separator (`←0,4 MRAD`), as the working writes it. */
export function holdText(windage: number, unit: AngleUnit, lang: Lang = 'en'): string {
  const a = arrowed(windage, LEFT_RIGHT)
  return `${lang === 'cs' ? a.replace('.', ',') : a}${NBSP}${angleLabel(unit)}`
}

/** The hit chance's sources per axis, in the sheet's order. */
export const SIGMA_X: BudgetSource[] = ['wind', 'rifle', 'hold']
export const SIGMA_Y: BudgetSource[] = ['rifle', 'mv', 'bc', 'hold']

/** A source's σ at the target, the figure of `len` without its unit: `4.9`, `12`; `extra` decimals for the working. */
export function sigmaPart(m: number, sys: UnitSystem, lang: Lang, extra = 0): string {
  if (!Number.isFinite(m)) return DASH
  const { value, digits } = lengthParts(m, sys, extra)
  return fix(value, digits, lang)
}

/**
 * An effect's share as the sheet's result lines: one per axis that shows, `→26 cm · 0.26 MRAD`, the horizontal first;
 * one `0.0 cm · 0.00 MRAD` line when neither does. + up and + right, at distance `d`. Figures keep the point unless a
 * language is given (the working's).
 */
export function shareLines(yM: number, xM: number, d: number, unit: AngleUnit, sys: UnitSystem, lang: Lang = 'en'): string[] {
  const line = (m: number, arrows: Arrows) =>
    `${signedLen(m, sys, arrows, lang)} · ${fix(angleFromRad(Math.abs(m) / d, unit), 2, lang)}${NBSP}${angleLabel(unit)}`
  const out: string[] = []
  if (term(xM, sys, LEFT_RIGHT) !== '0') out.push(line(xM, LEFT_RIGHT))
  if (term(yM, sys, UP_DOWN) !== '0') out.push(line(yM, UP_DOWN))
  return out.length > 0 ? out : [line(0, LEFT_RIGHT)]
}

/** An input you set: yours, from a link, trued, a manual station field, the distance and the slope, and the wind by hand. */
export function isYours(i: RealInput | null, windByHand: boolean): boolean {
  if (!i) return false
  if (i.key === 'windMs' || i.key === 'windClock') return windByHand
  if (i.key === 'truedAtM' || i.key === 'distanceM' || i.key === 'slopeDeg') return true
  return i.source === 'yours' || i.source === LINK_SOURCE || i.source === 'manual'
}
