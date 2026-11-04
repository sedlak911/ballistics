import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read from disk relative to the project root (the folder above src/).
const ROOT = join(__dirname, '../..')
const css = (path: string) => readFileSync(join(ROOT, path), 'utf8')
/** The declarations of the first rule whose selector list is exactly `selector`. */
const rule = (path: string, selector: string) => {
  const source = css(path)
  const at = source.search(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`))
  expect(at, `${selector} in ${path}`).toBeGreaterThanOrEqual(0)
  return source.slice(at, source.indexOf('}', at))
}

// DESIGN.md → Surfaces → Glass: every surface that opens over the page is the same frosted glass.
const OPEN_SURFACES: [string, string][] = [
  ['src/styles/shell.css', '.sheet.panel'],
  ['src/styles/ui.css', '.popover.panel'],
  ['src/styles/ui.css', '.toast'],
  ['src/games/real/components/settings.css', '.rs-sheet.panel'],
  ['src/games/real/components/calc.css', '.calc-sheet.panel'],
  ['src/games/real/components/real.css', '.real-panel'],
  ['src/games/real/components/camera.css', '.real-cam-glass'],
  ['src/games/gzw/components/import.css', '.modal.panel'],
]

describe('the open surfaces', () => {
  it.each(OPEN_SURFACES)('%s %s is frosted glass', (path, selector) => {
    const body = rule(path, selector)
    expect(body).toContain('background: var(--glass);')
    expect(body).toContain('backdrop-filter: var(--glass-blur);')
  })

  it('turn opaque when the system asks for less transparency', () => {
    const tokens = css('src/styles/tokens.css')
    const reduced = tokens.slice(tokens.indexOf('@media (prefers-reduced-transparency: reduce)'))
    expect(reduced).toContain('--glass: var(--panel);')
    expect(reduced).toContain('--glass-blur: none;')
  })

  it('see the page through the header: its ground is a layer of its own, not a backdrop root round its sheets', () => {
    expect(rule('src/styles/shell.css', '.app-header')).not.toContain('backdrop-filter')
    expect(rule('src/styles/shell.css', '.app-header.over::before')).toContain('backdrop-filter')
  })
})
