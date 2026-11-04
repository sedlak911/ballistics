import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Ruler } from './Ruler'

const latest = { current: 0 }

function Harness({ start = 600, min = 25, max = 2500, onChange, children }: {
  start?: number; min?: number; max?: number; onChange?: (v: number) => void; children?: ReactNode
}) {
  const [value, setValue] = useState(start)
  useEffect(() => { latest.current = value })
  return <Ruler value={value} min={min} max={max} step={10} pxPerStep={6} labelEvery={100} onChange={(v) => { setValue(v); onChange?.(v) }}>{children}</Ruler>
}

const ruler = () => document.querySelector<HTMLElement>('.ruler')!
const scale = () => document.querySelector<HTMLElement>('.ruler-scale')!
const press = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', el: Element, x: number) =>
  fireEvent[type](el, { pointerId: 1, clientX: x, clientY: 0 })
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
  it('its scale is hidden from assistive technology, what it holds is not', () => {
    render(<Harness><input aria-label="Figure" /></Harness>)
    expect(scale()).toHaveAttribute('aria-hidden', 'true')
    expect(ruler()).not.toHaveAttribute('aria-hidden')
    expect(screen.getByRole('textbox', { name: 'Figure' })).toBeInTheDocument()
  })

  it('draws what it holds above the scale, and a drag that starts there moves the value', () => {
    render(<Harness><output className="figure">600</output></Harness>)
    const figure = document.querySelector<HTMLElement>('.figure')!
    expect(figure.compareDocumentPosition(scale()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    press('pointerDown', figure, 200)
    press('pointerMove', figure, 140)
    press('pointerUp', figure, 140)
    expect(latest.current).toBe(700)
  })

  // A touch is captured by the element it pressed; when the ruler takes the capture at the lock, that element loses it,
  // and its lostpointercapture bubbles up here (0.1.8 ended the drag on it: one step, or none, per swipe).
  it('a lost capture from inside, handed to the ruler at the lock, does not end the drag', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const tick = ruler().querySelector('path')!
    press('pointerDown', tick, 200)
    press('pointerMove', tick, 190)
    fireEvent.lostPointerCapture(tick, { pointerId: 1 })
    pointer('pointerMove', 140)
    pointer('pointerUp', 140)
    expect(latest.current).toBe(700)
    expect(onChange).toHaveBeenLastCalledWith(700)
  })

  it('a drag takes the focus from a field inside, and the mousedown of its press does not give it back', () => {
    render(<Harness><input aria-label="Figure" /></Harness>)
    const input = screen.getByRole('textbox', { name: 'Figure' })
    input.focus()
    press('pointerDown', input, 200)
    press('pointerMove', input, 188)
    press('pointerUp', input, 188)
    expect(latest.current).toBe(620)
    expect(input).not.toHaveFocus()
    // The browser makes a tap of a swipe within its slop: its mousedown would focus the field again.
    expect(fireEvent.mouseDown(input)).toBe(false)
  })

  it('a drag keeps the click of its press from activating what it pressed (a label would focus its field)', () => {
    render(<Harness><label htmlFor="figure">Word</label><input id="figure" /></Harness>)
    const word = screen.getByText('Word')
    press('pointerDown', word, 200)
    press('pointerMove', word, 188)
    press('pointerUp', word, 188)
    expect(fireEvent.click(word)).toBe(false)
    press('pointerDown', word, 200)
    press('pointerUp', word, 200)
    expect(fireEvent.click(word)).toBe(true)
  })

  it('a press without a drag leaves its mousedown to focus a field inside', () => {
    render(<Harness><input aria-label="Figure" /></Harness>)
    const input = screen.getByRole('textbox', { name: 'Figure' })
    press('pointerDown', input, 200)
    press('pointerMove', input, 188)
    press('pointerUp', input, 188)
    press('pointerDown', input, 200)
    press('pointerMove', input, 197)
    press('pointerUp', input, 197)
    expect(fireEvent.mouseDown(input)).toBe(true)
    expect(latest.current).toBe(620)
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
    expect(scale().querySelector('g')).toHaveAttribute('transform', 'translate(-6 0)')
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

  it('a tap that stops a coast is part of the drag: it does not focus the field inside', () => {
    render(<Harness><input aria-label="Figure" /></Harness>)
    const input = screen.getByRole('textbox', { name: 'Figure' })
    press('pointerDown', input, 300)
    vi.advanceTimersByTime(16)
    press('pointerMove', input, 250)
    act(() => { vi.advanceTimersByTime(100) })
    press('pointerMove', input, 200)
    press('pointerUp', input, 200)
    act(() => { vi.advanceTimersByTime(100) })
    press('pointerDown', input, 200)
    const held = latest.current
    press('pointerUp', input, 200)
    expect(fireEvent.mouseDown(input)).toBe(false)
    expect(fireEvent.click(input)).toBe(false)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(latest.current).toBe(held)
  })

  it('an arcing swipe (up to 2:1 up or down) drags, a steeper one does not', () => {
    render(<Harness />)
    pointer('pointerDown', 200, 100)
    pointer('pointerMove', 180, 135)
    pointer('pointerUp', 180, 135)
    expect(latest.current).toBe(630)
    pointer('pointerDown', 200, 100)
    pointer('pointerMove', 190, 130)
    pointer('pointerMove', 100, 135)
    pointer('pointerUp', 100, 135)
    expect(latest.current).toBe(630)
  })

  it('swallows only the click that follows a drag: a later click without a press goes through', () => {
    render(<Harness><label htmlFor="figure">Word</label><input id="figure" /></Harness>)
    const word = screen.getByText('Word')
    press('pointerDown', word, 200)
    press('pointerMove', word, 188)
    press('pointerUp', word, 188)
    expect(fireEvent.click(word)).toBe(false)
    expect(fireEvent.click(word)).toBe(true)
  })
})
