import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { Backdrop } from '../components/Backdrop'
import { Logo } from '../components/Logo'
import type { GameId } from '../games/registry'
import { translate, type T } from '../i18n'
import type { Lang } from '../settings/url'
import { backHref } from './back'
import { ENTRIES, type Entry } from './entries'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-11-03' as '3. 11. 2026' in Czech and '3 Nov 2026' in English; read by hand, so no time zone can shift the day. */
function formatDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split('-').map(Number)
  return lang === 'cs' ? `${d}. ${m}. ${y}` : `${d} ${MONTHS[m - 1]} ${y}`
}

const step = (i: number) => ({ '--i': i }) as CSSProperties

/**
 * What each version brought, newest first, on a page of its own. Its header is the logo and a link back to the app in the
 * same language, always on screen: an app installed to the home screen has no browser back. `game` is the game ⓘ was
 * opened on: the page takes its palette and both links lead back to its workbench; without one, REAL and the app's start.
 */
export function ChangelogPage({ lang, game = null, entries = ENTRIES }: { lang: Lang; game?: GameId | null; entries?: Entry[] }) {
  const t: T = (key, vars) => translate(lang, key, vars)
  const back = backHref(game)
  // Before the first paint, so the palette never flashes from REAL's to the game's.
  useLayoutEffect(() => {
    document.documentElement.dataset.game = game ?? 'real'
  }, [game])
  // Once the page scrolls under the header, the header takes a ground of its own (shell.css, .app-header.over).
  const [over, setOver] = useState(() => window.scrollY > 0)
  useEffect(() => {
    const onScroll = () => setOver(window.scrollY > 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div className="app">
      <Backdrop />
      <header className={`app-header${over ? ' over' : ''}`}>
        <a className="logo" href={back} aria-label={t('app.name')}>
          <Logo />
          <span>
            <b>BALLISTICS</b>
            <small>CALCULATOR</small>
          </span>
        </a>
        <a className="btn ghost cl-back" href={back}>
          <span aria-hidden="true">←</span> {t('changelog.back')}
        </a>
      </header>
      <main className="cl-main">
        <h1 className="cl-h1 enter">{t('changelog.title')}</h1>
        {entries.map((e, i) => (
          <section key={e.version} className="cl-entry enter" style={step(Math.min(i + 1, 6))}>
            <h2>
              <span className="cl-meta">
                <span className="cl-ver">{e.version}</span>
                {e.date && <span className="cl-date"> · {formatDate(e.date, lang)}</span>}
              </span>{' '}
              <span className="cl-title">{e.title[lang]}</span>
            </h2>
            <ul className="cl-items">
              {e.items[lang].map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}
