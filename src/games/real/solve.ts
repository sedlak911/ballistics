import type { TKey } from '../../i18n'
import { airAbove, airState, densityAltitudeM, isaStationPressureHPa, type AirInput } from '../../engine/atmosphere'
import {
  dominantSource,
  errorBudget,
  groupSizeM,
  hitChanceCircle,
  sensitivities,
  type Budget,
  type BudgetInput,
  type BudgetSource,
} from '../../engine/budget'
import { dialFor, type Dial } from '../../engine/dial'
import type { Drag } from '../../engine/drag'
import { boreAngle, flightAt, solveFlight, trueMuzzleVelocity, windFromClock, type FlightInput, type FlightPoint } from '../../engine/flight'
import { aeroJumpRad, millerSg, muzzleVelocityAt, spinDriftM, type Bullet } from '../../engine/spin'
import { angleFromRad, radFromAngle, type AngleUnit } from '../../engine/units'
import { EFFECTS, type Effect, type RealProfile } from './profile'
import { scopeValues, type ResolvedPreset } from './profiles'
import type { RealSetup } from './setup'
import { stationAir, type Field, type Station } from './station'
import type { Sourced, Trust } from './types'

/**
 * `transonic` from Mach 1.2 down to 1.0 at the target, `subsonic` below 1.0 (one or the other); `estimate` when the MV,
 * the drag or the sight height that went in has trust N; `implausible` for what was typed: a pressure (QNH or station)
 * outside 600–1100 hPa, a station pressure more than 4 % off the standard one for the altitude (a QNH typed as station
 * pressure), an MV outside 200–1300 m/s before the powder shift, a G7 BC above 0.6 or a G1 BC below 0.15.
 */
export type RealWarning = 'transonic' | 'subsonic' | 'estimate' | 'implausible'

/**
 * How far an effect moves the hit at the target, m: + up, + right. `on` says whether the answer includes it; an
 * effect that is off still reports what it would add. Or the input it lacks: `twist` or `bulletLength` for spin drift
 * and aerodynamic jump, `reach` when the bullet doesn't get to the distance without (or with) the effect.
 */
export type RealShare = { yM: number; xM: number; on: boolean } | { missing: 'twist' | 'bulletLength' | 'reach' }

export interface RealHit {
  /** P(hit) on the round target, 0–1. */
  chance: number
  /** The error source whose removal raises the chance most, or null if none gains half a point. */
  dominant: BudgetSource | null
  /** 1σ at the target, m. */
  sigmaX: number
  sigmaY: number
  /** 1σ per source, m (for the calculation view's budget). */
  x: Budget['x']
  y: Budget['y']
  /** The rifle and ammo's own n-shot group at the distance; null when the rifle's MOA is unknown. */
  group: { widthM: number; heightM: number } | null
}

export interface RealInput {
  key: string
  value: number
  unit: string
  /** The preset's source text, a station field's source, or 'setup', 'preset', 'scope', 'default', 'profile', 'air', 'computed'. */
  source: string
  /** The research trust of a preset value; null for anything else. */
  trust: Trust | null
}

export interface RealSolution {
  unit: AngleUnit
  /**
   * False when the bullet doesn't get to the distance (or not to the zero) with this load. Then only `unit`,
   * `reached`, `inputs` and the input-based `warnings` (estimate, implausible) mean anything: every figure is 0, the
   * wind arrays are zeros, `shares`, `hit` and `explain` are null. The page shows no figure.
   */
  reached: boolean
  /** + up, in the scope's unit; everything vertical included (drop, Eötvös, aerodynamic jump, curvature). −drop / distance. */
  elevation: number
  /**
   * From dialFor with the preset's click value and travel when they were stored in this unit (a stored click that isn't
   * one of the unit's chips becomes the default); otherwise the unit's default click and an unknown travel (R2).
   */
  dial: Dial
  /** The horizontal hold for the average wind, in the scope's unit: + means hold right, so a hit drifting right gives a negative windage. Everything horizontal included. */
  windage: number
  /** Holds for wind − σ, wind, wind + σ (σ = profile.windSigmaMs), in the scope's unit; the middle one is `windage`. */
  windColumns: [number, number, number]
  /** m/s; the lowest is never below 0. */
  windSpeeds: [number, number, number]
  /** Horizontal shift of 1 m/s full crosswind at the target, m (the no-wind sensitivity line). */
  perMsM: number
  timeS: number
  velocityMs: number
  mach: number
  warnings: RealWarning[]
  /** Per effect: its vertical and horizontal share at the target, or the input it lacks. Null unless asked for. */
  shares: Record<Effect, RealShare> | null
  /** Null unless asked for, or when the sensitivities can't be solved. */
  hit: RealHit | null
  /** Every input that went in, with value, unit and source, for the calculation view; derived figures have source 'computed'. */
  inputs: RealInput[]
  /** The figures the calculation view adds to the shares; null unless the shares were asked for, or when unreached. */
  explain: RealExplain | null
}

/** What the calculation view shows besides the shares and the inputs. Lengths at the target, m: + up, + right. */
export interface RealExplain {
  /** Where the hit lands against the line of sight, everything switched on included: −hitYM / D is the elevation. */
  hitYM: number
  hitXM: number
  /** The wind's own share: the shot minus the same shot in calm air (the aerodynamic jump is its own effect); null if the calm shot falls short. */
  wind: { yM: number; xM: number } | null
  /**
   * Didion's lag rule, the check on the wind: crosswind · (time of flight − distance / MV). `crossMs` is the crosswind,
   * + blowing right; `vacuumTimeS` is distance / the MV that went in; `driftM` the drift it gives, + right.
   */
  lag: { crossMs: number; timeS: number; vacuumTimeS: number; driftM: number }
  /** The wind along the line of fire, m/s: + a tailwind, − a headwind. */
  tailMs: number
  /** The drag the flight used: a G model with the BC, or the preset's measured Cd table. */
  dragModel: 'G1' | 'G7' | 'table'
  /** A measured table's note on what it was measured for (e.g. a stand-in round); null for a G model. */
  dragNoteKey: TKey | null
  twist: 'right' | 'left'
  /** The MV the bore was zeroed with (the reference one, R8), and the MV the powder temperature gives (on or off). */
  zeroMvMs: number
  shiftedMvMs: number
  /**
   * With a slope: the exact answer at the slope against the rifleman's rule, the level answer at D·cos θ (same air,
   * wind and effects). Elevations in the scope's unit; `differenceM` is where the rule's hit lands against the exact
   * one at the target, + up. Null on the level.
   */
  slope: { horizontalM: number; elevation: number; riflemanElevation: number; differenceM: number } | null
  /**
   * How far 1° of cant moves the hit sideways at the target, m, toward the side the rifle leans. Canting turns the
   * bore about the line of sight: its angle above the line of sight, α = bore + elevation, turns sideways by α·sin φ,
   * and the muzzle, h under the scope, swings h·sin φ the other way; gravity doesn't turn. So Δx = sin φ · (α·D − h).
   */
  cantPerDegM: number
  /** α in that formula: the bore's angle above the line of sight with the elevation dialled, rad. */
  cantAlphaRad: number
}

const DEG = Math.PI / 180
const MM_PER_IN = 25.4
// The bore crosses the line of sight at the zero within a millimetre, or the zero isn't reachable with this load.
const ZERO_TOLERANCE_M = 0.001
// Weather keeps station pressure within about ±3 % of the standard one for the altitude; a QNH typed as station
// pressure is off by the altitude's share: +4.9 % at 400 m, +10 % at 800 m. So 4 % flags that mistake from about
// 330 m up (I2: most Czech ranges sit at 200–500 m). The edge: a deep low at sea level, 970 hPa (−4.3 %), warns too;
// 980 (−3.3 %) doesn't. The mirror: a station pressure typed as QNH is that far under 1013.25 (965 at 400 m, −4.8 %).
const STATION_PRESSURE_TOLERANCE = 0.04
const QNH_STANDARD_HPA = 1013.25

type RunEffect = Exclude<Effect, 'spinDrift' | 'aeroJump'>

/**
 * What solveReal and trueReal both fly from, built once so they can't drift: the air (today's measured one, and the one
 * the switches leave), the reference MV and its powder shift, the drag, and `zero`, the input the bore is solved from
 * (reference MV, measured air: R8).
 */
function flightBasis(preset: ResolvedPreset, profile: RealProfile, station: Station) {
  const fx = profile.effects
  // Air: both `air` and `airAt` of a run come from one AirInput (R11).
  const measured = stationAir(station)
  const dry: AirInput = { ...measured, humidityPct: 0 }
  const airIn = fx.humidity ? measured : dry
  const withAir = (a: AirInput) => ({ air: airState(a), airAt: (dyM: number) => airAbove(a, dyM) })

  const refMv = preset.muzzleVelocityMs.value
  const powderTempC = station.powderTempC?.value ?? station.tempC.value
  const shiftedMv = muzzleVelocityAt(refMv, preset.mvRefTempC.value, powderTempC, preset.powderSensMsPerC.value)
  const mv = fx.powderTemp ? shiftedMv : refMv

  const dragValue = preset.drag.value
  const [bc, drag]: [number, Drag] =
    'table' in dragValue ? [dragValue.sectionalDensity, dragValue.table] : [dragValue.bc, dragValue.model]
  const sightHeightM = preset.sightHeightMm.value / 1000
  const coriolis = {
    latitudeRad: station.latitudeDeg.value * DEG,
    azimuthRad: station.azimuthDeg === null ? null : station.azimuthDeg.value * DEG,
  }
  const zero: FlightInput = { muzzleVelocityMs: refMv, bc, drag, sightHeightM, zeroM: preset.zeroM, air: airState(measured) }
  return { fx, measured, dry, airIn, withAir, refMv, shiftedMv, mv, bc, drag, sightHeightM, coriolis, zero }
}

/**
 * The scope setting for a shot. One base solve with the switched-on effects, plus one with an extra 1 m/s of
 * crosswind for the wind columns; `need.shares` adds a run per effect, `need.hit` the error budget's sensitivities.
 * Every run leaves at one bore, solved with the reference MV in today's measured air (R8): the rifle was zeroed
 * before today, so a powder-temperature change moves the hit, and a switch moves the answer by exactly its share.
 */
export function solveReal(
  preset: ResolvedPreset,
  setup: RealSetup,
  profile: RealProfile,
  station: Station,
  unit: AngleUnit,
  need: { shares: boolean; hit: boolean },
): RealSolution {
  const d = setup.distanceM
  const { fx, measured, dry, airIn, withAir, refMv, shiftedMv, mv, bc, drag, sightHeightM, coriolis, zero } = flightBasis(preset, profile, station)
  const dragValue = preset.drag.value
  const wind = windFromClock(setup.windMs, setup.windClock)

  // Scope values carry their unit (R2): stored in another unit, or with none, they aren't this scope's.
  const { clickValue, clickKnown, travelUp } = scopeValues(preset, unit)

  const warnings: RealWarning[] = []
  // The inputs that move the answer most; powder sensitivity 0 is N in every preset and would always warn.
  if ([preset.muzzleVelocityMs, preset.drag, preset.sightHeightMm].some((s) => s.trust === 'N')) warnings.push('estimate')
  // What was typed, before any conversion or shift; the standard pressure is nobody's typo.
  const typed = station.pressureHPa
  const typedPressureOff =
    typed.source !== 'standard' &&
    (typed.value < 600 ||
      typed.value > 1100 ||
      // A QNH typed as station pressure: 1018 at 400 m is 5.4 % over, 1013 at 800 m 10 % (0.44 mrad at 1000 m).
      Math.abs(typed.value / (station.pressureKind === 'station' ? isaStationPressureHPa(station.altitudeM.value) : QNH_STANDARD_HPA) - 1) > STATION_PRESSURE_TOLERANCE)
  const implausible =
    typedPressureOff ||
    refMv < 200 ||
    refMv > 1300 ||
    ('model' in dragValue && (dragValue.model === 'G7' ? dragValue.bc > 0.6 : dragValue.bc < 0.15))
  if (implausible) warnings.push('implausible')

  // Spin drift and aerodynamic jump, from Sg, as py-ballisticcalc adds them after the integration. Without the twist or
  // the bullet's length there is no Sg; Miller divides by both, and the override bounds keep them > 0 (R13).
  const length = preset.bullet.lengthMm
  const twistIn = preset.twistIn.value
  const bullet: Bullet | null =
    twistIn > 0 && length !== null && length.value > 0
      ? { massGr: preset.bullet.massGr.value, diameterIn: preset.bullet.diameterIn.value, lengthIn: length.value / MM_PER_IN }
      : null
  const missingSpin = twistIn > 0 ? 'bulletLength' : 'twist'
  const spin =
    bullet === null
      ? null
      : {
          // Miller takes station pressure, never QNH (R11).
          sgAt: (muzzleVelocityMs: number) =>
            millerSg(bullet, twistIn, muzzleVelocityMs, measured.tempC, measured.stationPressureHPa),
          /** m, + right. */
          driftM: (sg: number, timeS: number) => spinDriftM(sg, timeS, preset.twist),
          /** m at the target, + up. */
          jumpM: (sg: number) => aeroJumpRad(sg, bullet.lengthIn / bullet.diameterIn, wind.z, preset.twist) * d,
        }
  const sg = spin && spin.sgAt(mv)

  const boreAngleRad = boreAngle(zero)

  const inputs = listInputs(preset, setup, profile, station, unit, {
    stationPressureHPa: measured.stationPressureHPa,
    mvUsedMs: mv,
    air: airState(airIn),
    boreAngleRad,
    clickValue,
    clickKnown,
    travelUp,
    sg,
  })

  const unreached = (): RealSolution => ({
    unit,
    reached: false,
    elevation: 0,
    dial: { clicks: 0, dialed: 0, remainder: 0, hold: 0 },
    windage: 0,
    windColumns: [0, 0, 0],
    windSpeeds: [0, 0, 0],
    perMsM: 0,
    timeS: 0,
    velocityMs: 0,
    mach: 0,
    warnings,
    shares: null,
    hit: null,
    inputs,
    explain: null,
  })

  const at = (i: FlightInput, distanceM = d): FlightPoint | null => flightAt(solveFlight(i, distanceM, distanceM), distanceM)

  if (!(d > 0) || !(mv > 0)) return unreached()
  // boreAngle tops out quietly when the zero is out of reach; a bore that misses its own zero is no answer.
  const zeroPoint = at({ ...zero, boreAngleRad }, preset.zeroM)
  if (zeroPoint === null || Math.abs(zeroPoint.dropM) > ZERO_TOLERANCE_M) return unreached()

  const base: FlightInput = {
    muzzleVelocityMs: mv,
    bc,
    drag,
    sightHeightM,
    zeroM: preset.zeroM,
    ...withAir(airIn),
    wind,
    lookAngleRad: setup.slopeDeg * DEG,
    coriolis: fx.coriolis ? coriolis : undefined,
    earthCurvature: fx.curvature,
    boreAngleRad,
  }

  // Where a run hits, m, + up and + right: the integration plus the switched-on spin effects at that run's MV.
  const hitOf = (i: FlightInput): { p: FlightPoint; yM: number; xM: number } | null => {
    const p = at(i)
    if (p === null) return null
    let yM = p.dropM
    let xM = p.windageM
    if (spin !== null) {
      const s = spin.sgAt(i.muzzleVelocityMs)
      if (fx.spinDrift) xM += spin.driftM(s, p.timeS)
      if (fx.aeroJump) yM += spin.jumpM(s)
    }
    return { p, yM, xM }
  }

  const impact = hitOf(base)
  // The same shot with 1 m/s more crosswind: drift is linear in crosswind (the lag rule), so this spaces the columns.
  const gust = at({ ...base, wind: { x: wind.x, z: wind.z + 1 } })
  if (impact === null || gust === null) return unreached()
  const { p } = impact
  const perMsSigned = gust.windageM - p.windageM

  const toUnit = (offsetM: number) => angleFromRad(offsetM / d, unit)
  const elevation = toUnit(-impact.yM)
  const windage = toUnit(-impact.xM)
  const sigma = profile.windSigmaMs
  const windSpeeds: [number, number, number] = [Math.max(0, setup.windMs - sigma), setup.windMs, setup.windMs + sigma]
  const column = (speedMs: number) => toUnit(-(impact.xM + (windFromClock(speedMs, setup.windClock).z - wind.z) * perMsSigned))

  // Spec: "transonic (below Mach 1.2) or subsonic".
  if (p.mach < 1) warnings.push('subsonic')
  else if (p.mach < 1.2) warnings.push('transonic')

  return {
    unit,
    reached: true,
    elevation,
    dial: dialFor(elevation, clickValue, travelUp),
    windage,
    windColumns: [column(windSpeeds[0]), windage, column(windSpeeds[2])],
    windSpeeds,
    perMsM: Math.abs(perMsSigned),
    timeS: p.timeS,
    velocityMs: p.velocityMs,
    mach: p.mach,
    warnings,
    shares: need.shares ? effectShares() : null,
    hit: need.hit ? hitChance() : null,
    inputs,
    explain: need.shares ? explainShot() : null,
  }

  // Two more runs for the view: the shot in calm air (the wind's own share) and, on a slope, the level shot at D·cos θ.
  function explainShot(): RealExplain {
    const calm = at({ ...base, wind: { x: 0, z: 0 } })
    const vacuumTimeS = d / mv
    const look = setup.slopeDeg * DEG
    let slope: RealExplain['slope'] = null
    if (look !== 0) {
      const horizontalM = d * Math.cos(look)
      const level = at({ ...base, lookAngleRad: 0 }, horizontalM)
      if (level !== null) {
        // The spin effects are the same angle on both; only the flights differ.
        const riflemanElevation = elevation - toUnit(-p.dropM) + angleFromRad(-level.dropM / horizontalM, unit)
        slope = { horizontalM, elevation, riflemanElevation, differenceM: radFromAngle(riflemanElevation - elevation, unit) * d }
      }
    }
    const alphaRad = boreAngleRad + -impact!.yM / d
    return {
      hitYM: impact!.yM,
      hitXM: impact!.xM,
      wind: calm && { yM: p.dropM - calm.dropM, xM: p.windageM - calm.windageM },
      // + 0: no wind is a plain 0, never −0.
      lag: { crossMs: wind.z + 0, timeS: p.timeS, vacuumTimeS, driftM: wind.z * (p.timeS - vacuumTimeS) + 0 },
      tailMs: wind.x + 0,
      dragModel: 'table' in dragValue ? 'table' : dragValue.model,
      dragNoteKey: 'table' in dragValue ? dragValue.noteKey : null,
      twist: preset.twist,
      zeroMvMs: refMv,
      shiftedMvMs: shiftedMv,
      slope,
      cantPerDegM: Math.sin(DEG) * (alphaRad * d - sightHeightM),
      cantAlphaRad: alphaRad,
    }
  }

  // A run effect's share is the hit with it minus the hit without it, from one run with its switch flipped.
  function effectShares(): Record<Effect, RealShare> {
    const flipped = (e: RunEffect): FlightInput | null => {
      switch (e) {
        case 'humidity':
          return measured.humidityPct === 0 ? null : { ...base, ...withAir(fx.humidity ? dry : measured) }
        case 'powderTemp':
          return shiftedMv === refMv ? null : { ...base, muzzleVelocityMs: fx.powderTemp ? refMv : shiftedMv }
        case 'coriolis':
          return { ...base, coriolis: fx.coriolis ? undefined : coriolis }
        case 'curvature':
          return { ...base, earthCurvature: !fx.curvature }
      }
    }
    const run = (e: RunEffect): RealShare => {
      const i = flipped(e)
      // The flipped run would be the base itself: the effect adds nothing here.
      if (i === null) return { yM: 0, xM: 0, on: fx[e] }
      const other = hitOf(i)
      if (other === null) return { missing: 'reach' }
      const sign = fx[e] ? 1 : -1
      return { yM: sign * (impact!.yM - other.yM), xM: sign * (impact!.xM - other.xM), on: fx[e] }
    }
    const own = (e: 'spinDrift' | 'aeroJump'): RealShare => {
      if (spin === null) return { missing: missingSpin }
      const s = spin.sgAt(mv)
      return e === 'spinDrift'
        ? { yM: 0, xM: spin.driftM(s, p.timeS), on: fx.spinDrift }
        : { yM: spin.jumpM(s), xM: 0, on: fx.aeroJump }
    }
    return Object.fromEntries(
      EFFECTS.map((e) => [e, e === 'spinDrift' || e === 'aeroJump' ? own(e) : run(e)]),
    ) as Record<Effect, RealShare>
  }

  function hitChance(): RealHit | null {
    const sens = sensitivities(base, d)
    if (sens === null) return null
    const bi: BudgetInput = {
      distanceM: d,
      rifleMoa: preset.accuracyMoa.value,
      groupShots: preset.groupShots,
      mvSdMs: preset.mvSdMs?.value ?? null,
      bcSdPct: profile.bcSdPct,
      windSigmaMs: profile.windSigmaMs,
      holdSigmaMrad: profile.holdSigmaMrad,
      sens,
    }
    const b = errorBudget(bi)
    const radiusM = setup.targetCm / 200
    return {
      chance: hitChanceCircle(b.sigmaX, b.sigmaY, radiusM),
      dominant: dominantSource(b, radiusM),
      sigmaX: b.sigmaX,
      sigmaY: b.sigmaY,
      x: b.x,
      y: b.y,
      group: groupSizeM(bi),
    }
  }
}

/**
 * The reference MV (the one the preset stores, before the powder shift) that makes the observed dial come out at the
 * distance: calm air, no slope, the same air, switches and Coriolis/curvature as solveReal, the stored MV as the
 * starting guess. Null when the figure doesn't fit this load there, the round is below Mach 1.2 or the result is outside 200–1300 m/s (R3, R12). With the
 * powder-temperature effect on the bore is solved at the candidate reference MV and the flight at that MV plus today's
 * shift, exactly as solveReal does, so the returned reference MV reproduces the observed dial there.
 */
export function trueReal(
  preset: ResolvedPreset,
  profile: RealProfile,
  station: Station,
  unit: AngleUnit,
  distanceM: number,
  observed: number,
): number | null {
  const { fx, withAir, airIn, refMv, mv, bc, drag, sightHeightM, coriolis, zero } = flightBasis(preset, profile, station)
  const input: FlightInput = {
    muzzleVelocityMs: refMv,
    bc,
    drag,
    sightHeightM,
    zeroM: preset.zeroM,
    ...withAir(airIn),
    coriolis: fx.coriolis ? coriolis : undefined,
    earthCurvature: fx.curvature,
  }
  if (!(distanceM > 0) || !Number.isFinite(observed)) return null
  // Like solveReal: the bore is solved at the reference MV in measured air, the flight runs at the shifted MV.
  const stored = trueMuzzleVelocity(input, distanceM, radFromAngle(observed, unit), mv - refMv, zero.air)
  // The MV field takes 200–1300 m/s; a result outside it isn't a muzzle velocity anyone stores.
  return stored !== null && stored >= 200 && stored <= 1300 ? stored : null
}

interface Derived {
  stationPressureHPa: number
  mvUsedMs: number
  air: { densityKgM3: number; speedOfSoundMs: number }
  boreAngleRad: number
  clickValue: number
  clickKnown: boolean
  travelUp: number | null
  sg: number | null
}

function listInputs(
  preset: ResolvedPreset,
  setup: RealSetup,
  profile: RealProfile,
  station: Station,
  unit: AngleUnit,
  x: Derived,
): RealInput[] {
  const angle = unit === 'mil' ? 'MRAD' : 'MOA'
  const out: RealInput[] = []
  const add = (key: string, value: number, unitLabel: string, source: string, trust: Trust | null = null) =>
    out.push({ key, value, unit: unitLabel, source, trust })
  const sourced = (key: string, s: Sourced<number>, unitLabel: string) => add(key, s.value, unitLabel, s.source, s.trust)
  const field = (key: string, f: Field<number>, unitLabel: string) => add(key, f.value, unitLabel, f.source)

  add('distanceM', setup.distanceM, 'm', 'setup')
  add('slopeDeg', setup.slopeDeg, '°', 'setup')
  add('windMs', setup.windMs, 'm/s', 'setup')
  add('windClock', setup.windClock, 'h', 'setup')
  add('targetCm', setup.targetCm, 'cm', 'setup')

  field('tempC', station.tempC, '°C')
  const p = station.pressureHPa
  const fromQnh = p.source !== 'standard' && station.pressureKind === 'qnh'
  if (fromQnh) field('qnhHPa', p, 'hPa')
  add('stationPressureHPa', x.stationPressureHPa, 'hPa', fromQnh ? 'computed' : p.source)
  field('humidityPct', station.humidityPct, '%')
  field('altitudeM', station.altitudeM, 'm')
  field('latitudeDeg', station.latitudeDeg, '°')
  if (station.azimuthDeg !== null) field('azimuthDeg', station.azimuthDeg, '°')
  if (station.powderTempC !== null) field('powderTempC', station.powderTempC, '°C')
  else add('powderTempC', station.tempC.value, '°C', 'air')

  sourced('muzzleVelocityMs', preset.muzzleVelocityMs, 'm/s')
  if (preset.truedAtM !== null) add('truedAtM', preset.truedAtM, 'm', 'yours')
  sourced('mvRefTempC', preset.mvRefTempC, '°C')
  sourced('powderSensMsPerC', preset.powderSensMsPerC, 'm/s/°C')
  if (preset.mvSdMs !== null) sourced('mvSdMs', preset.mvSdMs, 'm/s')
  const drag = preset.drag.value
  if ('table' in drag) add('sectionalDensity', drag.sectionalDensity, 'lb/in²', preset.drag.source, preset.drag.trust)
  else add('bc', drag.bc, 'lb/in²', preset.drag.source, preset.drag.trust)
  sourced('sightHeightMm', preset.sightHeightMm, 'mm')
  add('zeroM', preset.zeroM, 'm', 'scope')
  sourced('twistIn', preset.twistIn, 'in')
  sourced('massGr', preset.bullet.massGr, 'gr')
  sourced('diameterIn', preset.bullet.diameterIn, 'in')
  if (preset.bullet.lengthMm !== null) sourced('lengthMm', preset.bullet.lengthMm, 'mm')
  sourced('accuracyMoa', preset.accuracyMoa, 'MOA')
  add('groupShots', preset.groupShots, 'shots', 'preset')
  add('clickValue', x.clickValue, angle, x.clickKnown ? 'scope' : 'default')
  if (x.travelUp !== null) add('travelUp', x.travelUp, angle, 'scope')

  add('windSigmaMs', profile.windSigmaMs, 'm/s', 'profile')
  add('holdSigmaMrad', profile.holdSigmaMrad, 'MRAD', 'profile')
  add('bcSdPct', profile.bcSdPct, '%', 'profile')

  add('mvUsedMs', x.mvUsedMs, 'm/s', 'computed')
  add('densityKgM3', x.air.densityKgM3, 'kg/m³', 'computed')
  add('speedOfSoundMs', x.air.speedOfSoundMs, 'm/s', 'computed')
  add('densityAltitudeM', densityAltitudeM(x.air.densityKgM3), 'm', 'computed')
  add('boreAngleMrad', x.boreAngleRad * 1000, 'MRAD', 'computed')
  if (x.sg !== null) add('sg', x.sg, '', 'computed')
  return out
}
