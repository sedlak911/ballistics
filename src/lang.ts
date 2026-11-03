// The language lives in the path: /cs/ and /en/ are the app's pages, and the root only redirects to one of them.
// This module stays free of React and runtime imports, so the root's redirect script is a few hundred bytes.
import type { Lang } from './settings/url'

/** Where the display settings (and so the language) are stored; SettingsContext writes it, the redirect reads it. */
export const DISPLAY_KEY = 'gb.display'

const asLang = (v: unknown): Lang | null => (v === 'cs' || v === 'en' ? v : null)

/** The language a path names: '/ballistics/cs/' and '/cs/index.html' are 'cs'; the root has none. */
export function pathLang(pathname: string): Lang | null {
  const m = /\/(cs|en)\/(?:index\.html)?$/.exec(pathname)
  return m ? asLang(m[1]) : null
}

/** An old link's l=, then the stored setting, then the browser: any Czech locale gets Czech, the rest English. */
export function chooseLang(linkL: string | null, stored: unknown, navigatorLang: string): Lang {
  return asLang(linkL) ?? asLang(stored) ?? (navigatorLang.toLowerCase().startsWith('cs') ? 'cs' : 'en')
}

/** The hash as written, from its '#' (empty without one). Cut from the string, so it stays byte for byte. */
const hashOf = (href: string): string => {
  const i = href.indexOf('#')
  return i < 0 ? '' : href.slice(i)
}

/** The app's root: the base's directory, without a trailing cs/ or en/ segment. */
export function appRoot(baseURI: string): string {
  return new URL('./', baseURI).href.replace(/\/(?:cs|en)\/$/, '/')
}

/** The root page's target: '<root>/<lang>/' with the same search and hash, minus the hash's l= (only l= goes). */
export function redirectTarget(href: string, stored: unknown, navigatorLang: string): string {
  const hash = hashOf(href)
  const q = hash.indexOf('?')
  const path = q < 0 ? hash : hash.slice(0, q)
  const pairs = q < 0 ? [] : hash.slice(q + 1).split('&')
  const isL = (pair: string) => pair.split('=', 1)[0] === 'l'
  const linkL = new URLSearchParams(pairs.filter(isL).join('&')).get('l')
  const rest = pairs.filter((pair) => !isL(pair))
  const lang = chooseLang(linkL, stored, navigatorLang)
  return `${appRoot(href)}${lang}/${new URL(href).search}${rest.length ? `${path}?${rest.join('&')}` : path}`
}

/** The same search and hash on the other language's page. */
export function langHref(href: string, lang: Lang): string {
  return `${appRoot(href)}${lang}/${new URL(href).search}${hashOf(href)}`
}
