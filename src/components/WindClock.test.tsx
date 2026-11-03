import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WindClock, hourAt } from './WindClock'

afterEach(cleanup)

const clock = (value: number) => {
  const onChange = vi.fn()
  const { container } = render(<WindClock label="Wind from" value={value} onChange={onChange} speedMs={4} valueText={`${value} o'clock, 4 m/s`} />)
  return { onChange, container, dial: screen.getByRole('slider', { name: 'Wind from' }) }
}

describe('WindClock', () => {
  it('is one slider with the hour and speed as its value', () => {
    const { dial } = clock(9)
    expect(dial).toHaveAttribute('aria-valuemin', '1')
    expect(dial).toHaveAttribute('aria-valuemax', '12')
    expect(dial).toHaveAttribute('aria-valuenow', '9')
    expect(dial).toHaveAttribute('aria-valuetext', "9 o'clock, 4 m/s")
    expect(dial).toHaveAttribute('tabindex', '0')
  })

  it('has twelve positions', () => {
    const { container } = clock(12)
    expect(container.querySelectorAll('[data-hour]')).toHaveLength(12)
  })

  it('maps an offset from the centre to an hour, 12 at the top, clockwise', () => {
    const a = (100 * Math.PI) / 180
    expect(hourAt(Math.sin(a), -Math.cos(a))).toBe(3)
    expect(hourAt(0, -1)).toBe(12)
    expect(hourAt(-1, 0)).toBe(9)
    expect(hourAt(0, 1)).toBe(6)
  })

  describe('pointer', () => {
    const polar = (deg: number, r: number) => {
      const a = (deg * Math.PI) / 180
      return { clientX: 50 + r * Math.sin(a), clientY: 50 - r * Math.cos(a) }
    }
    const stubbed = () => {
      const c = clock(12)
      c.dial.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
      return c
    }

    it('takes a press anywhere on the dial away from the centre', () => {
      const { dial, onChange } = stubbed()
      fireEvent.pointerDown(dial, { pointerId: 1, ...polar(100, 40) })
      expect(onChange).toHaveBeenCalledWith(3)
    })

    it('follows a drag live, once per hour', () => {
      const { dial, onChange } = stubbed()
      fireEvent.pointerDown(dial, { pointerId: 1, ...polar(60, 40) })
      fireEvent.pointerMove(dial, { pointerId: 1, ...polar(62, 40) })
      fireEvent.pointerMove(dial, { pointerId: 1, ...polar(90, 40) })
      fireEvent.pointerMove(dial, { pointerId: 1, ...polar(92, 40) })
      fireEvent.pointerMove(dial, { pointerId: 1, ...polar(120, 40) })
      expect(onChange.mock.calls.map((c) => c[0])).toEqual([2, 3, 4])
      fireEvent.pointerUp(dial, { pointerId: 1 })
      fireEvent.pointerMove(dial, { pointerId: 1, ...polar(150, 40) })
      expect(onChange).toHaveBeenCalledTimes(3)
    })

    it('does nothing in the dead zone at the centre', () => {
      const { dial, onChange } = stubbed()
      fireEvent.pointerDown(dial, { pointerId: 1, clientX: 52, clientY: 52 })
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  it('steps the hour with the arrow keys, wrapping 12 and 1', () => {
    const a = clock(2)
    fireEvent.keyDown(a.dial, { key: 'ArrowRight' })
    expect(a.onChange).toHaveBeenLastCalledWith(3)
    fireEvent.keyDown(a.dial, { key: 'ArrowUp' })
    expect(a.onChange).toHaveBeenLastCalledWith(3)
    cleanup()
    const b = clock(12)
    fireEvent.keyDown(b.dial, { key: 'ArrowRight' })
    expect(b.onChange).toHaveBeenLastCalledWith(1)
    cleanup()
    const c = clock(1)
    fireEvent.keyDown(c.dial, { key: 'ArrowLeft' })
    expect(c.onChange).toHaveBeenLastCalledWith(12)
    fireEvent.keyDown(c.dial, { key: 'ArrowDown' })
    expect(c.onChange).toHaveBeenLastCalledWith(12)
  })

  it('draws the arrow from the chosen hour toward the centre', () => {
    const { container } = clock(9)
    const arrow = container.querySelector('[data-testid="wind-arrow"]')!
    // From the left of the dial (x < 50) toward its centre.
    expect(Number(arrow.getAttribute('data-x1'))).toBeLessThan(50)
    expect(Number(arrow.getAttribute('data-x2'))).toBeGreaterThan(Number(arrow.getAttribute('data-x1')))
  })

  it('starts the arrow inside the ring of hours, so the chosen hour stays readable', () => {
    const { container } = clock(9)
    const arrow = container.querySelector('[data-testid="wind-arrow"]')!
    // The hours sit on radius 38 around 50 50; at 9 the label is at x = 12.
    expect(Number(arrow.getAttribute('data-x1'))).toBeGreaterThan(12 + 5)
  })

  it('writes the speed’s unit under it in the hub, so it doesn’t read as an hour', () => {
    render(<WindClock label="Wind from" value={9} onChange={() => {}} speedMs={3} unit="m/s" valueText="9 o'clock, 3 m/s" />)
    const hub = screen.getByRole('slider').querySelector('.wind-clock-speed')!
    expect(hub.textContent).toBe('3m/s')
  })

  it.each([[3, 'left'], [9, 'right'], [12, 'down'], [6, 'up']])('points the arrowhead toward the centre at hour %i (%s)', (hour, dir) => {
    const { container } = clock(hour)
    const head = container.querySelector('[data-testid="wind-head"]')!
    const m = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(head.getAttribute('transform')!)!
    // The unrotated head points down (+y); rotate() turns it clockwise on screen.
    const a = (Number(m[3]) * Math.PI) / 180
    const [dx, dy] = [-Math.sin(a), Math.cos(a)]
    const want = { left: [-1, 0], right: [1, 0], down: [0, 1], up: [0, -1] }[dir as 'left']
    expect(dx).toBeCloseTo(want[0], 5)
    expect(dy).toBeCloseTo(want[1], 5)
    // And it sits on the side the wind comes from, so that direction runs toward the hub at 50 50.
    if (Math.abs(dx) > 0.5) expect(Math.sign(50 - Number(m[1]))).toBe(Math.sign(dx))
    else expect(Math.sign(50 - Number(m[2]))).toBe(Math.sign(dy))
  })
})
