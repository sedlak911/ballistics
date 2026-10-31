import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScopeView, type ScopeViewProps } from './ScopeView'
import { C, LENS_R, PX_PER_MIL } from './scopeGeometry'

afterEach(cleanup)

const base: ScopeViewProps = {
  distanceM: 400, holdover: 2.6, lead: 8, direction: 1, pose: 'running', unit: 'mil',
  spread: { x: 2.4, y: 0.5 }, aimAt: 'head', labels: { hold: 'Hold', lead: 'Lead' },
  caption: '3.5–18× · FFP · MIL', offViewLabel: 'Beyond the scope view',
}
const draw = (p: Partial<ScopeViewProps> = {}) => render(<ScopeView {...base} {...p} />).container

describe('ScopeView', () => {
  it('draws the 68 % and 95 % spread when the spread is known', () => {
    expect(draw().querySelectorAll('ellipse')).toHaveLength(2)
    cleanup()
    expect(draw({ spread: null }).querySelectorAll('ellipse')).toHaveLength(0)
  })

  it('draws no spread around a mark pulled in to the edge of the view', () => {
    const svg = draw({ holdover: 6.2, lead: 9.3, distanceM: 700 })
    expect(svg.querySelector('.off-view')).not.toBeNull()
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0)
  })

  it('labels hold and lead on plates, the hold with its direction glyph', () => {
    const svg = draw()
    expect(svg).toHaveTextContent('HOLD ↑2.6')
    expect(svg).toHaveTextContent('LEAD 8.0')
    cleanup()
    expect(draw({ lead: 0 })).not.toHaveTextContent('LEAD')
    cleanup()
    expect(draw({ holdover: -0.3 })).toHaveTextContent('HOLD ↓0.3')
  })

  it('puts the caption, legend and all, under the lens in HTML', () => {
    const view = draw({ legend: { aim: 'aim point', r68: '68 % of shots', r95: '95 %' } })
    const svg = screen.getByRole('img', { name: /FFP/ })
    const caption = view.querySelector('figcaption')!
    expect(caption).toHaveTextContent('aim point')
    expect(caption).toHaveTextContent('68 % of shots')
    expect(caption).toHaveTextContent('3.5–18× · FFP · MIL')
    expect(svg).not.toHaveTextContent('aim point')
    expect(svg).not.toHaveTextContent('FFP')
    expect(caption.querySelectorAll('svg')).toHaveLength(3)
  })

  it('keeps text in the lens readable without a measured width', () => {
    // Without a ResizeObserver the scope is taken at its viewBox size: plates at 10.5, numbers at the 10px floor.
    const svg = draw()
    const sizes = [...svg.querySelectorAll('svg.scope-view text')].map((t) => Number(t.getAttribute('font-size') ?? t.parentElement!.getAttribute('font-size')))
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(13)
  })

  it('leaves out the hash numbers that would sit on the figure', () => {
    // A standing figure at 100 m covers the vertical axis below the centre, so no numbers go there.
    const svg = draw({ distanceM: 100, pose: 'standing', holdover: 0, lead: 0, aimAt: 'head' })
    const numbers = [...svg.querySelectorAll('.reticle-numbers text')]
    expect(numbers.some((n) => Number(n.getAttribute('y')) > C)).toBe(false)
    cleanup()
    // Far off, the figure is small and the numbers are back.
    const far = draw({ distanceM: 600, pose: 'standing', holdover: 0, lead: 0, aimAt: 'head' })
    expect([...far.querySelectorAll('.reticle-numbers text')].some((n) => Number(n.getAttribute('y')) > C)).toBe(true)
  })

  it('outlines the silhouette under its ink', () => {
    const pose = draw().querySelector('[data-pose]')!
    expect(pose.firstElementChild).toHaveClass('figure-rim')
    expect(pose.children).toHaveLength(2)
  })

  it('draws the target in its pose', () => {
    expect(draw().querySelector('[data-pose="running"]')).not.toBeNull()
    cleanup()
    expect(draw({ pose: 'kneeling', lead: 0 }).querySelector('[data-pose="kneeling"]')).not.toBeNull()
    cleanup()
    expect(draw({ pose: 'prone', lead: 0 }).querySelector('[data-pose="prone"]')).not.toBeNull()
  })

  it('fits the beyond-the-view plate, label and all, inside the lens', () => {
    const label = 'Beyond the scope view: use the numbers'
    const rect = draw({ holdover: 6.2, lead: 9.3, offViewLabel: label }).querySelector('.off-view rect')!
    const [x, y, w] = ['x', 'y', 'width'].map((k) => Number(rect.getAttribute(k)))
    expect(w).toBeGreaterThanOrEqual(label.length * 6.3 + 16)
    for (const cx of [x, x + w]) expect(Math.hypot(cx - C, y - C)).toBeLessThanOrEqual(LENS_R - 6)
  })

  it('marks the figure with its size in the reticle unit, across for a prone one', () => {
    const bracket = (p: Partial<ScopeViewProps>) => draw({ lead: 0, holdover: 0.5, ...p }).querySelector('[data-testid="size-bracket"]')
    expect(bracket({ distanceM: 360, pose: 'standing' })).toHaveTextContent('5.0 MIL')
    expect(bracket({ distanceM: 360, pose: 'standing' })).toHaveAttribute('data-axis', 'y')
    cleanup()
    expect(bracket({ distanceM: 240, pose: 'kneeling' })).toHaveTextContent('5.0 MIL')
    cleanup()
    expect(bracket({ distanceM: 360, pose: 'prone' })).toHaveAttribute('data-axis', 'x')
    cleanup()
    expect(bracket({ distanceM: 360, pose: 'standing', unit: 'moa' })).toHaveTextContent('17.2 MOA')
    cleanup()
    // A running figure leans, but the plate gives what the height reading counts: 1.8 m.
    expect(bracket({ distanceM: 360, pose: 'running' })).toHaveTextContent('5.0 MIL')
  })

  it('keeps the size figure inside the lens at close range', () => {
    for (const [distanceM, pose, aimAt] of [[100, 'standing', 'head'], [50, 'standing', 'chest'], [50, 'kneeling', 'head'], [50, 'prone', 'head']] as const) {
      const rect = draw({ lead: 0, holdover: 0, distanceM, pose, aimAt }).querySelector('[data-testid="size-bracket"] rect')!
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => Number(rect.getAttribute(k)))
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        expect(Math.hypot(cx - C, cy - C), `${pose} at ${distanceM} m`).toBeLessThanOrEqual(LENS_R - 6)
      }
      cleanup()
    }
  })

  it('drops the size bracket when the aim point is beyond the view', () => {
    expect(draw({ holdover: 6.2, lead: 9.3 }).querySelector('[data-testid="size-bracket"]')).toBeNull()
  })

  it('says when the aim point is beyond the view and drops the plates', () => {
    const svg = draw({ holdover: 6.2, lead: 9.3 })
    expect(screen.getByText('Beyond the scope view')).toBeInTheDocument()
    expect(svg).not.toHaveTextContent('HOLD')
    expect(svg).not.toHaveTextContent('LEAD')
  })
})

describe('ScopeView with a round target', () => {
  const disc = { kind: 'disc', diameterM: 0.5 } as const
  const plate = (p: Partial<ScopeViewProps> = {}) => draw({ target: disc, distanceM: 600, holdover: 3, lead: 1, direction: -1, spread: null, ...p })

  it('draws the plate at true angular size and no soldier', () => {
    const svg = plate()
    const g = svg.querySelector('[data-testid="disc"]')!
    expect(Number(g.getAttribute('data-diameter-px'))).toBeCloseTo(PX_PER_MIL * 0.833, 1)
    const circle = [...g.querySelectorAll('circle')].at(-1)!
    expect(Number(circle.getAttribute('r'))).toBeCloseTo((PX_PER_MIL * 0.8333) / 2, 1)
    expect(svg.querySelector('[data-pose]')).toBeNull()
  })

  it('centres the aim mark on the plate and drops the size bracket', () => {
    const svg = plate()
    const circle = [...svg.querySelectorAll('[data-testid="disc"] circle')].at(-1)!
    // Windage 1 mil with direction -1 puts the mark 1 mil right of the centre; elevation 3 mil below it.
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(C + PX_PER_MIL, 1)
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(C + 3 * PX_PER_MIL, 1)
    expect(svg.querySelector('[data-testid="size-bracket"]')).toBeNull()
    expect(svg).toHaveTextContent('LEAD 1.0')
  })

  it('mirrors the windage hold with the direction', () => {
    const left = Number([...plate({ direction: 1 }).querySelectorAll('[data-testid="disc"] circle')].at(-1)!.getAttribute('cx'))
    expect(left).toBeCloseTo(C - PX_PER_MIL, 1)
  })

  it('keeps the off-view state when the hold is far outside the view', () => {
    const svg = plate({ distanceM: 1500, holdover: 37, lead: 2 })
    expect(svg.querySelector('.off-view')).not.toBeNull()
    expect(svg.querySelectorAll('ellipse')).toHaveLength(0)
  })

  it('leaves the soldier alone without a target', () => {
    const svg = draw()
    expect(svg.querySelector('[data-testid="disc"]')).toBeNull()
    expect(svg.querySelector('[data-testid="size-bracket"]')).not.toBeNull()
  })
})
