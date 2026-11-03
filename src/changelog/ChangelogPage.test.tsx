import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { translate } from '../i18n'
import type { Lang } from '../settings/url'
import { ChangelogPage } from './ChangelogPage'
import { ENTRIES, type Entry } from './entries'

afterEach(cleanup)

const LANGS: Lang[] = ['cs', 'en']

const FIXTURE: Entry[] = [
  { version: '9.9.9', date: null, title: { cs: 'Nevydaná', en: 'Unreleased' }, items: { cs: ['Nic'], en: ['Nothing'] } },
  { version: '9.9.8', date: '2026-11-03', title: { cs: 'Vydaná', en: 'Released' }, items: { cs: ['Jedna', 'Dvě'], en: ['One', 'Two'] } },
]

const heading = (version: string) => screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent?.includes(version))!

describe('the what’s-new page', () => {
  it.each(LANGS)('shows its title and every version, newest first (%s)', (lang) => {
    render(<ChangelogPage lang={lang} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(translate(lang, 'changelog.title'))
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s).toHaveLength(ENTRIES.length)
    ENTRIES.forEach((e, i) => {
      expect(h2s[i]).toHaveTextContent(e.version)
      expect(h2s[i]).toHaveTextContent(e.title[lang])
    })
    for (const e of ENTRIES) for (const item of e.items[lang]) expect(screen.getByText(item)).toBeInTheDocument()
  })

  // An installed app has no browser back: the page's own link returns to the app in the same language.
  it.each(LANGS)('leads back to the app in the same language, by the link and by the logo (%s)', (lang) => {
    render(<ChangelogPage lang={lang} />)
    const back = screen.getByRole('link', { name: translate(lang, 'changelog.back') })
    expect(back).toHaveAttribute('href', '../')
    expect(back).toHaveTextContent(`← ${translate(lang, 'changelog.back')}`)
    expect(back).not.toHaveAttribute('target')
    expect(screen.getByRole('link', { name: translate(lang, 'app.name') })).toHaveAttribute('href', '../')
  })

  // ⓘ's link carries the game it was opened on (changelog/#gzw): the page takes its palette, and the way back returns to it.
  it.each(LANGS)('keeps the game it came from: its palette, and both ways back lead to its workbench (%s)', (lang) => {
    render(<ChangelogPage lang={lang} game="gzw" />)
    expect(document.documentElement.dataset.game).toBe('gzw')
    expect(screen.getByRole('link', { name: translate(lang, 'changelog.back') })).toHaveAttribute('href', '../#/gzw/workbench')
    expect(screen.getByRole('link', { name: translate(lang, 'app.name') })).toHaveAttribute('href', '../#/gzw/workbench')
  })

  it('falls back to REAL and the app’s start without a game', () => {
    document.documentElement.dataset.game = 'gzw'
    render(<ChangelogPage lang="en" game={null} />)
    expect(document.documentElement.dataset.game).toBe('real')
    expect(screen.getByRole('link', { name: translate('en', 'changelog.back') })).toHaveAttribute('href', '../')
    expect(screen.getByRole('link', { name: translate('en', 'app.name') })).toHaveAttribute('href', '../')
  })

  it('gives an unreleased version no date', () => {
    render(<ChangelogPage lang="en" entries={FIXTURE} />)
    expect(heading('9.9.9').textContent).not.toContain('·')
    expect(heading('9.9.9')).toHaveTextContent('Unreleased')
  })

  it('writes the date the Czech way in Czech', () => {
    render(<ChangelogPage lang="cs" entries={FIXTURE} />)
    expect(within(heading('9.9.8')).getByText('· 3. 11. 2026')).toBeInTheDocument()
    expect(heading('9.9.8')).toHaveTextContent('9.9.8 · 3. 11. 2026 Vydaná')
  })

  it('writes the date the English way in English', () => {
    render(<ChangelogPage lang="en" entries={FIXTURE} />)
    expect(heading('9.9.8')).toHaveTextContent('9.9.8 · 3 Nov 2026 Released')
  })

  it('lists each version’s items under it', () => {
    render(<ChangelogPage lang="cs" entries={FIXTURE} />)
    const block = heading('9.9.8').closest('section')!
    expect(within(block).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Jedna', 'Dvě'])
  })
})
