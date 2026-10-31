export interface Atmosphere {
  tempC: number
  altitudeM: number
}

/** Lamang is tropical: 30 °C at sea level. */
export const DEFAULT_ATMOSPHERE: Atmosphere = { tempC: 30, altitudeM: 0 }

const R_DRY_AIR = 287.05 // J/(kg·K)
const GAMMA = 1.4

/** Dry-air density in kg/m³, with pressure from the ICAO standard atmosphere at the given altitude. */
export function airDensity(a: Atmosphere): number {
  const pressurePa = 101325 * (1 - 2.25577e-5 * a.altitudeM) ** 5.25588
  return pressurePa / (R_DRY_AIR * (a.tempC + 273.15))
}

export function speedOfSound(a: Atmosphere): number {
  return Math.sqrt(GAMMA * R_DRY_AIR * (a.tempC + 273.15))
}

/** What a real shooter reads off a weather meter: station pressure, not sea-level QNH. */
export interface AirInput {
  tempC: number
  stationPressureHPa: number
  humidityPct: number
}

export interface AirState {
  densityKgM3: number
  speedOfSoundMs: number
}

export const ISA_SEA_LEVEL: AirInput = { tempC: 15, stationPressureHPa: 1013.25, humidityPct: 0 }

const R_VAPOR = 461.5 // J/(kg·K)
const R_AIR_MIX = 287.06 // J/(kg·K), the constant paired with the vapour term below
/** The ISA temperature lapse rate: 6.5 °C colder per km up. */
export const LAPSE_K_PER_M = 0.0065

/** Buck (1996) saturation vapour pressure over water, in hPa. */
export function saturationVaporPressureHPa(tempC: number): number {
  return 6.1121 * Math.exp(((18.678 - tempC / 234.5) * tempC) / (257.14 + tempC))
}

/** Moist air: dry-air and water-vapour partial densities added up. */
export function airState(a: AirInput): AirState {
  const tK = a.tempC + 273.15
  const pPa = a.stationPressureHPa * 100
  const ePa = (a.humidityPct / 100) * saturationVaporPressureHPa(a.tempC) * 100
  const densityKgM3 = (pPa - ePa) / (R_AIR_MIX * tK) + ePa / (R_VAPOR * tK)
  // Humid air carries sound slightly faster: use the virtual temperature.
  const virtualK = tK / (1 - 0.378 * (ePa / pPa))
  return { densityKgM3, speedOfSoundMs: 20.05 * Math.sqrt(virtualK) }
}

function barometric(p0HPa: number, altitudeM: number): number {
  return p0HPa * (1 - 2.25577e-5 * altitudeM) ** 5.25588
}

export function isaStationPressureHPa(altitudeM: number): number {
  return barometric(1013.25, altitudeM)
}

/** Weather services report QNH (reduced to sea level); the meter on the range reads station pressure. */
export function stationFromQnh(qnhHPa: number, altitudeM: number): number {
  return barometric(qnhHPa, altitudeM)
}

/** The inverse of stationFromQnh: a station pressure reduced to sea level. */
export function qnhFromStation(stationHPa: number, altitudeM: number): number {
  return stationHPa / (1 - 2.25577e-5 * altitudeM) ** 5.25588
}

/** Air dyM above the muzzle: colder and thinner, same relative humidity. */
export function airAbove(a: AirInput, dyM: number): AirState {
  return airState({
    tempC: a.tempC - LAPSE_K_PER_M * dyM,
    stationPressureHPa: barometric(a.stationPressureHPa, dyM),
    humidityPct: a.humidityPct,
  })
}

/** The ISA altitude at which dry air has this density. */
export function densityAltitudeM(densityKgM3: number): number {
  return 44330.8 * (1 - (densityKgM3 / 1.225) ** 0.234969)
}
