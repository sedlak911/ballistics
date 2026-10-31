import { describe, expect, it } from 'vitest'
import { buildHash, parseHash } from './router'

describe('parseHash', () => {
  it('reads game, page and params', () => {
    const r = parseHash('#/gzw/workbench?w=m700')
    expect(r.game).toBe('gzw')
    expect(r.page).toBe('workbench')
    expect(r.params.get('w')).toBe('m700')
  })

  it('sends links to the old pages to the bench, keeping their setup', () => {
    for (const page of ['armor', 'sheet', 'ranging', 'profile', 'regions']) {
      const r = parseHash(`#/gzw/${page}?w=m700`)
      expect(r.page).toBe('workbench')
      expect(r.params.get('w')).toBe('m700')
    }
  })

  it('falls back to the REAL workbench for empty or unknown hashes', () => {
    expect(parseHash('')).toMatchObject({ game: 'real', page: 'workbench' })
    expect(parseHash('#/nope/zzz')).toMatchObject({ game: 'real', page: 'workbench' })
  })

  it('keeps known but unavailable games so the app can say "coming soon"', () => {
    expect(parseHash('#/wardogs/workbench').game).toBe('wardogs')
  })
})

describe('buildHash', () => {
  it('round-trips a hash', () => {
    const h = '#/gzw/workbench?w=m700&z=200'
    expect(buildHash(parseHash(h))).toBe(h)
  })

  it('omits an empty query', () => {
    expect(buildHash({ game: 'gzw', page: 'workbench', params: new URLSearchParams() })).toBe('#/gzw/workbench')
  })
})
