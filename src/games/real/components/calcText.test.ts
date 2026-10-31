import { describe, expect, it } from 'vitest'
import type { RealInput } from '../solve'
import { fix, inputValue, len, num, term } from './calcText'
import { LEFT_RIGHT } from './realText'

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
