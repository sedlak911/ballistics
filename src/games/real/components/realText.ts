import { SPEED_TO_MS, toDisplay, type UnitSystem } from '../../../engine/units'
import type { T } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import type { WindUnit } from '../profile'

// Formatting for the REAL answer. Directions come from the value as rounded for display, `> 0` or `< 0`, so a value
// that rounds to zero prints as a plain 0 with no arrow and no sign: never "-0" or "↑0.0".

export const NBSP = ' '
const NNBSP = ' '

/** Rounded to `digits`, halves away from zero so a hold left and a hold right round alike; −0 becomes 0. */
export const rounded = (v: number, digits: number): number => {
  const k = 10 ** digits
  return (Math.sign(v) * Math.round(Math.abs(v) * k)) / k + 0
}

/** `[for negative, for positive]`, e.g. `['↓', '↑']` for elevation, `['←', '→']` for windage. */
export type Arrows = readonly [string, string]
export const UP_DOWN: Arrows = ['↓', '↑']
export const LEFT_RIGHT: Arrows = ['←', '→']

/** A hero or column figure: the arrow, then the magnitude; `0` when it rounds to zero. Figures keep the decimal point. */
export function arrowed(v: number, arrows: Arrows, digits = 1): string {
  const r = rounded(v, digits)
  if (r === 0) return '0'
  return `${r > 0 ? arrows[1] : arrows[0]}${Math.abs(r).toFixed(digits)}`
}

/** A number inside a sentence: Czech writes a decimal comma there (the mockups do), figures keep the point. */
export function dec(v: number, digits: number, lang: Lang): string {
  const s = rounded(v, digits).toFixed(digits)
  return lang === 'cs' ? s.replace('.', ',') : s
}

/** A length at the target, magnitude only: whole cm, or whole inches in imperial. */
export function lengthText(m: number, sys: UnitSystem): string {
  const d = toDisplay(Math.abs(m), 'length', sys)
  return `${Math.round(d.value)}${NBSP}${d.unit}`
}

/** Two lengths sharing one unit: `29 × 31 cm`. */
export function sizeText(wM: number, hM: number, sys: UnitSystem): string {
  const w = toDisplay(Math.abs(wM), 'length', sys)
  const h = toDisplay(Math.abs(hM), 'length', sys)
  return `${Math.round(w.value)} × ${Math.round(h.value)}${NBSP}${w.unit}`
}

/** A wind speed given in m/s, shown in the owner's unit to a tenth, without a trailing `.0`. */
export function windText(ms: number, unit: WindUnit): string {
  return `${rounded(ms / SPEED_TO_MS[unit], 1)}${NBSP}${unit}`
}

/**
 * The crosswind the no-wind line speaks of, per unit (M2): a step that moves the hit enough to read, where 1 km/h moved
 * it 0.4 cm at 200 m and read as "wind doesn't matter".
 */
export const SENSITIVITY_STEP: Record<WindUnit, number> = { 'm/s': 1, 'km/h': 5, mph: 2, kn: 2 }

/** `5 km/h`: the sensitivity step in the owner's unit, never split across lines. */
export const sensitivityWind = (unit: WindUnit): string => `${SENSITIVITY_STEP[unit]}${NBSP}${unit}`

/** The hit chance, never claiming certainty: `≈ 35 %`, `> 99 %`, `< 1 %`. */
export function chanceText(p: number): string {
  if (p >= 0.995) return `> 99${NNBSP}%`
  if (p < 0.005) return `< 1${NNBSP}%`
  return `≈ ${Math.round(p * 100)}${NNBSP}%`
}

/** `83 clicks`, `1 klik`, `3 kliky`, `5 kliků`: the count with its plural form. */
export function clicksText(n: number, t: T, lang: Lang): string {
  const form = new Intl.PluralRules(lang).select(n)
  const key = form === 'one' ? 'real.clicks.one' : form === 'few' ? 'real.clicks.few' : 'real.clicks.other'
  return t(key, { n })
}

/** Decimals of a click value, at least one: 0.1 → 1, 0.05 → 2, ¼ → 2, ⅛ → 3. */
export function clickDigits(click: number): number {
  const frac = String(+click.toPrecision(6)).split('.')[1] ?? ''
  return Math.max(1, frac.length)
}

/** The rifle tag: its name (the first of `A / B`) and the barrel length in inches, from the name or the barrel; no length when it is only in mm. */
export function rifleTagText(rifle: string, barrel: string): string {
  const length = rifle.match(/(\d+(?:\.\d+)?″)\s*$/)?.[1] ?? barrel.match(/^(\d+(?:\.\d+)?″)$/)?.[1]
  const name = rifle.split(' / ')[0].replace(/\s*\d+(?:\.\d+)?″\s*$/, '').trim()
  return length ? `${name} · ${length}` : name
}

const CLICK_FRACTIONS: Record<number, string> = { 0.25: '¼', 0.125: '⅛' }
/** A click value as the shooter says it: ¼ and ⅛ MOA, 0.1 and 0.05 MRAD. */
export const clickLabel = (v: number): string => CLICK_FRACTIONS[v] ?? String(v)

/** Who a preset value comes from, short: the text before the first comma, semicolon, colon or bracket. */
export function sourceMaker(source: string): string {
  return source.split(/[,;:(]/)[0].trim()
}

