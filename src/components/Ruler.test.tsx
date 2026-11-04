import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Ruler } from './Ruler'

const latest = { current: 0 }

function Harness({ start = 600, min = 25, max = 2500, onChange }: { start?: number; min?: number; max?: number; onChange?: (v: number) => void }) {
  const [value, setValue] = useState(start)
  useEffect(() => { latest.current = value })
  return <Ruler value={value} min={min} max={max} step={10} pxPerStep={6} labelEvery={100} onChange={(v) => { setValue(v); onChange?.(v) }} />
}

const ruler = () => document.querySelector<HTMLElement>('.ruler')!
const pointer = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', x: number, y = 0) =>
  fireEvent[type](ruler(), { pointerId: 1, clientX: x, clientY: y })

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  reducedMotion(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Ruler', () => {
  it('is hidden from assistive technology', () => {
    render(<Harness />)
    expect(ruler()).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws a label every hundred', () => {
    render(<Harness />)
    const labels = [...ruler().querySelectorAll('.ruler-label')].map((n) => n.textContent)
    expect(labels).toContain('600')
    expect(labels).toContain('500')
  })

  it('a 60 px drag left is 10 steps up', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    pointer('pointerDown', 200)
    pointer('pointerMove', 140)
    pointer('pointerUp', 140)
    expect(latest.current).toBe(700)
    expect(onChange).toHaveBeenLastCalledWith(700)
  })

  it('a drag to the right goes down', () => {
    render(<Harness />)
    pointer('pointerDown', 100)
    pointer('pointerMove', 130)
    pointer('pointerUp', 130)
    expect(latest.current).toBe(550)
  })

  it('calls onChange once per new step', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    pointer('pointerDown', 200)
    for (const x of [190, 185, 180, 170, 160]) pointer('pointerMove', x)
    pointer('pointerUp', 160)
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([620, 630, 650, 670])
  })

  it('clamps at the bounds', () => {
    render(<Harness start={2450} />)
    pointer('pointerDown', 300)
    pointer('pointerMove', 0)
    pointer('pointerUp', 0)
    expect(latest.current).toBe(2500)
    pointer('pointerDown', 0)
    pointer('pointerMove', 300)
    pointer('pointerUp', 300)
    expect(latest.current).toBe(2500 - 500)
  })

  it('clamps at the lower bound', () => {
    render(<Harness start={50} min={25} />)
    pointer('pointerDown', 0)
    pointer('pointerMove', 300)
    pointer('pointerUp', 300)
    expect(latest.current).toBe(30)
  })

  it('a vertical swipe leaves the value', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    pointer('pointerDown', 200, 100)
    pointer('pointerMove', 190, 180)
    pointer('pointerMove', 100, 190)
    pointer('pointerUp', 100, 190)
    expect(onChange).not.toHaveBeenCalled()
    expect(latest.current).toBe(600)
  })

  it('needs 6 px sideways before it starts', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    pointer('pointerDown', 200)
    pointer('pointerMove', 196)
    pointer('pointerUp', 196)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('settles on a step', () => {
    render(<Harness />)
    pointer('pointerDown', 200)
    pointer('pointerMove', 137)
    vi.advanceTimersByTime(500)
    pointer('pointerUp', 137)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBe(710)
    // 63 px is 10.5 steps: at rest the scale sits on the step, not between two (700 is the label period, 10 px = 6 px).
    expect(ruler().querySelector('g')).toHaveAttribute('transform', 'translate(-6 0)')
  })

  it('coasts after a flick and settles on a step', () => {
    render(<Harness />)
    pointer('pointerDown', 300)
    vi.advanceTimersByTime(16)
    pointer('pointerMove', 250)
    vi.advanceTimersByTime(16)
    pointer('pointerMove', 200)
    pointer('pointerUp', 200)
    const atRelease = latest.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBeGreaterThan(atRelease)
    expect(latest.current % 10).toBe(0)
  })

  it('does not coast under reduced motion', () => {
    reducedMotion(true)
    render(<Harness />)
    pointer('pointerDown', 300)
    vi.advanceTimersByTime(16)
    pointer('pointerMove', 250)
    vi.advanceTimersByTime(16)
    pointer('pointerMove', 200)
    pointer('pointerUp', 200)
    const atRelease = latest.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBe(atRelease)
  })

  it('a touch cancelled by the browser (a scroll took over) leaves the value', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    pointer('pointerDown', 200)
    fireEvent.pointerCancel(ruler(), { pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  const flick = () => {
    pointer('pointerDown', 300)
    vi.advanceTimersByTime(16)
    pointer('pointerMove', 250)
    vi.advanceTimersByTime(16)
    pointer('pointerMove', 200)
  }

  it('caps a flick at about 55 steps', () => {
    render(<Harness />)
    pointer('pointerDown', 300)
    vi.advanceTimersByTime(1)
    pointer('pointerMove', 240)
    pointer('pointerUp', 240)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(latest.current).toBeGreaterThan(710)
    expect(latest.current).toBeLessThanOrEqual(700 + 570)
  })

  it('a touch cancelled after the lock settles without coasting', () => {
    render(<Harness />)
    flick()
    fireEvent.pointerCancel(ruler(), { pointerId: 1 })
    const atCancel = latest.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBe(atCancel)
  })

  it('a lost pointer capture settles without coasting', () => {
    render(<Harness />)
    flick()
    fireEvent.lostPointerCapture(ruler(), { pointerId: 1 })
    const atLoss = latest.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBe(atLoss)
  })

  it('stops coasting when it unmounts', () => {
    const onChange = vi.fn()
    const { unmount } = render(<Harness onChange={onChange} />)
    flick()
    pointer('pointerUp', 200)
    act(() => { vi.advanceTimersByTime(100) })
    unmount()
    const calls = onChange.mock.calls.length
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onChange.mock.calls.length).toBe(calls)
  })

  it('a new press stops a coast', () => {
    render(<Harness />)
    flick()
    pointer('pointerUp', 200)
    act(() => { vi.advanceTimersByTime(100) })
    pointer('pointerDown', 200)
    const held = latest.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBe(held)
  })
})
