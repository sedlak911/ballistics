import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallNote } from './InstallNote'
import { PHONE } from './useMedia'
import { en } from '../i18n/en'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
const t = (key: keyof typeof en) => en[key]

function media(phone: boolean, standalone = false) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === PHONE ? phone : q === '(display-mode: standalone)' ? standalone : false,
    media: q, addEventListener: () => {}, removeEventListener: () => {},
  }))
}

afterEach(() => {
  cleanup()
  window.dispatchEvent(new Event('appinstalled'))
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('InstallNote', () => {
  it("shows once on a phone's first visit", () => {
    media(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    const { unmount } = render(<InstallNote t={t} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Add Ballistics to your home screen')
    expect(status).toHaveTextContent('In Safari, tap Share (under ••• on iOS 26), then Add to Home Screen.')
    expect(status).toHaveTextContent(en['install.own'])
    expect(localStorage.getItem('gb.install')).toBe('{"noteShown":true}')
    unmount()
    render(<InstallNote t={t} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a desktop visit leaves the one showing', () => {
    media(false)
    render(<InstallNote t={t} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem('gb.install')).toBeNull()
  })

  it('never from the home screen', () => {
    media(true, true)
    render(<InstallNote t={t} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem('gb.install')).toBeNull()
  })

  it('StrictMode still shows it', () => {
    media(true)
    render(<StrictMode><InstallNote t={t} /></StrictMode>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('closes with its ✕', () => {
    media(true)
    render(<InstallNote t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('Android gets the steps, and the button only when offered', () => {
    media(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(PIXEL)
    render(<InstallNote t={t} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(en['install.android'])
    expect(status).toHaveTextContent('In Chrome, open the menu ⋮ and choose Install app or Add to Home screen.')
    expect(status).not.toHaveTextContent(en['install.own'])
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(() => Promise.resolve()) })
    act(() => { window.dispatchEvent(event) })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
