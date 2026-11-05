import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../../../..')
const css = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('the glow', () => {
  it('has its colour tokens', () => {
    const tokens = css('src/styles/tokens.css')
    for (const decl of ['--need: #ff5a52;', '--want: #ffa23e;', '--yours: #4ee6a8;', '--yours-glow: var(--ok);']) expect(tokens).toContain(decl)
  })

  it('is one mechanism on text and icon', () => {
    const glow = css('src/games/real/components/glow.css')
    expect(glow).toContain('--glow-c: var(--need)')
    expect(glow).toContain('--glow-c: var(--want)')
    expect(glow.split('3.5s ease-in-out infinite')).toHaveLength(3)
    expect(glow.replace(/@keyframes[^{]+\{(?:[^{}]|\{[^}]*\})*\}/g, '')).toMatch(/text-shadow/)
  })

  it('draws no frame, box, fill or size change', () => {
    const glow = css('src/games/real/components/glow.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(glow).not.toMatch(/\b(border|box-shadow|background|outline|width|height|padding)\b/)
  })

  it('marks your values in the calculation sheet, steady', () => {
    const calc = css('src/games/real/components/calc.css')
    const yours = calc.match(/[^{}]*\.calc-yours[^{}]*\{([^}]*)\}/)![1]
    expect(yours).toContain('var(--yours)')
    expect(yours).toMatch(/text-shadow:[^;]*--yours-glow/)
    expect(calc.match(/[^{}]*\.tag\.yours[^{}]*\{([^}]*)\}/)![1]).toContain('var(--yours)')
    expect(calc).not.toMatch(/\.(calc-yours|tag\.yours)[^{]*\{[^}]*animation/)
  })
})
