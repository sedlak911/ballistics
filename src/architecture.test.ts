import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The engine and shared components must work for every game, so they may never import game code.
const sources = import.meta.glob('/src/{engine,components}/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Colours live in the token and theme files, so a game's palette is one file to change. Read from disk: Vitest
// hands CSS modules over empty.
const SRC = __dirname
const styled = Object.fromEntries(
  (readdirSync(SRC, { recursive: true }) as string[])
    .map((f) => f.split('\\').join('/'))
    .filter((f) => /\.(css|tsx)$/.test(f) && !f.endsWith('.test.tsx'))
    .filter((f) => f !== 'styles/tokens.css' && !/^games\/[^/]+\/theme\.css$/.test(f))
    .map((f) => [f, readFileSync(join(SRC, f), 'utf8')]),
)

describe('import boundary', () => {
  it('engine and components never import from src/games', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    const offenders = Object.entries(sources)
      .filter(([, code]) => /from ['"][^'"]*games\//.test(code))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

describe('no dropdowns', () => {
  it('uses no dropdown menus', () => {
    const offenders = Object.entries(styled)
      .filter(([path, code]) => path.endsWith('.tsx') && /<select\b/.test(code))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

describe('design tokens', () => {
  it('keeps hex colours in the token and theme files', () => {
    expect(Object.keys(styled).length).toBeGreaterThan(0)
    const offenders = Object.entries(styled)
      .filter(([, code]) => /#[0-9a-fA-F]{3,8}\b/.test(code))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

// The weather lookup is the only network call in the app, and the privacy promise depends on it staying in one file.
describe('network', () => {
  it('has no network API outside games/real/weather.ts', () => {
    const files = (readdirSync(SRC, { recursive: true }) as string[])
      .map((f) => f.split('\\').join('/'))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files
      .filter((f) => f !== 'games/real/weather.ts')
      .filter((f) => /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/.test(readFileSync(join(SRC, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
