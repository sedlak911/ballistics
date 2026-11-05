import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import App from './App'
import { PHONE } from './components/useMedia'
import { leave, restart } from './leave'
import { closeGuide } from './games/real/guide'
import { LIBRARY_KEY } from './games/real/library'
import { PROFILE_KEY } from './games/real/profile'

// jsdom can't load another page; the language switch on /cs/ and /en/ leaves through this seam, the reset restarts
// through it.
vi.mock('./leave', () => ({ leave: vi.fn(), restart: vi.fn() }))

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

afterEach(() => {
  closeGuide()
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
    localStorage.setItem('gb.install', '{"noteShown":true}')
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
    open('#/gzw/workbench')
    const nav = screen.getByRole('navigation', { name: 'Game' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['REAL', 'GZW', 'WARDOGS' + 'soon'])
  })

  it('shows the install note on a phone with empty storage', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
    open('#/gzw/workbench')
    // The dock's own (empty) status region is on the page too.
    expect(screen.getByText(/^Add Ballistics to your home screen/).closest('[role="status"]')).not.toBeNull()
  })

  it('REAL shows the guide instead of the install note', () => {
    localStorage.clear()
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
    open('#/real/workbench')
    expect(screen.queryByText(/^Add Ballistics to your home screen/)).toBeNull()
    expect(document.querySelector('.guide-card')).not.toBeNull()
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

  it('links ⓘ’s what’s new with the game it is open on', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    expect(screen.getByRole('link', { name: 'What’s new' })).toHaveAttribute('href', 'changelog/#gzw')
    cleanup()
    open('')
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    expect(screen.getByRole('link', { name: 'What’s new' })).toHaveAttribute('href', 'changelog/#real')
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

describe('The header', () => {
  const scrollTo = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    fireEvent.scroll(window)
  }
  afterEach(() => scrollTo(0))

  it('has the contour lines under it: they span the whole page, not only the part below it', () => {
    open('#/real/workbench')
    const topo = document.querySelector('.topo')!
    expect(topo.parentElement).toHaveClass('app')
    expect(topo.compareDocumentPosition(document.querySelector('.app-header')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lets the page show through at the top, and takes a ground only while the page scrolls under it', () => {
    open('#/real/workbench')
    const header = document.querySelector('.app-header')!
    expect(header).not.toHaveClass('over')
    scrollTo(30)
    expect(header).toHaveClass('over')
    scrollTo(0)
    expect(header).not.toHaveClass('over')
  })

  it('draws ⓘ, ⚙ and the sheets’ share and ✕ as one icon button, each with a line glyph', () => {
    open('#/real/workbench?p=p7&d=800')
    const iconButton = (el: HTMLElement) => {
      expect(el).toHaveClass('icon-btn')
      expect(el.querySelector('svg')).not.toBeNull()
      expect(el).not.toHaveTextContent('✕')
    }
    iconButton(screen.getByRole('button', { name: 'About this site' }))
    iconButton(screen.getByRole('button', { name: 'Settings' }))

    fireEvent.click(within(screen.getByTestId('real-strip')).getByRole('button', { name: /^Rifle:/ }))
    const sheet = screen.getByRole('dialog', { name: 'Settings' })
    iconButton(within(sheet).getByRole('button', { name: 'Share settings' }))
    iconButton(within(sheet).getByRole('button', { name: 'Close settings' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close settings' }))

    fireEvent.click(screen.getByRole('button', { name: 'How it’s calculated' }))
    iconButton(within(screen.getByRole('dialog', { name: /How it’s calculated/ })).getByRole('button', { name: 'Close' }))
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
    for (const text of ['nikam neodcházejí', 'Open-Meteo', '90 dní', 'nikam se nenahrává', 'GitHub Pages', 'Žádné cookies, analytika ani sledování.'])
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

describe('ⓘ and the guide', () => {
  it('ⓘ opens the guide on REAL', () => {
    localStorage.setItem(PROFILE_KEY, '{}')
    open('#/real/workbench')
    const info = screen.getByRole('button', { name: 'About this site' })
    fireEvent.click(info)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'About this site' })).getByRole('button', { name: 'Guide' }))
    expect(screen.queryByRole('dialog', { name: 'About this site' })).toBeNull()
    expect(screen.getByText('Guide · 1 / 5')).toBeInTheDocument()
    expect(document.activeElement).toHaveClass('guide-title')
    fireEvent.click(screen.getByRole('button', { name: 'Close the guide' }))
    expect(document.activeElement).toBe(info)
    localStorage.clear()
  })

  it('no Guide on GZW', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: 'About this site' }))
    expect(screen.queryByRole('button', { name: 'Guide' })).toBeNull()
  })
})

describe('The reset', () => {
  const settings = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    return screen.getByRole('dialog', { name: 'Settings' })
  }
  /** The sheet's last element in document order, whatever wraps the rows (the body that scrolls on a short phone). */
  const lastIn = (sheet: HTMLElement) => [...sheet.querySelectorAll('*')].at(-1)!

  it('ends the ⚙ sheet on GZW', () => {
    open('#/gzw/workbench')
    const sheet = settings()
    const row = sheet.querySelector('.reset-row')!
    expect(row.contains(lastIn(sheet))).toBe(true)
    expect(row.nextElementSibling).toBeNull()
    expect(within(row as HTMLElement).getByRole('button', { name: '↺ Reset everything to defaults' })).toBeInTheDocument()
  })

  it('Yes clears every gb key but the library and restarts', () => {
    vi.mocked(restart).mockClear()
    localStorage.setItem(LIBRARY_KEY, '{"rifles":[]}')
    localStorage.setItem('gb.install', '{"noteShown":true}')
    sessionStorage.setItem('gb.real.written', 'p=p7')
    open('#/gzw/workbench?d=300')
    const sheet = settings()
    fireEvent.click(within(sheet).getByRole('button', { name: '↺ Reset everything to defaults' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Yes' }))
    expect(restart).toHaveBeenCalledExactlyOnceWith(`${location.origin}${location.pathname}#/real/workbench`)
    const gb = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) => k.startsWith('gb.'))
    expect(gb).toEqual([LIBRARY_KEY])
    expect(sessionStorage.getItem('gb.real.written')).toBeNull()
    expect(sessionStorage.getItem('gb.reset')).toBe('1')
  })

  it('comes after REAL’s own rows', () => {
    open('#/real/workbench')
    const sheet = settings()
    const row = sheet.querySelector('.reset-row')!
    expect(row.contains(lastIn(sheet))).toBe(true)
    const last = within(sheet).getByRole('group', { name: 'Measuring with the phone' })
    expect(last.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(sheet).getByRole('group', { name: 'Big figure' }).compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('closing ⚙ puts the row back at rest', () => {
    open('#/real/workbench')
    let sheet = settings()
    fireEvent.click(within(sheet).getByRole('button', { name: '↺ Reset everything to defaults' }))
    expect(within(sheet).getByRole('group', { name: 'Reset everything?' })).toBeInTheDocument()
    // Escape in the asking row only puts it back; ⚙ stays open.
    fireEvent.keyDown(within(sheet).getByRole('button', { name: 'No' }), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: '↺ Reset everything to defaults' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
    sheet = settings()
    expect(within(sheet).queryByRole('group', { name: 'Reset everything?' })).toBeNull()
    expect(within(sheet).getByRole('button', { name: '↺ Reset everything to defaults' })).toBeInTheDocument()
  })
})
