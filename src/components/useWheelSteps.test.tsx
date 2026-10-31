import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWheelSteps } from './useWheelSteps'

function Harness({ onSteps }: { onSteps: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useWheelSteps(ref, onSteps)
  return <div ref={ref} data-testid="area" />
}

afterEach(cleanup)

describe('useWheelSteps', () => {
  it('turns wheel travel into whole steps, up = more, keeping the remainder', () => {
    const onSteps = vi.fn()
    render(<Harness onSteps={onSteps} />)
    const area = screen.getByTestId('area')
    fireEvent.wheel(area, { deltaY: -100 })
    expect(onSteps).toHaveBeenLastCalledWith(10)
    fireEvent.wheel(area, { deltaY: 3 })
    fireEvent.wheel(area, { deltaY: 3 })
    expect(onSteps).toHaveBeenCalledTimes(1)
    fireEvent.wheel(area, { deltaY: 4 })
    expect(onSteps).toHaveBeenLastCalledWith(-1)
  })

  it('reads line and page deltas as pixels', () => {
    const onSteps = vi.fn()
    render(<Harness onSteps={onSteps} />)
    fireEvent.wheel(screen.getByTestId('area'), { deltaY: -3, deltaMode: 1 })
    expect(onSteps).toHaveBeenLastCalledWith(4)
  })

  it('leaves Ctrl and ⌘ + wheel to the browser zoom', () => {
    const onSteps = vi.fn()
    render(<Harness onSteps={onSteps} />)
    const area = screen.getByTestId('area')
    expect(fireEvent.wheel(area, { deltaY: -100, ctrlKey: true })).toBe(true)
    fireEvent.wheel(area, { deltaY: -100, metaKey: true })
    expect(onSteps).not.toHaveBeenCalled()
    expect(fireEvent.wheel(area, { deltaY: -100 })).toBe(false)
  })
})
