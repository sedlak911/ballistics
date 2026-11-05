import { describe, expect, it } from 'vitest'
import { translate } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import { arrowed, chanceText, clickDigits, clickLabel, clicksText, dec, LEFT_RIGHT, lengthText, rifleTagText, rounded, sourceMaker, speedShort, UP_DOWN, windText } from './realText'

const t = (lang: Lang) => (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars)

describe('REAL text', () => {
  it('never prints a negative zero: a value that rounds to zero is a plain 0 without an arrow', () => {
    expect(arrowed(-0.04, UP_DOWN)).toBe('0')
    expect(arrowed(0.04, LEFT_RIGHT)).toBe('0')
    expect(arrowed(-0, UP_DOWN)).toBe('0')
    expect(Object.is(rounded(-0.004, 2), -0)).toBe(false)
    expect(dec(-0.01, 1, 'en')).toBe('0.0')
  })

  it('takes the arrow from the rounded value', () => {
    expect(arrowed(8.26, UP_DOWN)).toBe('↑8.3')
    expect(arrowed(-0.55, UP_DOWN)).toBe('↓0.6')
    expect(arrowed(-1.62, LEFT_RIGHT)).toBe('←1.6')
    expect(arrowed(0.05, LEFT_RIGHT)).toBe('→0.1')
  })

  it('writes a decimal comma in Czech sentences only', () => {
    expect(dec(1.62, 1, 'cs')).toBe('1,6')
    expect(dec(1.62, 1, 'en')).toBe('1.6')
  })

  it('counts clicks in each language’s plural forms', () => {
    expect(clicksText(1, t('en'), 'en')).toBe('1 click')
    expect(clicksText(83, t('en'), 'en')).toBe('83 clicks')
    expect(clicksText(0, t('en'), 'en')).toBe('0 clicks')
    expect(clicksText(1, t('cs'), 'cs')).toBe('1 klik')
    expect(clicksText(3, t('cs'), 'cs')).toBe('3 kliky')
    expect(clicksText(5, t('cs'), 'cs')).toBe('5 kliků')
    expect(clicksText(0, t('cs'), 'cs')).toBe('0 kliků')
  })

  it('never claims a certain hit or a certain miss', () => {
    expect(chanceText(0.351)).toBe('≈ 35 %')
    expect(chanceText(0.999)).toBe('> 99 %')
    expect(chanceText(0.001)).toBe('< 1 %')
  })

  it('gives the dialled figure as many decimals as the click', () => {
    expect([0.1, 0.05, 0.25, 0.125].map(clickDigits)).toEqual([1, 2, 2, 3])
  })

  it('shows lengths and wind in the units the owner reads', () => {
    expect(lengthText(-0.046, 'metric')).toBe('5 cm')
    expect(lengthText(0.0254, 'imperial')).toBe('1 in')
    expect(windText(3, 'm/s')).toBe('3 m/s')
    expect(windText(0.556, 'km/h')).toBe('2 km/h')
    expect(windText(2.5, 'm/s')).toBe('2.5 m/s')
  })
})

describe('setup tag text', () => {
  it('names the rifle with its barrel length', () => {
    expect(rifleTagText('AI AXSR / AXMC .338 27″', '686 mm')).toBe('AI AXSR · 27″')
    expect(rifleTagText('CZ BREN 2 14″', '14″')).toBe('CZ BREN 2 · 14″')
    expect(rifleTagText('Desert Tech HTI', '29″')).toBe('Desert Tech HTI · 29″')
    expect(rifleTagText('Custom', '—')).toBe('Custom')
  })

  it('writes a click as the shooter says it', () => {
    expect([0.1, 0.05, 0.25, 0.125].map(clickLabel)).toEqual(['0.1', '0.05', '¼', '⅛'])
  })

  it('keeps the maker of a source and drops the detail', () => {
    expect(sourceMaker('Lapua, 680 mm test barrel')).toBe('Lapua')
    expect(sourceMaker('Accuracy International, 1:9.35″')).toBe('Accuracy International')
    expect(sourceMaker('McCoy BRL-MR-3810 (1990), Table 2; NATO reference round')).toBe('McCoy BRL-MR-3810')
    expect(sourceMaker('estimate: nobody publishes the sight height')).toBe('estimate')
  })
})

describe('speedShort', () => {
  it('is a tenth below 10 and whole from 10, in the wind unit', () => {
    expect(speedShort(15 / 3.6, 'km/h')).toBe(15)
    expect(speedShort(9.44 / 3.6, 'km/h')).toBe(9.4)
    expect(speedShort(4.5, 'm/s')).toBe(4.5)
    expect(speedShort(10.26, 'm/s')).toBe(10)
    expect(speedShort(12.3 * 0.44704, 'mph')).toBe(12)
  })
})
