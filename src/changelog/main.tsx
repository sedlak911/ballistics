// The what's-new page's entry (cs/changelog/index.html, en/changelog/index.html): the app's fonts, styles and the games'
// palettes, and no network. The language comes from the path, as the app's does; the game from the hash (back.ts).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// One stylesheet that @imports the app's fonts and styles: imported from here one by one, they would become a CSS chunk
// shared with the app, loaded before the app's own CSS, and reorder its cascade.
import './changelog.css'
import { changelogLang } from '../lang'
import { gameFromHash } from './back'
import { ChangelogPage } from './ChangelogPage'

const lang = changelogLang(window.location.pathname) ?? (document.documentElement.lang === 'cs' ? 'cs' : 'en')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChangelogPage lang={lang} game={gameFromHash(window.location.hash)} />
  </StrictMode>,
)
