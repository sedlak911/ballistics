import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../i18n'
import type { T } from '../i18n'
import { ResetRow } from './ResetRow'

const t: T = (key, vars) => translate('en', key, vars)

afterEach(cleanup)

const KEEPS = 'Your own rifles, rounds and scopes stay; changes to the built-in ones go.'
const resetButton = () => screen.getByRole('button', { name: '↺ Reset everything to defaults' })

describe('ResetRow', () => {
  it('rests as one quiet text button', () => {
    const { container } = render(<ResetRow t={t} onReset={vi.fn()} />)
    expect(container.firstElementChild).toHaveClass('reset-row')
    expect(container.firstElementChild).not.toHaveClass('is-asking')
    expect(resetButton()).toBeInTheDocument()
    expect(screen.queryByText('Reset everything?')).toBeNull()
    expect(screen.queryByText(KEEPS)).toBeNull()
  })

  it('a tap asks in place, with the focus on No', () => {
    render(<ResetRow t={t} onReset={vi.fn()} />)
    fireEvent.click(resetButton())
    const group = screen.getByRole('group', { name: 'Reset everything?' })
    expect(group).toHaveClass('reset-row', 'is-asking')
    expect(screen.getByText('Reset everything?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('btn', 'ghost', 'reset-yes')
    const no = screen.getByRole('button', { name: 'No' })
    expect(no).toHaveClass('btn', 'ghost')
    expect(screen.getByText(KEEPS)).toHaveClass('reset-keeps')
    expect(document.activeElement).toBe(no)
    expect(screen.queryByRole('button', { name: '↺ Reset everything to defaults' })).toBeNull()
  })

  it('asking brings the keep line into view, in a sheet that scrolls on a short phone', () => {
    const scrollIntoView = vi.fn()
    const was = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      render(<ResetRow t={t} onReset={vi.fn()} />)
      fireEvent.click(resetButton())
      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' })
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByText(KEEPS))
    } finally {
      if (was) Object.defineProperty(Element.prototype, 'scrollIntoView', was)
      else delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it('No goes back, with the focus on the reset button', () => {
    const onReset = vi.fn()
    render(<ResetRow t={t} onReset={onReset} />)
    fireEvent.click(resetButton())
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByRole('group', { name: 'Reset everything?' })).toBeNull()
    expect(screen.queryByText(KEEPS)).toBeNull()
    expect(document.activeElement).toBe(resetButton())
    expect(onReset).not.toHaveBeenCalled()
  })

  it('Escape goes back and stays in the row, so the sheet stays open', () => {
    const onKey = vi.fn()
    window.addEventListener('keydown', onKey)
    try {
      render(<ResetRow t={t} onReset={vi.fn()} />)
      fireEvent.click(resetButton())
      fireEvent.keyDown(screen.getByRole('button', { name: 'Yes' }), { key: 'Escape' })
      expect(screen.queryByRole('group', { name: 'Reset everything?' })).toBeNull()
      expect(document.activeElement).toBe(resetButton())
      expect(onKey).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onKey)
    }
  })

  it('other keys in the asking row pass', () => {
    const onKey = vi.fn()
    window.addEventListener('keydown', onKey)
    try {
      render(<ResetRow t={t} onReset={vi.fn()} />)
      fireEvent.click(resetButton())
      fireEvent.keyDown(screen.getByRole('button', { name: 'Yes' }), { key: 'Tab' })
      expect(screen.getByRole('group', { name: 'Reset everything?' })).toBeInTheDocument()
      expect(onKey).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', onKey)
    }
  })

  it('Yes resets, once', () => {
    const onReset = vi.fn()
    render(<ResetRow t={t} onReset={onReset} />)
    fireEvent.click(resetButton())
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
