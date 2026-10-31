import { describe, expect, it } from 'vitest'
import { preprocess } from './preprocess'

const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat())

describe('preprocess', () => {
  it('keeps light grey text as black on white and drops coloured background, at twice the size', () => {
    const out = preprocess({ width: 2, height: 1, data: pixels([255, 255, 255, 255], [30, 80, 30, 255]) })
    expect(out.width).toBe(4)
    expect(out.height).toBe(2)
    const row = [0, 1, 2, 3].map((x) => out.data[x * 4])
    expect(row).toEqual([0, 0, 255, 255])
    expect(out.data[3]).toBe(255)
  })

  it('treats bright but saturated pixels as background', () => {
    const out = preprocess({ width: 1, height: 1, data: pixels([255, 160, 20, 255]) }, 1)
    expect(out.data[0]).toBe(255)
  })
})
