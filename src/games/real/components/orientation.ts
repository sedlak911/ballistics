/** Pure orientation maths for the aiming hook: what the phone's three angles say about the direction and the tilt. */

export interface RawOrientation {
  alpha: number | null
  beta: number | null
  gamma: number | null
  /** The event is an absolute one (Android `deviceorientationabsolute`), so alpha counts from north. */
  absolute: boolean
  /** iOS: the compass heading of the top edge, set only after the permission. */
  webkitCompassHeading?: number
}

export interface Reading {
  /** Where the aim points, 0..360 (not rounded). */
  headingDeg: number
  /** Up is positive. */
  pitchDeg: number
}

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const norm360 = (d: number) => ((d % 360) + 360) % 360
const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** The compass alpha: iOS gives the heading itself (alpha := 360 − heading), Android's absolute alpha counts from north. */
function compassAlpha(o: RawOrientation): number | null {
  if (finite(o.webkitCompassHeading)) return 360 - o.webkitCompassHeading
  if (o.absolute && finite(o.alpha)) return o.alpha
  return null
}

/** The phone held like a ruler along the aim: the top edge gives the direction, the tilt of its length gives the slope. */
export function topEdgeReading(o: RawOrientation): Reading | null {
  const heading = finite(o.webkitCompassHeading) ? o.webkitCompassHeading : o.absolute && finite(o.alpha) ? 360 - o.alpha : null
  if (heading === null || !finite(o.beta)) return null
  return { headingDeg: heading, pitchDeg: o.beta }
}

/** The back camera's axis (−z of R = Rz(α)·Rx(β)·Ry(γ)) as a compass heading and a pitch, for the phone held upright. */
export function cameraReading(o: RawOrientation): Reading | null {
  const alphaDeg = compassAlpha(o)
  if (alphaDeg === null || !finite(o.beta) || !finite(o.gamma)) return null
  const a = alphaDeg * RAD
  const b = o.beta * RAD
  const g = o.gamma * RAD
  const east = -(Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g))
  const north = -(Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g))
  const up = -Math.cos(b) * Math.cos(g)
  return {
    headingDeg: norm360(Math.atan2(east, north) * DEG),
    pitchDeg: Math.asin(Math.max(-1, Math.min(1, up))) * DEG,
  }
}

/** The mean direction of angles on a circle, in [0, 360). */
export function circularMean(degs: number[]): number {
  let s = 0
  let c = 0
  for (const d of degs) {
    s += Math.sin(d * RAD)
    c += Math.cos(d * RAD)
  }
  return norm360(Math.atan2(s, c) * DEG)
}

/** The largest |difference| between any of the angles and the mean, on the circle (0..180). */
export function angularSpread(degs: number[], meanDeg: number): number {
  let max = 0
  for (const d of degs) {
    const diff = Math.abs(norm360(d - meanDeg + 180) - 180)
    if (diff > max) max = diff
  }
  return max
}
