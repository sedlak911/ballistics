import { describe, expect, it } from 'vitest'
import { aimMark, C, MARK_MAX_PX, PX_PER_MIL, reticleLabels, reticleTicks, spreadEllipses, targetHeightPx } from './scopeGeometry'

describe('aimMark', () => {
  it('sits below the centre by the holdover, so the crosshair ends up above the target', () => {
    expect(aimMark(2, 0, 1, 'mil')).toEqual({ x: 220, y: 254, clamped: false })
  })

  it('is pulled in to the lens edge, and flagged, when the true aim point is outside the view', () => {
    // M700, M80A1, zero 100 m, sprinting target at 650 m.
    const far = aimMark(6.2, 9.3, 1, 'mil')
    expect(Math.hypot(far.x - C, far.y - C)).toBeCloseTo(MARK_MAX_PX, 6)
    expect(far.clamped).toBe(true)
    expect(far.x).toBeLessThan(C)
    expect(far.y).toBeGreaterThan(C)
    expect(aimMark(-11, 0, 1, 'mil').clamped).toBe(true)
    // Past the last hash but still drawn to scale.
    expect(aimMark(0, 8, 1, 'mil').clamped).toBe(false)
    expect(aimMark(6.9, 6.9, 1, 'mil').clamped).toBe(false)
  })

  it('sits behind the direction of travel by the lead', () => {
    expect(aimMark(0, 3, 1, 'mil').x).toBe(169)
    expect(aimMark(0, 3, -1, 'mil').x).toBe(271)
  })

  it('sits above the centre when holding under', () => {
    expect(aimMark(-1, 0, 1, 'mil').y).toBe(203)
  })

  it('scales MOA to the same pixels as MIL', () => {
    expect(aimMark(3.4377, 0, 1, 'moa').y).toBeCloseTo(237, 1)
  })
})

describe('sizes', () => {
  it('draws a 1.8 m target at its angular size', () => {
    expect(targetHeightPx(400)).toBeCloseTo(76.5, 0)
  })
})

describe('spreadEllipses', () => {
  it('rings 68 % and 95 % of shots: 1.51σ and 2.45σ of a 2D normal', () => {
    const e = spreadEllipses({ x: 1, y: 0.5 }, 'mil')!
    expect(e.r68.rx).toBeCloseTo(1.51 * PX_PER_MIL, 6)
    expect(e.r68.ry).toBeCloseTo(12.835, 6)
    expect(e.r95.rx).toBeCloseTo(41.65, 6)
    expect(e.r95.ry).toBeCloseTo(20.825, 6)
  })

  it('draws nothing when the spread is unknown', () => {
    expect(spreadEllipses(null, 'mil')).toBeNull()
  })
})

describe('reticleTicks', () => {
  it('hashes every MIL out to 7, longer on even MILs, numbered 2, 4 and 6', () => {
    const ticks = reticleTicks('mil')
    expect(ticks).toHaveLength(7)
    expect(ticks.filter((t) => t.major).map((t) => t.offsetPx / PX_PER_MIL)).toEqual([2, 4, 6])
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual(['2', '4', '6'])
  })

  it('hashes every 4 MOA, numbered 8, 16 and 24', () => {
    const ticks = reticleTicks('moa')
    expect(ticks).toHaveLength(6)
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual(['8', '16', '24'])
  })
})

describe('reticleLabels', () => {
  it('leaves out a number that an aim label would cover', () => {
    const labels = reticleLabels('mil', [{ x: C - 4 * PX_PER_MIL, y: C - 11 }])
    const fours = labels.filter((l) => l.text === '4')
    expect(fours.some((l) => l.x < C && l.y < C)).toBe(false)
    expect(fours.some((l) => l.x > C && l.y < C)).toBe(true)
    expect(fours.some((l) => l.y > C)).toBe(true)
  })

  it('leaves out a number that touches a box, such as the figure', () => {
    // A figure standing just right of the vertical axis, below the centre: covers the numbers there, not the others.
    const figure = { x0: C + 5, y0: C + 20, x1: C + 40, y1: C + 200 }
    const labels = reticleLabels('mil', [figure])
    expect(labels.filter((l) => l.y > C)).toHaveLength(0)
    expect(labels.filter((l) => l.y < C)).toHaveLength(6)
    // A box clear of every number takes none away.
    expect(reticleLabels('mil', [{ x0: C - 60, y0: C - 60, x1: C - 50, y1: C - 40 }])).toHaveLength(9)
  })

  it('sizes each number by the font, so a bigger font clears less room', () => {
    // Just past the 2 above the axis on the right: clear at 9px, touched once the digits grow to 20px.
    const box = { x0: C + 2 * PX_PER_MIL + 6, y0: C - 30, x1: C + 2 * PX_PER_MIL + 20, y1: C - 12 }
    expect(reticleLabels('mil', [box], 9)).toHaveLength(9)
    expect(reticleLabels('mil', [box], 20)).toHaveLength(8)
  })
})
