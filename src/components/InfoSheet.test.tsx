import { act, cleanup, render, screen, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../i18n'
import type { T } from '../i18n'
import { APP_VERSION } from '../version'
import { InfoSheet } from './InfoSheet'

const t: T = (key, vars) => translate('en', key, vars)

function installPart() {
  const summary = screen.queryByText(t('install.title'), { selector: 'summary' })
  return summary?.closest('details') ?? null
}

afterEach(() => {
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  cleanup()
  vi.unstubAllGlobals()
})

describe('InfoSheet install part', () => {
  it('ⓘ tells how to install', () => {
    render(<InfoSheet info={null} t={t} />)
    const part = installPart()
    expect(part).not.toBeNull()
    expect(part!.open).toBe(false)
    expect(part).toHaveTextContent(t('install.why'))
    const dl = part!.querySelector('dl')!
    const terms = [...dl.querySelectorAll('dt')].map((d) => d.textContent)
    expect(terms).toEqual(['iPhone', 'Android'])
    const defs = [...dl.querySelectorAll('dd')].map((d) => d.textContent)
    expect(defs).toEqual([t('install.ios'), t('install.android')])
    expect(part).toHaveTextContent(t('install.own'))
    expect(within(part!).queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('ⓘ offers the button when the browser does', () => {
    render(<InfoSheet info={null} t={t} />)
    const prompt = vi.fn(() => Promise.resolve())
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt })
    act(() => { window.dispatchEvent(e) })
    fireEvent.click(within(installPart()!).getByRole('button', { name: 'Install' }))
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('ⓘ leaves it out on the home screen', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(display-mode: standalone)', media: q, addEventListener: () => {}, removeEventListener: () => {},
    }))
    render(<InfoSheet info={null} t={t} />)
    expect(installPart()).toBeNull()
  })
})

describe('InfoSheet version line', () => {
  it.each(['cs', 'en'] as const)('links what’s new next to the version, in the same tab (%s)', (lang) => {
    const tl: T = (key, vars) => translate(lang, key, vars)
    render(<InfoSheet info={null} t={tl} />)
    const link = screen.getByRole('link', { name: tl('info.whatsNew') })
    expect(link).toHaveAttribute('href', 'changelog/')
    expect(link).not.toHaveAttribute('target')
    expect(link.closest('p')).toHaveTextContent(`${tl('info.version', { v: APP_VERSION })} · ${tl('info.whatsNew')}`)
  })
})

describe('InfoSheet what’s-new link', () => {
  // The page takes the game's palette and leads back to it.
  it('carries the game the sheet is open on', () => {
    render(<InfoSheet info={null} t={t} game="gzw" />)
    expect(screen.getByRole('link', { name: t('info.whatsNew') })).toHaveAttribute('href', 'changelog/#gzw')
  })
})

describe('InfoSheet action', () => {
  it('the action leads the sheet', () => {
    const onClick = vi.fn()
    const { container } = render(
      <InfoSheet info={null} t={t} action={{ label: 'Guide', icon: <svg data-testid="ico" />, onClick }} />,
    )
    const first = container.querySelector('.info-body')!.firstElementChild!
    const btn = screen.getByRole('button', { name: 'Guide' })
    expect(first).toBe(btn)
    expect(btn.querySelector('svg')).not.toBeNull()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('without an action there is no such button', () => {
    render(<InfoSheet info={null} t={t} />)
    expect(screen.queryByRole('button', { name: 'Guide' })).toBeNull()
  })
})
