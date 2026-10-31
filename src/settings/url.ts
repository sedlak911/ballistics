import { TARGET_SPEEDS, type CrossingAngle, type Movement } from '../engine/aim'
import type { AngleUnit, UnitSystem } from '../engine/units'

export type Lang = 'en' | 'cs'

export interface Display {
  lang: Lang
  system: UnitSystem
  angle: AngleUnit
}

/** The target's posture. A kneeling or prone target does not move. */
export type Posture = 'standing' | 'kneeling' | 'prone'

export interface Setup {
  weaponId: string
  barrelId: string | null
  scopeId: string
  zeroM: number
  ammoId: string
  distanceM: number
  movement: Movement
  posture: Posture
  crossing: CrossingAngle
  direction: 1 | -1
  /** The weapon's real accuracy read from the game; null means computed from the parts. */
  accuracyMoa: number | null
  /** 1σ uncertainty of the distance, in % of it. */
  rangeSigmaPct: number
}

export type IdField = 'weaponId' | 'barrelId' | 'scopeId' | 'ammoId'

export const DEFAULT_DISPLAY: Display = { lang: 'en', system: 'metric', angle: 'mil' }

// Short URL keys keep shared links readable.
const KEYS = {
  weaponId: 'w', barrelId: 'b', scopeId: 's', zeroM: 'z', ammoId: 'am', distanceM: 'd',
  movement: 'mv', posture: 'po', crossing: 'x', direction: 'dir', accuracyMoa: 'acc', rangeSigmaPct: 'rs',
} as const satisfies Record<keyof Setup, string>
const NONE = 'none'

const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined =>
  allowed.find((a) => a === value)

export function readDisplay(p: URLSearchParams, stored: Partial<Display>): Display {
  return {
    lang: pick(p.get('l'), ['en', 'cs']) ?? stored.lang ?? DEFAULT_DISPLAY.lang,
    system: pick(p.get('u'), ['metric', 'imperial']) ?? stored.system ?? DEFAULT_DISPLAY.system,
    angle: pick(p.get('a'), ['mil', 'moa']) ?? stored.angle ?? DEFAULT_DISPLAY.angle,
  }
}

/** Whether the link says anything about the setup; display keys alone don't count. */
export function hasSetupParams(p: URLSearchParams): boolean {
  return Object.values(KEYS).some((k) => p.has(k))
}

/** Every unknown id or garbage value falls back to its default, so stale shared links still open. */
export function readSetup(p: URLSearchParams, isValidId: (field: IdField, id: string) => boolean, defaults: Setup): Setup {
  const id = (field: IdField): string => {
    const v = p.get(KEYS[field])
    return v !== null && isValidId(field, v) ? v : (defaults[field] as string)
  }
  const optionalId = (field: 'barrelId'): string | null => {
    const v = p.get(KEYS[field])
    if (v === NONE) return null
    return v !== null && isValidId(field, v) ? v : defaults[field]
  }
  const num = (key: string): number | undefined => {
    const v = Number(p.get(key) ?? NaN)
    return Number.isFinite(v) && v > 0 ? v : undefined
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const d = num(KEYS.distanceM)
  const z = num(KEYS.zeroM)
  const acc = num(KEYS.accuracyMoa)
  const rs = Number(p.get(KEYS.rangeSigmaPct) ?? NaN)
  const crossing = Number(p.get(KEYS.crossing))
  const posture = pick(p.get(KEYS.posture), ['standing', 'kneeling', 'prone'] as const) ?? defaults.posture
  const movement = pick(p.get(KEYS.movement), Object.keys(TARGET_SPEEDS) as Movement[]) ?? defaults.movement
  const dir = Number(p.get(KEYS.direction))
  return {
    weaponId: id('weaponId'),
    barrelId: optionalId('barrelId'),
    scopeId: id('scopeId'),
    zeroM: z === undefined ? defaults.zeroM : Math.min(1000, Math.max(50, Math.round(z / 50) * 50)),
    ammoId: id('ammoId'),
    distanceM: d === undefined ? defaults.distanceM : Math.min(1000, Math.max(50, d)),
    movement: posture === 'standing' ? movement : 'standing',
    posture,
    crossing: crossing === 90 || crossing === 45 ? crossing : defaults.crossing,
    direction: dir === 1 || dir === -1 ? dir : defaults.direction,
    accuracyMoa: acc === undefined ? defaults.accuracyMoa : clamp(acc, 0.1, 20),
    rangeSigmaPct: Number.isFinite(rs) && rs >= 0 ? clamp(Math.round(rs), 1, 50) : defaults.rangeSigmaPct,
  }
}

export function writeSetup(s: Setup, d: Display): URLSearchParams {
  const p = new URLSearchParams()
  for (const [field, key] of Object.entries(KEYS) as [keyof Setup, string][]) {
    const v = s[field]
    p.set(key, v === null ? NONE : String(v))
  }
  p.set('l', d.lang)
  p.set('u', d.system)
  p.set('a', d.angle)
  return p
}
