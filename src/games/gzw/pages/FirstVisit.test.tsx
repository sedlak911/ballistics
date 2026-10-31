import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { byName, gzw } from '../data'

vi.mock('../ocr/recognize', () => ({ recognize: vi.fn(async () => ['M4A1 5.56x45mm', 'M855 5.56']) }))

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('First visit', () => {
  it('starts from a screenshot too', async () => {
    localStorage.removeItem('gb.gzw.profile')
    const item = { types: ['image/png'], getType: async () => new Blob(['x'], { type: 'image/png' }) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: vi.fn(async () => [item]) } })
    window.location.hash = '#/gzw/workbench'
    render(<App />)
    const first = screen.getByRole('region', { name: 'First, your weapon' })
    fireEvent.click(within(first).getByRole('button', { name: 'Import from clipboard (Ctrl+V)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use' }))
    expect(screen.queryByRole('region', { name: 'First, your weapon' })).not.toBeInTheDocument()
    expect(new URLSearchParams(window.location.hash.split('?')[1]).get('w')).toBe(byName(gzw.weapons, 'M4A1')!.id)
    expect(localStorage.getItem('gb.gzw.profile')).toContain('"setupDone":true')
  })
})
