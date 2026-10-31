import { radFromAngle } from './units'

export interface Bullet { massGr: number; diameterIn: number; lengthIn: number }
export type Twist = 'right' | 'left'

const FT_PER_M = 1 / 0.3048
const MPH_PER_MS = 1 / 0.44704
const INHG_PER_HPA = 0.0295299830714
const SIGN: Record<Twist, number> = { right: 1, left: -1 }

/** Miller's stability factor (research §5.1). `stationPressureHPa` is station pressure, never QNH (Miller's 29.92/P). */
export function millerSg(b: Bullet, twistIn: number, muzzleVelocityMs: number, tempC: number, stationPressureHPa: number): number {
  const tempF = tempC * 1.8 + 32
  // Speed of sound in ft/s at this temperature (Rankine); Miller's velocity term floors at it.
  const soundFtS = 49.0223 * Math.sqrt(tempF + 459.67)
  const vFtS = Math.max(muzzleVelocityMs * FT_PER_M, soundFtS)
  const lengthCal = b.lengthIn / b.diameterIn
  const twistCal = twistIn / b.diameterIn
  return (
    ((30 * b.massGr) / (twistCal ** 2 * b.diameterIn ** 3 * lengthCal * (1 + lengthCal ** 2))) *
    (vFtS / 2800) ** (1 / 3) *
    ((tempF + 460) / (59 + 460)) *
    (29.92 / (stationPressureHPa * INHG_PER_HPA))
  )
}

/** Litz: 1.25·(Sg + 1.2)·t^1.83 inches, to the right for a right twist (research §5.2). Metres, + right. */
export function spinDriftM(sg: number, timeS: number, twist: Twist): number {
  return SIGN[twist] * 1.25 * (sg + 1.2) * timeS ** 1.83 * 0.0254
}

/** Litz: (0.01·Sg − 0.0024·L + 0.032)·Wx[mph] MOA, L in calibres; a right twist lowers the hit in wind blowing right (research §5.3). Radians, + up. */
export function aeroJumpRad(sg: number, lengthCal: number, windZMs: number, twist: Twist): number {
  const moaPerMph = 0.01 * sg - 0.0024 * lengthCal + 0.032
  return radFromAngle(-SIGN[twist] * moaPerMph * windZMs * MPH_PER_MS, 'moa')
}

/** MV = MV_ref + k·(T_powder − T_ref) (research §3.7). */
export function muzzleVelocityAt(mvRefMs: number, refTempC: number, powderTempC: number, msPerC: number): number {
  return mvRefMs + msPerC * (powderTempC - refTempC)
}
