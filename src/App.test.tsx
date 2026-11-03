import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import App from './App'
import { PHONE } from './components/useMedia'
import { leave } from './leave'

// jsdom can't load another page; the language switch on /cs/ and /en/ leaves through this seam.
vi.mock('./leave', () => ({ leave: vi.fn() }))

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

  it('offers the big figure under ⚙ on REAL only', () => {
    open('#/real/workbench')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('group', { name: 'Big figure' })).toBeInTheDocument()
    cleanup()
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(within(screen.getByRole('dialog', { name: 'Settings' })).queryByRole('group', { name: 'Big figure' })).not.toBeInTheDocument()
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

describe('The version and the ⓘ sheet', () => {
  const about = (name = 'About this site') => {
    fireEvent.click(screen.getByRole('button', { name }))
    return screen.getByRole('dialog', { name })
  }

  it('marks the version faintly in the corner, hidden from screen readers, which find it in ⓘ', () => {
    open('')
    const mark = screen.getByText(`v${pkg.version}`)
    expect(mark).toHaveClass('version-mark')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
  })

  it('gives the version in ⓘ on every page', () => {
    for (const hash of ['', '#/gzw/workbench', '#/wardogs/workbench']) {
      open(hash)
      expect(about()).toHaveTextContent(`Version ${pkg.version}`)
      cleanup()
    }
  })

  it('says in ⓘ what stays in the browser and what leaves it, in both languages', () => {
    open('#/gzw/workbench')
    const privacy = within(about()).getByText('Privacy').closest('details')!
    for (const text of ['never leave', 'Open-Meteo', '90 days', 'never uploaded', 'GitHub Pages', 'No cookies, no analytics, no tracking.'])
      expect(privacy).toHaveTextContent(text)
    cleanup()
    open('#/gzw/workbench?l=cs')
    const cs = within(about('O webu')).getByText('Soukromí').closest('details')!
    for (const text of ['neopustí', 'Open-Meteo', '90 dní', 'nikam se nenahrává', 'GitHub Pages', 'Žádné cookies, analytika ani sledování.'])
      expect(cs).toHaveTextContent(text)
  })

  it('explains how to read REAL’s answer in ⓘ, and only on REAL', () => {
    open('')
    const help = within(about()).getByText('How to read the answer').closest('details')!
    for (const text of ['dial', 'hold', 'left over', 'How it’s calculated']) expect(help).toHaveTextContent(text)
    cleanup()
    open('#/real/workbench?l=cs')
    const cs = within(about('O webu')).getByText('Jak číst odpověď').closest('details')!
    for (const text of ['natoč', 'drž', 'zbývá', 'Jak se to počítá']) expect(cs).toHaveTextContent(text)
    cleanup()
    open('#/gzw/workbench')
    expect(within(about()).queryByText('How to read the answer')).toBeNull()
  })
})

// The language is in the path (/cs/, /en/; src/lang.ts). Tests run at the root, where an old link's l= still counts.
describe('The language', () => {
  const atPath = (path: string, hash: string) => {
    window.history.replaceState(null, '', `${path}${hash}`)
    return render(<App />)
  }
  const storedLang = () => (JSON.parse(localStorage.getItem('gb.display') ?? '{}') as { lang?: string }).lang
  const switchTo = (label: 'EN' | 'CS', settings = 'Settings') => {
    fireEvent.click(screen.getByRole('button', { name: settings }))
    fireEvent.click(within(screen.getByRole('group', { name: settings === 'Settings' ? 'Language' : 'Jazyk' })).getByRole('button', { name: label }))
  }
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.mocked(leave).mockClear()
  })

  // R2: the language is read once, when the app opens; the setup links it writes have no l=, and it stays.
  it('keeps an old link’s l= after the app rewrites the link without it', () => {
    open('#/real/workbench?l=cs')
    expect(window.location.hash).not.toMatch(/[?&]l=/)
    expect(screen.getByRole('button', { name: 'O webu' })).toBeInTheDocument()
  })

  it('switches in place at the root, stores it, and writes no l=', () => {
    open('#/gzw/workbench')
    switchTo('CS')
    expect(screen.getByRole('button', { name: 'O webu' })).toBeInTheDocument()
    expect(window.location.hash).not.toMatch(/[?&]l=/)
    expect(storedLang()).toBe('cs')
  })

  it('follows the path over l= and the stored setting, and stores the path’s', () => {
    localStorage.setItem('gb.display', JSON.stringify({ lang: 'en', system: 'imperial' }))
    atPath('/cs/', '#/gzw/workbench?l=en')
    expect(screen.getByRole('button', { name: 'O webu' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('cs')
    expect(JSON.parse(localStorage.getItem('gb.display')!)).toMatchObject({ lang: 'cs', system: 'imperial' })
  })

  it('survives a corrupt stored setting', () => {
    localStorage.setItem('gb.display', 'null')
    open('#/gzw/workbench')
    expect(screen.getByRole('button', { name: 'About this site' })).toBeInTheDocument()
  })

  // An old link's l= must not outlive a switch: a reload would read it before the stored choice.
  it('drops an old link’s l= when switching in place', () => {
    open('#/wardogs/workbench?l=cs')
    switchTo('EN', 'Nastavení')
    expect(screen.getByRole('button', { name: 'About this site' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/wardogs/workbench?u=metric&a=mil')
    expect(leave).not.toHaveBeenCalled()
  })

  it('leaves a language’s page for the other one with the same hash, storing the choice, not switching in place', () => {
    atPath('/cs/', '#/wardogs/workbench?d=300')
    switchTo('EN', 'Nastavení')
    expect(leave).toHaveBeenCalledExactlyOnceWith('http://localhost:3000/en/#/wardogs/workbench?d=300')
    expect(storedLang()).toBe('en')
    expect(screen.getByRole('button', { name: 'O webu' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/wardogs/workbench?d=300')
  })
})
