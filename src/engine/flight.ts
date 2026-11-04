import type { AirState } from './atmosphere'
import { dragCoefficient, type Drag } from './drag'

export interface FlightInput {
  muzzleVelocityMs: number
  /** lb/in²; with a DragTable it is the sectional density m/d², since the table holds the bullet's own Cd. Infinity = no drag. */
  bc: number
  drag: Drag
  sightHeightM: number
  zeroM: number
  /** Air at the muzzle. */
  air: AirState
  /** Air dyM above the muzzle; `air` everywhere when absent. `airAt(0)` must equal `air`; build both from the same AirInput. */
  airAt?: (dyM: number) => AirState
  /** m/s; +x blows downrange (tailwind), +z blows to the right. */
  wind?: { x: number; z: number }
  /**
   * Wind by distance: m/s at the horizontal downrange distance xM from the muzzle (the state's x), same axes as `wind`.
   * When given it replaces `wind` wherever the flight and the Mach number use the wind, with no averaging.
   */
  windAt?: (xM: number) => { x: number; z: number }
  /** Line-of-sight angle, + uphill. */
  lookAngleRad?: number
  coriolis?: { latitudeRad: number; azimuthRad: number | null }
  earthCurvature?: boolean
  /**
   * The bore's elevation above the line of sight; when given, the zero isn't re-solved. Pass it to model shot-to-shot
   * spread, which leaves at the real zero's bore.
   */
  boreAngleRad?: number
}

export interface FlightPoint {
  /** Along the line of sight (slant range). */
  distanceM: number
  timeS: number
  /** Over the ground. */
  velocityMs: number
  /** Through the air, at the local speed of sound. */
  mach: number
  /** Perpendicular to the line of sight, + above. */
  dropM: number
  /** + right. */
  windageM: number
}

const G = 9.80665
const EARTH_RATE_RAD_S = 7.292e-5
const EARTH_RADIUS_M = 6_371_000
const LB_PER_IN2_TO_KG_PER_M2 = 703.0696
const DT = 0.0005
// A slow 5.56 in cold, dense air needs 14.9 s to 2500 m. The limit only stops the loop.
const MAX_TIME_S = 25

/** A horizontal frame at the muzzle: x downrange, y up, z right. */
type State = [x: number, y: number, z: number, vx: number, vy: number, vz: number]

function muzzleState(input: FlightInput, elevationRad: number): State {
  const v0 = input.muzzleVelocityMs
  return [0, 0, 0, v0 * Math.cos(elevationRad), v0 * Math.sin(elevationRad), 0]
}

/** Point-mass flight with gravity and drag, RK4 in time. Calls `visit` after every step until it returns false. */
function fly(input: FlightInput, elevationRad: number, visit: (prev: State, next: State, t: number) => boolean): void {
  const { air, airAt, bc, drag } = input
  const constantWind = input.wind ?? { x: 0, z: 0 }
  const windAt = input.windAt ?? (() => constantWind)
  // Deceleration a = ρ·v²·Cd(M)·π / (8·BC), with BC in kg/m²; zero when BC is Infinity.
  const scaleIn = (a: AirState) => (a.densityKgM3 * Math.PI) / (8 * bc * LB_PER_IN2_TO_KG_PER_M2)
  const still = scaleIn(air)

  // The earth's rotation in the frame; azimuth is from north, clockwise. Without an azimuth only the vertical part
  // counts (the same as py-ballisticcalc), so the drift is there but the Eötvös effect is not.
  const c = input.coriolis
  const omega: [number, number, number] | null = c
    ? c.azimuthRad === null
      ? [0, EARTH_RATE_RAD_S * Math.sin(c.latitudeRad), 0]
      : [
          EARTH_RATE_RAD_S * Math.cos(c.latitudeRad) * Math.cos(c.azimuthRad),
          EARTH_RATE_RAD_S * Math.sin(c.latitudeRad),
          -EARTH_RATE_RAD_S * Math.cos(c.latitudeRad) * Math.sin(c.azimuthRad),
        ]
    : null

  const deriv = ([x, y, , vx, vy, vz]: State): State => {
    const { x: wx, z: wz } = windAt(x)
    // Drag works on the velocity relative to the air.
    const rx = vx - wx
    const rz = vz - wz
    let k = 0
    if (still !== 0) {
      const a = airAt ? airAt(y) : air
      const v = Math.hypot(rx, vy, rz)
      k = (airAt ? scaleIn(a) : still) * dragCoefficient(drag, v / a.speedOfSoundMs) * v
    }
    let ax = -k * rx
    let ay = -k * vy
    let az = -k * rz
    if (input.earthCurvature) {
      // Gravity points at the earth's centre, which is tilted back toward the shooter by x/R.
      ax -= G * Math.sin(x / EARTH_RADIUS_M)
      ay -= G * Math.cos(x / EARTH_RADIUS_M)
    } else {
      ay -= G
    }
    if (omega) {
      // −2 Ω × v
      ax -= 2 * (omega[1] * vz - omega[2] * vy)
      ay -= 2 * (omega[2] * vx - omega[0] * vz)
      az -= 2 * (omega[0] * vy - omega[1] * vx)
    }
    return [vx, vy, vz, ax, ay, az]
  }

  let s = muzzleState(input, elevationRad)
  for (let t = 0; t < MAX_TIME_S; t += DT) {
    const k1 = deriv(s)
    const k2 = deriv(s.map((v, i) => v + (DT / 2) * k1[i]) as State)
    const k3 = deriv(s.map((v, i) => v + (DT / 2) * k2[i]) as State)
    const k4 = deriv(s.map((v, i) => v + DT * k3[i]) as State)
    const next = s.map((v, i) => v + (DT / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as State
    if (!visit(s, next, t + DT)) return
    s = next
  }
}

/** Height above the bore line at distance x for a launch angle, or -Infinity if the bullet never gets there. */
function heightAt(input: FlightInput, angleRad: number, x: number): number {
  let height = -Infinity
  fly(input, angleRad, (prev, next) => {
    if (next[0] < x) return true
    height = prev[1] + ((next[1] - prev[1]) * (x - prev[0])) / (next[0] - prev[0])
    return false
  })
  return height
}

/**
 * Bore angle above the line of sight (bisection) at which the bullet crosses it at the zero distance. The zero was shot
 * on a flat range in still air, so only the bullet and the air at the muzzle count.
 */
export function boreAngle(input: FlightInput): number {
  const { muzzleVelocityMs, bc, drag, sightHeightM, zeroM, air } = input
  const range: FlightInput = { muzzleVelocityMs, bc, drag, sightHeightM, zeroM, air }
  let lo = -0.05
  let hi = 0.05
  // Slow rounds zeroed far out need a steeper bore; widen until the bullet clears the line of sight.
  while (hi < 0.8 && heightAt(range, hi, zeroM) < sightHeightM) {
    lo = hi
    hi *= 2
  }
  // 1e-8 rad is 10 µm at 1,000 m.
  while (hi - lo > 1e-8) {
    const mid = (lo + hi) / 2
    if (heightAt(range, mid, zeroM) < sightHeightM) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Samples every `sampleEveryM` of slant range up to `maxDistanceM`, with a last one at exactly `maxDistanceM` when that
 * is off the grid. Ends short when the bullet doesn't get that far.
 */
export function solveFlight(input: FlightInput, maxDistanceM: number, sampleEveryM = 5): FlightPoint[] {
  const look = input.lookAngleRad ?? 0
  const cos = Math.cos(look)
  const sin = Math.sin(look)
  const h = input.sightHeightM
  const windAt = input.windAt ?? (() => input.wind ?? { x: 0, z: 0 })
  const mach = ([x, y, , vx, vy, vz]: State) => {
    const { x: wx, z: wz } = windAt(x)
    return Math.hypot(vx - wx, vy, vz - wz) / (input.airAt ? input.airAt(y) : input.air).speedOfSoundMs
  }
  // The line of sight's frame: slant range along it, drop perpendicular to it.
  const range = ([x, y]: State) => x * cos + y * sin
  const height = ([x, y]: State) => -x * sin + y * cos

  const elevation = look + (input.boreAngleRad ?? boreAngle(input))
  const points: FlightPoint[] = [
    {
      distanceM: 0,
      timeS: 0,
      velocityMs: input.muzzleVelocityMs,
      mach: mach(muzzleState(input, elevation)),
      dropM: -h,
      windageM: 0,
    },
  ]
  let nextSample = sampleEveryM
  fly(input, elevation, (prev, next, t) => {
    const sampleAt = (distanceM: number) => {
      const f = (distanceM - range(prev)) / (range(next) - range(prev))
      const lerp = (a: number, b: number) => a + (b - a) * f
      points.push({
        distanceM,
        timeS: lerp(t - DT, t),
        velocityMs: lerp(Math.hypot(prev[3], prev[4], prev[5]), Math.hypot(next[3], next[4], next[5])),
        mach: lerp(mach(prev), mach(next)),
        dropM: lerp(height(prev), height(next)) - h,
        windageM: lerp(prev[2], next[2]),
      })
    }
    while (nextSample <= maxDistanceM && range(next) >= nextSample) {
      sampleAt(nextSample)
      nextSample += sampleEveryM
    }
    if (nextSample <= maxDistanceM) return true
    // The grid is done. An end that's off it gets its own sample, between the same two states.
    if (range(next) < maxDistanceM) return true
    if (maxDistanceM - points[points.length - 1].distanceM > 1e-9) sampleAt(maxDistanceM)
    return false
  })
  return points
}

/** The flight at a distance, interpolated; null when the bullet never got there (beyond the last sample). */
export function flightAt(points: FlightPoint[], distanceM: number): FlightPoint | null {
  if (distanceM <= points[0].distanceM) return points[0]
  const last = points[points.length - 1]
  if (distanceM > last.distanceM + 1e-6) return null
  if (distanceM >= last.distanceM) return last
  let i = 1
  while (points[i].distanceM < distanceM) i++
  const a = points[i - 1]
  const b = points[i]
  const f = (distanceM - a.distanceM) / (b.distanceM - a.distanceM)
  const lerp = (p: number, q: number) => p + (q - p) * f
  return {
    distanceM,
    timeS: lerp(a.timeS, b.timeS),
    velocityMs: lerp(a.velocityMs, b.velocityMs),
    mach: lerp(a.mach, b.mach),
    dropM: lerp(a.dropM, b.dropM),
    windageM: lerp(a.windageM, b.windageM),
  }
}

/** Wind from a clock position (where it blows from; 12 = from the target) and a speed, as FlightInput.wind. */
export function windFromClock(speedMs: number, clock: number): { x: number; z: number } {
  // Clockwise from 12. It blows away from where it comes from: from 3 o'clock (the right) it blows to the left.
  const from = (clock * Math.PI) / 6
  return { x: -speedMs * Math.cos(from), z: -speedMs * Math.sin(from) }
}

/** Elevation of the path below the line of sight at a distance, as an angle: −drop / distance; null if unreached. */
function elevationAt(input: FlightInput, distanceM: number): number | null {
  const p = flightAt(solveFlight(input, distanceM, distanceM), distanceM)
  return p && -p.dropM / distanceM
}

/**
 * The muzzle velocity that puts the bullet `observedElevationRad` (−drop/distance, + below the line of sight) at the
 * distance, searched between 0.8× and 1.2× of the input's. More velocity means less elevation. Null when it can't be
 * trusted: the distance isn't reached across the bracket, the observation lies outside it (a typo or the wrong unit),
 * or the round is below Mach 1.2 there (research: truing needs the round still supersonic).
 *
 * For a candidate `m` the bore is solved at `m` (in `boreAir`, the input's air when absent) and the bullet flies at
 * `m + flightMvOffsetMs`, e.g. the powder-temperature shift of a rifle zeroed at `m`; the Mach check is on that flight.
 * The default offset 0 is the plain case.
 */
export function trueMuzzleVelocity(
  input: FlightInput,
  distanceM: number,
  observedElevationRad: number,
  flightMvOffsetMs = 0,
  boreAir: AirState = input.air,
): number | null {
  const run = (m: number): FlightInput => ({
    ...input,
    muzzleVelocityMs: m + flightMvOffsetMs,
    boreAngleRad: boreAngle({ ...input, muzzleVelocityMs: m, air: boreAir }),
  })
  let lo = input.muzzleVelocityMs * 0.8
  let hi = input.muzzleVelocityMs * 1.2
  const elevationLo = elevationAt(run(lo), distanceM)
  const elevationHi = elevationAt(run(hi), distanceM)
  if (elevationLo === null || elevationHi === null) return null
  if (observedElevationRad > elevationLo || observedElevationRad < elevationHi) return null
  const at = flightAt(solveFlight(run(input.muzzleVelocityMs), distanceM, distanceM), distanceM)
  if (at === null || at.mach < 1.2) return null
  // 0.001 m/s is far below what a chronograph shows.
  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2
    // Between two velocities that reach the distance, so does the middle.
    if (elevationAt(run(mid), distanceM)! > observedElevationRad) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
