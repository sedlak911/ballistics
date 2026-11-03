import { describe, expect, it } from 'vitest'
import { angularSpread, cameraReading, circularMean, topEdgeReading } from './orientation'

const abs = (alpha: number, beta: number, gamma: number) => ({ alpha, beta, gamma, absolute: true })

describe('topEdgeReading', () => {
  it('uses webkitCompassHeading when present', () => {
    expect(topEdgeReading({ webkitCompassHeading: 274.4, beta: -4.2, alpha: 10, gamma: 0, absolute: false })).toEqual({ headingDeg: 274.4, pitchDeg: -4.2 })
  })
  it('uses 360 - alpha when absolute', () => {
    expect(topEdgeReading({ alpha: 86, beta: 3, gamma: 0, absolute: true })).toEqual({ headingDeg: 274, pitchDeg: 3 })
  })
  it('is null without a compass source', () => {
    expect(topEdgeReading({ alpha: 86, beta: 3, gamma: 0, absolute: false })).toBeNull()
  })
  it('is null when beta or the heading is missing or not finite', () => {
    expect(topEdgeReading({ alpha: 86, beta: null, gamma: 0, absolute: true })).toBeNull()
    expect(topEdgeReading({ alpha: null, beta: 3, gamma: 0, absolute: true })).toBeNull()
    expect(topEdgeReading({ alpha: 86, beta: NaN, gamma: 0, absolute: true })).toBeNull()
  })
})

describe('cameraReading', () => {
  it('upright phone faces the heading of alpha 0 with a level pitch', () => {
    const r = cameraReading(abs(0, 90, 0))!
    expect(r.headingDeg).toBeCloseTo(0, 6)
    expect(r.pitchDeg).toBeCloseTo(0, 6)
  })
  it('alpha 90 turns the camera to 270', () => {
    const r = cameraReading(abs(90, 90, 0))!
    expect(r.headingDeg).toBeCloseTo(270, 6)
    expect(r.pitchDeg).toBeCloseTo(0, 6)
  })
  it('a phone tilted back to beta 60 looks 30 degrees down', () => {
    const r = cameraReading(abs(0, 60, 0))!
    expect(r.pitchDeg).toBeCloseTo(-30, 6)
    expect(r.headingDeg).toBeCloseTo(0, 6)
  })
  it('on iOS alpha becomes 360 - webkitCompassHeading', () => {
    const r = cameraReading({ alpha: 12, beta: 90, gamma: 0, absolute: false, webkitCompassHeading: 274 })!
    expect(r.headingDeg).toBeCloseTo(274, 6)
    expect(r.pitchDeg).toBeCloseTo(0, 6)
  })
  it('is null without a compass source or with a missing angle', () => {
    expect(cameraReading({ alpha: 0, beta: 90, gamma: 0, absolute: false })).toBeNull()
    expect(cameraReading({ alpha: 0, beta: null, gamma: 0, absolute: true })).toBeNull()
    expect(cameraReading({ alpha: 0, beta: 90, gamma: null, absolute: true })).toBeNull()
  })
})

describe('circular maths', () => {
  it('averages across north', () => {
    const m = circularMean([359, 1])
    expect(Math.min(m, 360 - m)).toBeCloseTo(0, 6)
    expect(m).toBeGreaterThanOrEqual(0)
    expect(m).toBeLessThan(360)
  })
  it('averages plain angles', () => {
    expect(circularMean([10, 20])).toBeCloseTo(15, 6)
  })
  it('spread is the largest difference on the circle', () => {
    expect(angularSpread([359, 1], 0)).toBeCloseTo(1, 6)
  })
})
