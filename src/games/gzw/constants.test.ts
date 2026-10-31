import { describe, expect, it } from 'vitest'
import constants from './data/ballistics-constants.json'
import { gzw } from './data'
import { constantFor, workbenchAmmo, workbenchWeapons } from './workbench'

describe('ballistics-constants.json', () => {
  it('covers every workbench round, directly or through its caliber', () => {
    const missing = workbenchWeapons(gzw)
      .flatMap((w) => workbenchAmmo(gzw, w))
      .filter((a) => constantFor(a) === null)
      .map((a) => a.name)
    expect(missing).toEqual([])
  })

  it('cites a source for every entry', () => {
    for (const [key, c] of Object.entries(constants)) {
      expect(c.source, key).toMatch(/\S/)
      expect(c.bc, key).toBeGreaterThan(0)
      expect(['G1', 'G7'], key).toContain(c.dragModel)
    }
  })
})
