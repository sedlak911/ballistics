// Internal units are always SI (m, m/s, s, rad). Everything here converts at display time only.

export type AngleUnit = 'mil' | 'moa'
export type UnitSystem = 'metric' | 'imperial'
export type Quantity = 'distance' | 'length' | 'speed'
export type DisplayUnit = 'm' | 'cm' | 'm/s' | 'yd' | 'in' | 'ft/s'

export const MOA_PER_MIL = 3.4377467707849

const RAD_PER_UNIT: Record<AngleUnit, number> = {
  mil: 0.001,
  moa: Math.PI / (180 * 60),
}

export function angleFromRad(rad: number, unit: AngleUnit): number {
  return rad / RAD_PER_UNIT[unit]
}

export function radFromAngle(value: number, unit: AngleUnit): number {
  return value * RAD_PER_UNIT[unit]
}

/** Angle subtended by an offset at a distance, e.g. 10 cm at 100 m → 1 MIL. */
export function angleOfOffset(offsetM: number, distanceM: number, unit: AngleUnit): number {
  return angleFromRad(Math.atan(offsetM / distanceM), unit)
}

const FACTORS: Record<UnitSystem, Record<Quantity, { factor: number; unit: DisplayUnit }>> = {
  metric: {
    distance: { factor: 1, unit: 'm' },
    length: { factor: 100, unit: 'cm' },
    speed: { factor: 1, unit: 'm/s' },
  },
  imperial: {
    distance: { factor: 1 / 0.9144, unit: 'yd' },
    length: { factor: 1 / 0.0254, unit: 'in' },
    speed: { factor: 1 / 0.3048, unit: 'ft/s' },
  },
}

export function toDisplay(si: number, q: Quantity, sys: UnitSystem): { value: number; unit: DisplayUnit } {
  const { factor, unit } = FACTORS[sys][q]
  return { value: si * factor, unit }
}

export function fromDisplay(value: number, q: Quantity, sys: UnitSystem): number {
  return value / FACTORS[sys][q].factor
}

// REAL-mode input fields: each table is the factor to the base unit (hPa, m/s, g, mm).
export const PRESSURE_TO_HPA: Record<'hPa' | 'inHg' | 'mmHg' | 'psi', number> = {
  hPa: 1,
  inHg: 33.8639,
  mmHg: 1.333224,
  psi: 68.9476,
}

export const SPEED_TO_MS: Record<'m/s' | 'km/h' | 'mph' | 'kn' | 'ft/s', number> = {
  'm/s': 1,
  'km/h': 1 / 3.6,
  mph: 0.44704,
  kn: 0.514444,
  'ft/s': 0.3048,
}

export const MASS_TO_G: Record<'g' | 'gr', number> = { g: 1, gr: 0.06479891 }

export const LENGTH_TO_MM: Record<'mm' | 'in', number> = { mm: 1, in: 25.4 }

export function cToF(c: number): number {
  return (c * 9) / 5 + 32
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9
}
