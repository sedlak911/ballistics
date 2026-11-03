import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read from disk relative to the project root (the folder above src/).
const ROOT = join(__dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path))
const manifest = () => JSON.parse(read('public/manifest.webmanifest').toString('utf8'))

describe('the home screen install files', () => {
  it('the manifest installs one app that starts at the root', () => {
    const m = manifest()
    expect(m.name).toBe('Ballistics')
    expect(m.short_name).toBe('Ballistics')
    expect(m.display).toBe('standalone')
    // No id: it defaults to start_url, which resolves inside the app's folder on any host.
    expect(m).not.toHaveProperty('id')
    expect(m.start_url).toBe('./')
    expect(m.scope).toBe('./')
    expect(m.background_color).toBe('#0b0d0e')
    expect(m.theme_color).toBe('#0b0d0e')
  })

  it('its icons exist at their stated sizes', () => {
    const m = manifest()
    expect(m.icons).toHaveLength(3)
    const expected = [
      ['icons/icon-192.png', '192x192', 'any'],
      ['icons/icon-512.png', '512x512', 'any'],
      ['icons/icon-maskable-512.png', '512x512', 'maskable'],
    ]
    expect(m.icons.map((i: { src: string; sizes: string; purpose: string }) => [i.src, i.sizes, i.purpose])).toEqual(expected)
    const size = (bytes: Buffer) => {
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
    }
    for (const icon of m.icons) {
      expect(icon.type).toBe('image/png')
      expect(icon.src.startsWith('/')).toBe(false)
      expect(size(read(`public/${icon.src}`))).toBe(icon.sizes)
    }
    expect(size(read('public/icons/apple-touch-icon.png'))).toBe('180x180')
  })

  it.each(['index.html', 'cs/index.html', 'en/index.html'])('%s links the manifest and opens edge to edge', (page) => {
    const html = read(page).toString('utf8')
    for (const part of [
      'rel="manifest"',
      'rel="apple-touch-icon"',
      '<meta name="theme-color" content="#0b0d0e"',
      'name="apple-mobile-web-app-status-bar-style" content="black-translucent"',
      'name="apple-mobile-web-app-title" content="Ballistics"',
      'viewport-fit=cover',
      // Dark before the first paint, so a cold launch from the home screen never flashes white.
      '<meta name="color-scheme" content="dark" />',
      '<style>html{background:#0b0d0e}</style>',
    ]) expect(html).toContain(part)
  })
})
