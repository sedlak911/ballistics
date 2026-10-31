import { angleFromRad, toDisplay, type AngleUnit, type UnitSystem } from '../../../engine/units'
import type { Lang } from '../../../settings/url'
import type { RealInput } from '../solve'
import { LEFT_RIGHT, NBSP, rounded, UP_DOWN, type Arrows } from './realText'

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

/** A length at the target in cm (in): one decimal below 10, whole from 10. Magnitude and its digits. */
function lengthParts(m: number, sys: UnitSystem): { value: number; digits: number; unit: string } {
  const d = toDisplay(Math.abs(m), 'length', sys)
  const digits = rounded(d.value, 1) < 10 ? 1 : 0
  return { value: rounded(d.value, digits), digits, unit: d.unit }
}

/** `7.7 cm`, `26 cm`: magnitude with its unit; figures keep the point unless a language is given. */
export function len(m: number, sys: UnitSystem, lang: Lang = 'en'): string {
  if (!Number.isFinite(m)) return DASH
  const { value, digits, unit } = lengthParts(m, sys)
  return `${fix(value, digits, lang)}${NBSP}${unit}`
}

/** A term of a sum: `→7.7` (`→7,7` in Czech), `←26`, or `0`, without the unit. */
export function term(m: number, sys: UnitSystem, arrows: Arrows, lang: Lang = 'en'): string {
  if (!Number.isFinite(m)) return DASH
  const { value, digits } = lengthParts(m, sys)
  if (value === 0) return '0'
  return `${m > 0 ? arrows[1] : arrows[0]}${fix(value, digits, lang)}`
}

/** `→26 cm`, `↓9.1 cm`, or `0.0 cm` when it rounds to nothing: a figure, so it keeps the point. */
export function signedLen(m: number, sys: UnitSystem, arrows: Arrows): string {
  const t = term(m, sys, arrows)
  if (t === DASH) return DASH
  return t === '0' ? len(0, sys) : `${t}${NBSP}${lengthParts(m, sys).unit}`
}

/** The scope unit's label inside REAL. */
export const angleLabel = (unit: AngleUnit) => (unit === 'mil' ? 'MRAD' : 'MOA')

/**
 * An effect's share as the sheet's result lines: one per axis that shows, `→26 cm · 0.26 MRAD`, the horizontal first;
 * one `0.0 cm · 0.00 MRAD` line when neither does. + up and + right, at distance `d`.
 */
export function shareLines(yM: number, xM: number, d: number, unit: AngleUnit, sys: UnitSystem): string[] {
  const line = (m: number, arrows: Arrows) =>
    `${signedLen(m, sys, arrows)} · ${fix(angleFromRad(Math.abs(m) / d, unit), 2, 'en')}${NBSP}${angleLabel(unit)}`
  const out: string[] = []
  if (term(xM, sys, LEFT_RIGHT) !== '0') out.push(line(xM, LEFT_RIGHT))
  if (term(yM, sys, UP_DOWN) !== '0') out.push(line(yM, UP_DOWN))
  return out.length > 0 ? out : [line(0, LEFT_RIGHT)]
}
