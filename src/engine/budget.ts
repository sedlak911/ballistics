import { boreAngle, flightAt, solveFlight, windFromClock, type FlightInput } from './flight'
import { normalCdf } from './hitChance'
import { radFromAngle } from './units'

export type BudgetSource = 'rifle' | 'mv' | 'bc' | 'wind' | 'hold'

/** Average extreme spread of an n-shot group in per-axis σ (research §7.2, Monte Carlo). */
export const ES_PER_SIGMA = { 3: 2.41, 5: 3.07 } as const
export type GroupShots = keyof typeof ES_PER_SIGMA

// Removing a source must raise the chance by more than this to be worth naming: half a point.
const MIN_GAIN = 0.005
const SIMPSON_INTERVALS = 200

/** Hit offsets per unit of input error at a distance, from extra solver runs. */
export interface Sensitivities {
  /** Vertical, m per +1 m/s of muzzle velocity. */
  mvM: number
  /** Vertical, m per +1 % of BC. */
  bcM: number
  /** Horizontal, m per 1 m/s of full crosswind. */
  windM: number
}

/**
 * Three extra runs against a no-wind base: MV + 1 m/s, BC × 1.01, a 1 m/s full crosswind. Magnitudes. They all leave at
 * the base's bore (the input's `boreAngleRad` when given, else its zero's): shot-to-shot spread doesn't re-zero the
 * rifle. Null when the bullet doesn't reach the distance.
 */
export function sensitivities(input: FlightInput, distanceM: number): Sensitivities | null {
  // Still air with its own winds: zones (windAt) would override every run's wind.
  const { windAt: _zones, ...rest } = input
  const calm = { ...rest, wind: { x: 0, z: 0 } }
  const fixed = { ...calm, boreAngleRad: input.boreAngleRad ?? boreAngle(calm) }
  const at = (i: FlightInput) => flightAt(solveFlight(i, distanceM), distanceM)
  const base = at(fixed)
  const mv = at({ ...fixed, muzzleVelocityMs: input.muzzleVelocityMs + 1 })
  const bc = at({ ...fixed, bc: input.bc * 1.01 })
  const wind = at({ ...fixed, wind: windFromClock(1, 9) })
  if (!base || !mv || !bc || !wind) return null
  return {
    mvM: Math.abs(mv.dropM - base.dropM),
    bcM: Math.abs(bc.dropM - base.dropM),
    windM: Math.abs(wind.windageM - base.windageM),
  }
}

export interface BudgetInput {
  distanceM: number
  /** The rifle's n-shot group in MOA; null when unknown. */
  rifleMoa: number | null
  groupShots: GroupShots
  /** Muzzle velocity standard deviation; null when unknown. */
  mvSdMs: number | null
  bcSdPct: number
  windSigmaMs: number
  holdSigmaMrad: number
  sens: Sensitivities
}

export interface Budget {
  /** 1σ per source, m; vertical sources: rifle, mv, bc, hold; horizontal: rifle, wind, hold. */
  x: Partial<Record<BudgetSource, number>>
  y: Partial<Record<BudgetSource, number>>
  sigmaX: number
  sigmaY: number
}

const rss = (parts: Partial<Record<BudgetSource, number>>) =>
  Math.sqrt(Object.values(parts).reduce((sum, v) => sum + v * v, 0))

function rifleSigmaM(i: BudgetInput): number | null {
  if (i.rifleMoa === null) return null
  return (radFromAngle(i.rifleMoa, 'moa') / ES_PER_SIGMA[i.groupShots]) * i.distanceM
}

/** The 1σ of each independent source at the target; the sources add in quadrature. Unknown ones are left out. */
export function errorBudget(i: BudgetInput): Budget {
  const rifle = rifleSigmaM(i)
  const hold = i.holdSigmaMrad * 1e-3 * i.distanceM
  const x: Budget['x'] = { wind: i.windSigmaMs * i.sens.windM, hold }
  const y: Budget['y'] = { bc: i.bcSdPct * i.sens.bcM, hold }
  if (rifle !== null) {
    x.rifle = rifle
    y.rifle = rifle
  }
  if (i.mvSdMs !== null) y.mv = i.mvSdMs * i.sens.mvM
  return { x, y, sigmaX: rss(x), sigmaY: rss(y) }
}

/** P(hit) on a disc of radius r centred on the aim, for independent normal axes. */
export function hitChanceCircle(sigmaX: number, sigmaY: number, radiusM: number): number {
  if (sigmaX <= 0 && sigmaY <= 0) return 1
  if (sigmaX <= 0) return 2 * normalCdf(radiusM / sigmaY) - 1
  if (sigmaY <= 0) return 2 * normalCdf(radiusM / sigmaX) - 1
  const f = (x: number) => {
    const chord = Math.sqrt(Math.max(0, radiusM * radiusM - x * x))
    const density = Math.exp(-0.5 * (x / sigmaX) ** 2) / (sigmaX * Math.sqrt(2 * Math.PI))
    return density * (2 * normalCdf(chord / sigmaY) - 1)
  }
  // The density is negligible beyond 8σx; a step wider than σx would miss its peak.
  const span = Math.min(radiusM, 8 * sigmaX)
  const h = (2 * span) / SIMPSON_INTERVALS
  let sum = f(-span) + f(span)
  for (let k = 1; k < SIMPSON_INTERVALS; k++) sum += f(-span + k * h) * (k % 2 === 1 ? 4 : 2)
  return Math.min(1, (sum * h) / 3)
}

const without = (parts: Budget['x'], source: BudgetSource): Budget['x'] => {
  const rest = { ...parts }
  delete rest[source]
  return rest
}

/** The source whose removal raises the chance most, or null if none gains more than half a point. */
export function dominantSource(b: Budget, radiusM: number): BudgetSource | null {
  const p = hitChanceCircle(b.sigmaX, b.sigmaY, radiusM)
  const present = new Set<BudgetSource>([...(Object.keys(b.x) as BudgetSource[]), ...(Object.keys(b.y) as BudgetSource[])])
  let best: BudgetSource | null = null
  let bestGain = MIN_GAIN
  for (const source of present) {
    const gain = hitChanceCircle(rss(without(b.x, source)), rss(without(b.y, source)), radiusM) - p
    if (gain > bestGain) {
      best = source
      bestGain = gain
    }
  }
  return best
}

/** The rifle and ammo's own group at the distance: width and height of the expected n-shot extreme spread, MV SD added vertically. */
export function groupSizeM(i: BudgetInput): { widthM: number; heightM: number } | null {
  const rifle = rifleSigmaM(i)
  if (rifle === null || i.rifleMoa === null) return null
  const mv = i.mvSdMs === null ? 0 : i.mvSdMs * i.sens.mvM
  return {
    widthM: radFromAngle(i.rifleMoa, 'moa') * i.distanceM,
    heightM: ES_PER_SIGMA[i.groupShots] * Math.sqrt(rifle * rifle + mv * mv),
  }
}
