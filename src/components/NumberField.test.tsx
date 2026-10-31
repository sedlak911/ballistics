import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'

afterEach(cleanup)

const field = (p: Partial<Parameters<typeof NumberField>[0]> = {}) => {
  const onChange = vi.fn()
  render(<NumberField label="Distance" value={300} unit="m" min={1} max={2500} onChange={onChange} invalidText="Enter 1–2500" {...p} />)
  return { onChange, input: screen.getByLabelText('Distance') as HTMLInputElement }
}
const type = (input: HTMLInputElement, text: string) => fireEvent.change(input, { target: { value: text } })

describe('NumberField', () => {
  it('is a decimal text input showing the value and its unit', () => {
    const { input } = field()
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input.value).toBe('300')
    expect(screen.getByText('m')).toBeInTheDocument()
  })

  it('accepts a comma as the decimal mark and commits on blur', () => {
    const { input, onChange } = field()
    type(input, '1,5')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(1.5)
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('commits on Enter and accepts a point', () => {
    const { input, onChange } = field()
    type(input, '450.5')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(450.5)
  })

  it.each(['abc', '', '5000', '0', '1e2', '1,2,3'])('rejects %j, keeps the old value and says why', (bad) => {
    const { input, onChange } = field()
    type(input, bad)
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const text = screen.getByText('Enter 1–2500')
    expect(input.getAttribute('aria-describedby')).toBe(text.id)
    // The bad text stays beside the error until it is corrected.
    expect(input.value).toBe(bad)
  })

  it('enforces the minimum strictly and the maximum inclusively', () => {
    const a = field({ min: 0.5 })
    type(a.input, '0.4')
    fireEvent.blur(a.input)
    expect(a.onChange).not.toHaveBeenCalled()
    type(a.input, '0.5')
    fireEvent.blur(a.input)
    expect(a.onChange).toHaveBeenCalledWith(0.5)
    cleanup()
    const b = field()
    type(b.input, '2500')
    fireEvent.blur(b.input)
    expect(b.onChange).toHaveBeenCalledWith(2500)
  })

  it('clears the error once the text is corrected', () => {
    const { input, onChange } = field()
    type(input, 'abc')
    fireEvent.blur(input)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    type(input, '200')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(200)
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('Enter 1–2500')).toBeNull()
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('shows a new value from outside, dropping a stale error', () => {
    const onChange = vi.fn()
    const props = { label: 'Distance', unit: 'm', min: 1, max: 2500, onChange, invalidText: 'bad' }
    const { rerender } = render(<NumberField {...props} value={300} />)
    const input = screen.getByLabelText('Distance') as HTMLInputElement
    type(input, 'abc')
    fireEvent.blur(input)
    rerender(<NumberField {...props} value={1200} />)
    expect(input.value).toBe('1200')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('switches the unit with a segmented control beside it', () => {
    const onUnit = vi.fn()
    field({ units: ['m', 'yd'], onUnit })
    fireEvent.click(screen.getByRole('button', { name: 'yd' }))
    expect(onUnit).toHaveBeenCalledWith('yd')
    expect(screen.getByRole('button', { name: 'm' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('steps with the arrow keys within the bounds', () => {
    const { input, onChange } = field({ step: 10, max: 305 })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(305)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // The parent has not moved `value`, so the second step starts from the 305 now in the box.
    expect(onChange).toHaveBeenLastCalledWith(295)
  })

  it('shows an empty box for a missing value; leaving it empty stores nothing and is not an error', () => {
    const { input, onChange } = field({ value: null, placeholder: 'unknown' })
    expect(input.value).toBe('')
    expect(input).toHaveAttribute('placeholder', 'unknown')
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    type(input, '12')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(12)
  })

  it('with onClear, emptying the box clears the value instead of calling it invalid', () => {
    const onClear = vi.fn()
    const { input, onChange } = field({ onClear })
    type(input, '')
    fireEvent.blur(input)
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('needs a value: empty and flagged until a valid one is typed, even one equal to the old value', () => {
    const { input, onChange } = field({ value: 3, needed: true })
    expect(input.value).toBe('')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter 1–2500')
    type(input, '3')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
