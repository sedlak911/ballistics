import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PHONE } from './components/useMedia'

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App shell', () => {
  it('marks the page with the game, so its palette applies', () => {
    open('#/gzw/workbench')
    expect(document.documentElement.dataset.game).toBe('gzw')
    cleanup()
    open('#/wardogs/workbench')
    expect(document.documentElement.dataset.game).toBe('wardogs')
  })

  it('keeps language and units behind ⚙', () => {
    open('#/gzw/workbench')
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument()
    const gear = screen.getByRole('button', { name: 'Settings' })
    expect(gear).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(gear)
    const sheet = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(sheet).getByRole('group', { name: 'Language' })).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Units' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('keeps the site info behind ⓘ: the data credits and the fan-project note', () => {
    open('#/gzw/workbench')
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    const sheet = screen.getByRole('dialog', { name: 'About this site' })
    expect(sheet).toHaveTextContent('Unofficial fan project, not affiliated with MADFINGER Games or BULKHEAD.')
    expect(sheet).toHaveTextContent('The game’s own numbers may differ.')
    expect(sheet.querySelector('a[href="https://gzw-data.dev"]')).not.toBeNull()
    expect(sheet.querySelector('a[href*="fandom.com"]')).not.toBeNull()
  })

  it('opens one sheet at a time', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'About this site' })).not.toBeInTheDocument()
  })

  it('lists REAL first, then GZW by its full name, then WARDOGS', () => {
    open('#/gzw/workbench')
    const nav = screen.getByRole('navigation', { name: 'Game' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['REAL', 'Gray Zone Warfare', 'WARDOGS' + 'soon'])
  })

  it('shows GZW under its short name on a phone', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
    open('#/gzw/workbench')
    const nav = screen.getByRole('navigation', { name: 'Game' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['REAL', 'GZW', 'WARDOGS' + 'soon'])
  })

  it('opens REAL on a bare URL and GZW on its own route', () => {
    open('')
    expect(document.documentElement.dataset.game).toBe('real')
    cleanup()
    open('#/gzw/workbench?w=m700')
    expect(document.documentElement.dataset.game).toBe('gzw')
  })

  it('shows REAL its own credits in ⓘ without a game patch, in both languages', () => {
    open('')
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    const sheet = screen.getByRole('dialog', { name: 'About this site' })
    expect(sheet).not.toHaveTextContent('game ?')
    expect(sheet).toHaveTextContent('Built 2026-10-31')
    expect(sheet.querySelector('a[href*="lapua.com"]')).not.toBeNull()
    cleanup()
    open('#/real/workbench?l=cs')
    fireEvent.click(screen.getByRole('button', { name: 'O webu' }))
    const cs = screen.getByRole('dialog', { name: 'O webu' })
    expect(cs).not.toHaveTextContent('hra ?')
    expect(cs).toHaveTextContent('Sestaveno 2026-10-31')
    expect(cs.querySelector('a[href*="lapua.com"]')).not.toBeNull()
  })

  // M3: a page about real rifles has no game to disclaim; it says how far to trust its estimates instead.
  it('gives REAL its own note in ⓘ, not the game ones, in both languages', () => {
    open('')
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    const sheet = screen.getByRole('dialog', { name: 'About this site' })
    expect(sheet).toHaveTextContent('Estimates from physics and published data. Check them on paper before relying on them.')
    expect(sheet).not.toHaveTextContent(/MADFINGER|BULKHEAD|game/)
    cleanup()
    open('#/real/workbench?l=cs')
    fireEvent.click(screen.getByRole('button', { name: 'O webu' }))
    const cs = screen.getByRole('dialog', { name: 'O webu' })
    expect(cs).toHaveTextContent('Odhady z fyziky a zveřejněných údajů. Než se na ně spolehneš, ověř je střelbou na papírový terč.')
    expect(cs).not.toHaveTextContent(/MADFINGER|BULKHEAD|Hra/)
  })
})
