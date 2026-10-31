import { describe, expect, it } from 'vitest'
import {
  angleFromRad,
  angleOfOffset,
  cToF,
  fToC,
  fromDisplay,
  LENGTH_TO_MM,
  MASS_TO_G,
  PRESSURE_TO_HPA,
  radFromAngle,
  SPEED_TO_MS,
  toDisplay,
  type Quantity,
} from './units'

describe('angles', () => {
  it('10 cm at 100 m is 1 MIL', () => {
    expect(angleOfOffset(0.1, 100, 'mil')).toBeCloseTo(1.0, 3)
  })

  it('2.909 cm at 100 m is 1 MOA', () => {
    expect(angleOfOffset(0.0290888, 100, 'moa')).toBeCloseTo(1.0, 3)
  })

  it('round-trips MOA through radians', () => {
    expect(angleFromRad(radFromAngle(2.5, 'moa'), 'moa')).toBeCloseTo(2.5, 9)
  })
})

describe('display units', () => {
  it('converts 100 m to yards', () => {
    expect(toDisplay(100, 'distance', 'imperial').value).toBeCloseTo(109.361, 3)
  })

  it('shows lengths in inches', () => {
    const d = toDisplay(0.0254, 'length', 'imperial')
    expect(d.unit).toBe('in')
    expect(d.value).toBeCloseTo(1, 9)
  })

  it('shows speeds in ft/s', () => {
    expect(toDisplay(1, 'speed', 'imperial').value).toBeCloseTo(3.28084, 5)
  })

  it('uses m, cm and m/s in metric', () => {
    expect(toDisplay(437, 'distance', 'metric')).toEqual({ value: 437, unit: 'm' })
    expect(toDisplay(0.25, 'length', 'metric')).toEqual({ value: 25, unit: 'cm' })
    expect(toDisplay(835, 'speed', 'metric')).toEqual({ value: 835, unit: 'm/s' })
  })

  it.each<Quantity>(['distance', 'length', 'speed'])('round-trips %s through imperial without drift', (q) => {
    expect(fromDisplay(toDisplay(437, q, 'imperial').value, q, 'imperial')).toBeCloseTo(437, 9)
  })
})

describe('REAL input units', () => {
  it('29.92 inHg is about 1013.2 hPa', () =>
    expect(29.92 * PRESSURE_TO_HPA.inHg).toBeCloseTo(1013.2, 0))
  it('250 gr is about 16.2 g', () => expect(250 * MASS_TO_G.gr).toBeCloseTo(16.2, 1))
  it('1:9.35 in twist is about 237.5 mm', () => expect(9.35 * LENGTH_TO_MM.in).toBeCloseTo(237.5, 1))
  it('59 F is 15 C and back', () => {
    expect(fToC(59)).toBeCloseTo(15, 9)
    expect(cToF(15)).toBeCloseTo(59, 9)
  })
  it('10 mph is about 4.47 m/s', () => expect(10 * SPEED_TO_MS.mph).toBeCloseTo(4.47, 2))
})
