import { describe, expect, it } from 'vitest'
import { cs } from './cs'
import { en } from './en'
import { translate, type TKey } from './index'

describe('translations', () => {
  it('Czech covers every English key with a non-empty string', () => {
    expect(Object.keys(cs).sort()).toEqual(Object.keys(en).sort())
    for (const [k, v] of Object.entries(cs)) expect(v, k).toMatch(/\S/)
  })

  it('interpolates {placeholders}', () => {
    expect(translate('en', 'orZero', { d: '400 m' })).toBe('or set zero to 400 m')
  })

  it('has one Czech word for zero: nástřel', () => {
    for (const k of ['wb.zero', 'wb.zeroPresets', 'menu.scope', 'orZero', 'wb.maxZero'] as TKey[]) expect(cs[k], k).toMatch(/nást|nastřel/i)
    for (const [k, v] of Object.entries(cs)) expect(v, k).not.toMatch(/\bzero\b|\bnul[ay]\b/i)
    expect(cs['menu.scope']).toBe('Optika a nástřel')
  })

  it('leads with the same Czech verb on the scope and in the answer', () => {
    expect(cs['sc.lead']).toBe('Předsadit')
    expect(cs['wb.lead']).toBe('Předsadit')
    expect([cs['sc.holdOver'], cs['sc.holdUnder']]).toEqual([cs['wb.holdOver'], cs['wb.holdUnder']])
  })

  it('names the energy reference as where the pen data ends', () => {
    const vars = { d: '600 m', e: 59, ref: '150 m' }
    expect(translate('en', 'pen.energy', vars)).toMatch(/^At 600 m: ≈ 59\s% of its energy at 150 m, where pen data ends$/)
    expect(translate('cs', 'pen.energy', vars)).toMatch(/^Na 600 m má ≈ 59\s% energie co na 150 m \(kam sahají data průbojnosti\)$/)
  })

  it('names the figure the height reading measures', () => {
    expect(translate('en', 'rg.spans', { figure: translate('en', 'rg.fig.prone'), unit: 'MIL' })).toBe('Prone figure (1.8 m long) spans (MIL)')
    expect(translate('cs', 'rg.spans', { figure: translate('cs', 'rg.fig.kneeling'), unit: 'MIL' })).toBe('Klečící postava (1,2 m) zabírá (MIL)')
  })
})
