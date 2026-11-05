import { describe, expect, it } from 'vitest'
import type { RealInput } from '../solve'
import { elevationAngleText, fix, hitHeightText, inputValue, isYours, lagFigures, len, num, term } from './calcText'
import { LEFT_RIGHT, NBSP } from './realText'

const inputs: RealInput[] = [{ key: 'distanceM', value: 1000, unit: 'm', source: 'setup', trust: null }]

describe('calcText', () => {
  it('reads an input, and a key that is not there throws in development and tests', () => {
    expect(inputValue(inputs, 'distanceM')).toBe(1000)
    expect(() => inputValue(inputs, 'densityKgM3')).toThrow(/densityKgM3/)
  })

  it('prints a value it could not get as a dash, never NaN', () => {
    expect(num(NaN, 1, 'en')).toBe('—')
    expect(fix(NaN, 2, 'cs')).toBe('—')
    expect(len(NaN, 'metric')).toBe('—')
    expect(term(NaN, 'metric', LEFT_RIGHT)).toBe('—')
  })

  it('writes the terms of a sum with a decimal comma in Czech', () => {
    expect(term(0.077, 'metric', LEFT_RIGHT, 'cs')).toBe('→7,7')
    expect(term(-0.26, 'metric', LEFT_RIGHT, 'cs')).toBe('←26')
    expect(term(0.077, 'metric', LEFT_RIGHT)).toBe('→7.7')
    expect(term(0.0001, 'metric', LEFT_RIGHT, 'cs')).toBe('0')
  })
})

describe('isYours', () => {
  const inp = (key: string, source: string, trust: RealInput['trust'] = null): RealInput => ({ key, value: 1, unit: '', source, trust })
  it('is true for what you set', () => {
    for (const source of ['yours', 'link', 'manual']) expect(isYours(inp('tempC', source), false)).toBe(true)
    expect(isYours(inp('truedAtM', 'yours'), false)).toBe(true)
    expect(isYours(inp('distanceM', 'setup'), false)).toBe(true)
    expect(isYours(inp('slopeDeg', 'setup'), false)).toBe(true)
  })
  it('is false for everything else', () => {
    for (const source of ['model', 'standard', 'location', 'default']) expect(isYours(inp('tempC', source), false)).toBe(false)
    expect(isYours(inp('bc', 'Hornady 2024', 'V'), false)).toBe(false)
    expect(isYours(null, true)).toBe(false)
  })
  it('follows windByHand for the wind', () => {
    for (const key of ['windMs', 'windClock']) {
      expect(isYours(inp(key, 'setup'), true)).toBe(true)
      expect(isYours(inp(key, 'setup'), false)).toBe(false)
    }
  })

  it('the figures a step’s body and its working share', () => {
    const sp = (x: string) => x.replaceAll(NBSP, ' ')
    expect(sp(hitHeightText(-0.2144, 'en'))).toBe('0.214 m')
    expect(sp(hitHeightText(-2.1444, 'cs'))).toBe('2,14 m')
    expect(sp(elevationAngleText(-2.142, 600, 3.57, 'mil', 'en'))).toBe('3.57 MRAD')
    expect(sp(elevationAngleText(-2.142, 600, 12.27, 'moa', 'cs'))).toBe('3,57 MRAD = 12,27 MOA')
    expect(lagFigures({ crossMs: -3, timeS: 0.7944, vacuumTimeS: 600 / 900, driftM: -0.3833 }, 600, 'en'))
      .toEqual({ w: '3.0', t: '0.794', d: '600', v: '900', lag: '0.128', drift: '0.38' })
  })
})
