import { describe, expect, it } from 'vitest'
import { backHref, gameFromHash } from './back'

describe('the game the what’s-new page came from', () => {
  it('reads a known game id from the hash ⓘ’s link gives', () => {
    expect(gameFromHash('#real')).toBe('real')
    expect(gameFromHash('#gzw')).toBe('gzw')
    expect(gameFromHash('#wardogs')).toBe('wardogs')
  })

  it('takes nothing else', () => {
    for (const hash of ['', '#', '#nope', '#GZW', '#/gzw/workbench', '#gzw?x=1', '#constructor']) expect(gameFromHash(hash), hash).toBeNull()
  })

  it('leads back to that game’s workbench, or to the app’s own start', () => {
    expect(backHref('gzw')).toBe('../#/gzw/workbench')
    expect(backHref(null)).toBe('../')
  })
})
