import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useMemo, useState } from 'react'
import { Toast, ToastSlot, type ToastInput } from './Toast'
import { ToastSlotContext } from './toastSlot'
import { useToast } from './useToast'

let showIt: (t: ToastInput) => void = () => {}
let openSheet: (open: boolean) => void = () => {}

/** A page with its toast and, while open, a modal sheet that holds the toast's slot (as App and RealSettings do). */
function Harness() {
  const { toast, show, close } = useToast()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ slot, setSlot }), [slot])
  useEffect(() => { showIt = show }, [show])
  useEffect(() => { openSheet = setOpen }, [])
  return (
    <ToastSlotContext.Provider value={value}>
      {open && (
        <div role="dialog" aria-label="Sheet" aria-modal="true" tabIndex={-1}>
          <button type="button">In the sheet</button>
          <ToastSlot />
        </div>
      )}
      <Toast toast={toast} onClose={close} closeLabel="Close" />
    </ToastSlotContext.Provider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  render(<Harness />)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows its text in a status region', () => {
    act(() => showIt({ text: 'Round reset to the preset' }))
    expect(screen.getByRole('status').textContent).toContain('Round reset to the preset')
  })

  it('runs its action and closes', () => {
    const run = vi.fn()
    act(() => showIt({ text: 'x', action: { label: 'Undo', run } }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('closes itself after 6 s by default', () => {
    act(() => showIt({ text: 'x' }))
    act(() => { vi.advanceTimersByTime(5999) })
    expect(screen.queryByRole('status')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays with a close ✕ when it has no duration', () => {
    act(() => showIt({ text: 'x', durationMs: null }))
    act(() => { vi.advanceTimersByTime(60000) })
    expect(screen.queryByRole('status')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps a toast that its own action opens', () => {
    act(() => showIt({ text: 'x', action: { label: 'Undo', run: () => showIt({ text: 'Again' }) } }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Again')).toBeTruthy()
  })

  it('shows one at a time', () => {
    act(() => showIt({ text: 'first' }))
    act(() => showIt({ text: 'second' }))
    expect(screen.queryByText('first')).toBeNull()
    expect(screen.getByText('second')).toBeTruthy()
  })

  it('sits in the open sheet\'s slot, and goes back to the body when the sheet closes, without an error', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      act(() => openSheet(true))
      act(() => showIt({ text: 'In the sheet', action: { label: 'Undo', run: () => {} } }))
      const sheet = screen.getByRole('dialog', { name: 'Sheet' })
      expect(within(sheet).getByRole('status')).toHaveTextContent('In the sheet')
      expect(within(sheet).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      act(() => openSheet(false))
      expect(screen.getByRole('status').parentElement).toBe(document.body)
      expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
      // It keeps its own time: it still closes 6 s after it was shown.
      act(() => { vi.advanceTimersByTime(6000) })
      expect(screen.queryByRole('status')).toBeNull()
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('moves into a sheet that opens while it shows', () => {
    act(() => showIt({ text: 'x' }))
    act(() => openSheet(true))
    expect(within(screen.getByRole('dialog')).getByRole('status')).toBeInTheDocument()
  })

  it('gives the focus to the dialog around it when it goes while holding it: by its action, its ✕ or its time', () => {
    act(() => openSheet(true))
    const sheet = screen.getByRole('dialog')
    act(() => showIt({ text: 'x', action: { label: 'Undo', run: () => {} } }))
    within(sheet).getByRole('button', { name: 'Undo' }).focus()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Undo' }))
    expect(sheet).toHaveFocus()

    act(() => showIt({ text: 'x', durationMs: null }))
    within(sheet).getByRole('button', { name: 'Close' }).focus()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(sheet).toHaveFocus()

    act(() => showIt({ text: 'x', action: { label: 'Undo', run: () => {} } }))
    within(sheet).getByRole('button', { name: 'Undo' }).focus()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(screen.queryByRole('status')).toBeNull()
    expect(sheet).toHaveFocus()
  })

  it('leaves the focus where it is when it didn\'t hold it', () => {
    act(() => openSheet(true))
    const sheet = screen.getByRole('dialog')
    const other = within(sheet).getByRole('button', { name: 'In the sheet' })
    other.focus()
    act(() => showIt({ text: 'x', action: { label: 'Undo', run: () => {} } }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Undo' }))
    expect(other).toHaveFocus()
  })

  it('restarts the timer on a new toast', () => {
    act(() => showIt({ text: 'first' }))
    act(() => { vi.advanceTimersByTime(4000) })
    act(() => showIt({ text: 'second' }))
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('second')).not.toBeNull()
  })
})
