import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChipGroup } from './ChipGroup'
import { ListPicker, type PickerItem } from './ListPicker'
import { Stepper } from './Stepper'

afterEach(cleanup)

const items = (n: number): PickerItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i}`, label: i === 3 ? 'MICH TC-2002' : `Helmet ${i}`, meta: `${i} MOA`, tag: i === 5 ? 'IIIA+' : undefined }))

describe('ChipGroup', () => {
  it('marks the chosen chip and reports a click', () => {
    const onChange = vi.fn()
    render(<ChipGroup label="Pick" value="b" onChange={onChange}
      options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} />)
    const group = screen.getByRole('group', { name: 'Pick' })
    const pressed = within(group).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed.map((b) => b.textContent)).toEqual(['B'])
    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })
})

describe('ListPicker', () => {
  const picker = (n: number, onChange = vi.fn(), value: string | null = null) =>
    render(<ListPicker label="Helmet" items={items(n)} value={value} onChange={onChange} filterLabel="Filter" noMatch="No match" />)

  it('scrolls only its own list to the chosen row, never the page', () => {
    const pageScroll = vi.fn()
    Element.prototype.scrollIntoView = pageScroll
    picker(20, vi.fn(), 'id15')
    expect(pageScroll).not.toHaveBeenCalled()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('shows no filter for ten items or fewer', () => {
    picker(6)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Helmet' })).getAllByRole('button')).toHaveLength(6)
  })

  it('filters long lists and says when nothing matches', () => {
    picker(12)
    const rows = () => within(screen.getByRole('group', { name: 'Helmet' })).queryAllByRole('button')
    const filter = screen.getByRole('searchbox', { name: 'Filter' })
    fireEvent.change(filter, { target: { value: 'mich' } })
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('MICH TC-2002')])
    fireEvent.change(filter, { target: { value: 'iiia+' } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(filter, { target: { value: '7 moa' } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(filter, { target: { value: 'zzz' } })
    expect(rows()).toHaveLength(0)
    expect(screen.getByText('No match')).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: '' } })
    expect(rows()).toHaveLength(12)
  })

  it('reports the clicked row and marks the selected one', () => {
    const onChange = vi.fn()
    picker(8, onChange, 'id5')
    const selected = screen.getByRole('button', { pressed: true })
    expect(selected).toHaveTextContent('Helmet 5')
    expect(selected).toHaveTextContent('IIIA+')
    fireEvent.click(screen.getByRole('button', { name: /Helmet 2/ }))
    expect(onChange).toHaveBeenCalledWith('id2')
  })
})

describe('Stepper', () => {
  const stepper = (value: number, onChange = vi.fn()) =>
    render(<Stepper label="Zero" value={value} min={25} max={600} step={25} format={(v) => `${v} m`} onChange={onChange}
      decLabel="Zero: less" incLabel="Zero: more" />)

  it('moves by its step and shows the formatted value', () => {
    const onChange = vi.fn()
    stepper(100, onChange)
    expect(within(screen.getByRole('group', { name: 'Zero' })).getByRole('status')).toHaveTextContent('100 m')
    fireEvent.click(screen.getByRole('button', { name: 'Zero: more' }))
    expect(onChange).toHaveBeenLastCalledWith(125)
    fireEvent.click(screen.getByRole('button', { name: 'Zero: less' }))
    expect(onChange).toHaveBeenLastCalledWith(75)
  })

  it('shows not set as —, flagged, and its first press of either button gives the start', () => {
    const onChange = vi.fn()
    render(<Stepper label="Zero" value={null} start={100} min={25} max={600} step={25} format={(v) => `${v} m`} onChange={onChange}
      decLabel="Zero: less" incLabel="Zero: more" invalid invalidText="Set the zero" />)
    const group = screen.getByRole('group', { name: 'Zero' })
    expect(within(group).getByRole('status')).toHaveTextContent(/^—$/)
    // In the placeholder colour, so it doesn't read as a third `−`.
    expect(within(group).getByRole('status')).toHaveClass('unset')
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('Set the zero')
    expect(screen.getByRole('alert')).toHaveTextContent('Set the zero')
    fireEvent.click(screen.getByRole('button', { name: 'Zero: less' }))
    expect(onChange).toHaveBeenLastCalledWith(100)
    fireEvent.click(screen.getByRole('button', { name: 'Zero: more' }))
    expect(onChange).toHaveBeenLastCalledWith(100)
  })

  it('flags nothing unless asked', () => {
    stepper(100)
    expect(screen.getByRole('group', { name: 'Zero' })).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stops at the bounds', () => {
    stepper(600)
    expect(screen.getByRole('button', { name: 'Zero: more' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zero: less' })).toBeEnabled()
    cleanup()
    stepper(25)
    expect(screen.getByRole('button', { name: 'Zero: less' })).toBeDisabled()
  })
})
