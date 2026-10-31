import { describe, expect, it } from 'vitest'
import { fmtDistance, fmtLength, fmtSpeed, NBSP } from './format'

describe('formatting', () => {
  it('never lets a figure and its unit split across lines', () => {
    expect(fmtDistance(50, 'metric')).not.toContain(' ')
    expect(NBSP).toBe('\u00a0')
  })


  it('formats distances', () => {
    expect(fmtDistance(400, 'metric')).toBe(`400${NBSP}m`)
    expect(fmtDistance(400, 'imperial')).toBe(`437${NBSP}yd`)
  })

  it('formats lengths in cm below a metre and in m above', () => {
    expect(fmtLength(0.42, 'metric')).toBe(`42${NBSP}cm`)
    expect(fmtLength(1.134, 'metric')).toBe(`1.13${NBSP}m`)
    expect(fmtLength(-0.42, 'metric')).toBe(`42${NBSP}cm`)
    expect(fmtLength(0.0254 * 7, 'imperial')).toBe(`7${NBSP}in`)
  })

  it('formats speeds', () => {
    expect(fmtSpeed(835, 'metric')).toBe(`835${NBSP}m/s`)
    expect(fmtSpeed(835, 'imperial')).toBe(`2740${NBSP}ft/s`)
  })
})
