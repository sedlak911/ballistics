import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

afterEach(cleanup)

const props = { label: 'Name', maxLength: 40, invalidText: 'Give it a name' }
const type = (input: HTMLElement, text: string) => fireEvent.change(input, { target: { value: text } })

describe('TextField', () => {
  it('commits on blur, refuses empty when required, cuts nothing silently', () => {
    const onChange = vi.fn()
    const { rerender } = render(<TextField {...props} required value="Steyr" onChange={onChange} />)
    const input = screen.getByLabelText('Name') as HTMLInputElement
    expect(input).toHaveAttribute('type', 'text')
    expect(input.value).toBe('Steyr')
    // The browser holds the typing at 40 characters; nothing is cut afterwards.
    expect(input).toHaveAttribute('maxLength', '40')

    type(input, '  Steyr SSG 08 ')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('Steyr SSG 08')
    expect(input).toHaveAttribute('aria-invalid', 'false')

    type(input, '   ')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a name')
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    // The bad text stays beside the error until it is corrected.
    expect(input.value).toBe('   ')

    const forty = 'x'.repeat(40)
    type(input, forty)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(forty)
    expect(input).toHaveAttribute('aria-invalid', 'false')

    // A longer value from storage shows whole, and leaving the box doesn't shorten it.
    const long = 'y'.repeat(45)
    rerender(<TextField {...props} required value={long} onChange={onChange} />)
    expect(input.value).toBe(long)
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('shows a needed field flagged at once, and keeps the flag until a value comes', () => {
    const onChange = vi.fn()
    const { rerender } = render(<TextField {...props} required value="" onChange={onChange} />)
    const input = screen.getByLabelText('Name')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    rerender(<TextField {...props} required needed value="" onChange={onChange} />)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a name')
    // Passing through it leaves it flagged.
    fireEvent.blur(input)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
    rerender(<TextField {...props} required value="Steyr" onChange={onChange} />)
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).toHaveValue('Steyr')
  })

  it('may be left empty when not required, and marks its label', () => {
    const onChange = vi.fn()
    render(<TextField label="Calibre" maxLength={12} mark="optional" placeholder="not set" value=".338" onChange={onChange} />)
    const input = screen.getByLabelText('Calibre optional')
    expect(screen.getByText('optional')).toHaveClass('label-mark')
    expect(input).toHaveAttribute('placeholder', 'not set')
    type(input, '')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })
})
