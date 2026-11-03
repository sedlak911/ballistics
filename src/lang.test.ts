import { describe, expect, it } from 'vitest'
import { appRoot, changelogLang, chooseLang, langHref, pathLang, redirectTarget } from './lang'

describe('chooseLang', () => {
  it('takes the link’s l=, then the stored setting, then the browser’s language', () => {
    expect(chooseLang('cs', 'en', 'en-US')).toBe('cs')
    expect(chooseLang(null, 'cs', 'en-US')).toBe('cs')
    expect(chooseLang(null, undefined, 'cs-CZ')).toBe('cs')
    expect(chooseLang(null, 42, 'de')).toBe('en')
  })
})

describe('redirectTarget', () => {
  // Review Focus 2: an old link keeps o= byte for byte and loses only l=.
  it('sends an old link to its language’s page with the same hash, without l=', () => {
    expect(redirectTarget('https://x.io/ballistics/#/real/workbench?p=p7&o=eyJiYyI6MC4zfQ&l=cs', undefined, 'en'))
      .toBe('https://x.io/ballistics/cs/#/real/workbench?p=p7&o=eyJiYyI6MC4zfQ')
  })

  it('sends a bare root to the stored language', () => {
    expect(redirectTarget('https://x.io/ballistics/', 'en', 'cs')).toBe('https://x.io/ballistics/en/')
  })

  it('takes l= from anywhere in the query and keeps the rest in order, also from index.html', () => {
    expect(redirectTarget('https://x.io/ballistics/index.html#/gzw/workbench?w=m700&l=en&d=300', 'cs', 'cs'))
      .toBe('https://x.io/ballistics/en/#/gzw/workbench?w=m700&d=300')
    expect(redirectTarget('https://x.io/ballistics/#/real/workbench?l=cs', undefined, 'en')).toBe('https://x.io/ballistics/cs/#/real/workbench')
  })

  it('keeps a search query before the hash, and the rest of the hash byte for byte', () => {
    expect(redirectTarget('https://x.io/ballistics/?utm=1#/real/workbench?p=p7&o=ab-_c%3D&l=cs', undefined, 'en'))
      .toBe('https://x.io/ballistics/cs/?utm=1#/real/workbench?p=p7&o=ab-_c%3D')
  })

  it('keeps a hash with no query as it is', () => {
    expect(redirectTarget('https://x.io/ballistics/#/gzw/workbench', 'cs', 'en')).toBe('https://x.io/ballistics/cs/#/gzw/workbench')
  })
})

describe('langHref', () => {
  it('opens the same hash on the other language’s page', () => {
    expect(langHref('https://x.io/ballistics/cs/#/gzw/workbench?d=300', 'en')).toBe('https://x.io/ballistics/en/#/gzw/workbench?d=300')
  })
})

describe('appRoot', () => {
  it('drops a trailing cs/ or en/ segment', () => {
    expect(appRoot('https://x.io/ballistics/cs/')).toBe('https://x.io/ballistics/')
    expect(appRoot('https://x.io/ballistics/')).toBe('https://x.io/ballistics/')
  })

  // document.baseURI is the whole page URL when there is no <base>, hash included.
  it('takes the directory of a full page URL', () => {
    expect(appRoot('https://x.io/ballistics/cs/#/gzw/workbench?w=m700')).toBe('https://x.io/ballistics/')
    expect(appRoot('http://localhost:5198/en/index.html')).toBe('http://localhost:5198/')
    expect(appRoot('https://x.io/docs/')).toBe('https://x.io/docs/')
  })
})

describe('pathLang', () => {
  it('reads the language from the path, if it has one', () => {
    expect(pathLang('/public/ballistics/en/index.html')).toBe('en')
    expect(pathLang('/ballistics/cs/')).toBe('cs')
    expect(pathLang('/cs/index.html')).toBe('cs')
    expect(pathLang('/ballistics/')).toBeNull()
    expect(pathLang('/docs/')).toBeNull()
  })
})

describe('changelogLang', () => {
  it('reads the language of a what’s-new page from its path', () => {
    expect(changelogLang('/ballistics/cs/changelog/')).toBe('cs')
    expect(changelogLang('/en/changelog/index.html')).toBe('en')
    expect(changelogLang('/ballistics/cs/')).toBeNull()
    expect(changelogLang('/changelog/')).toBeNull()
  })

  // The app's own pages still read as the app, not as a what's-new page.
  it('leaves pathLang to the app', () => {
    expect(pathLang('/ballistics/cs/changelog/')).toBeNull()
  })
})
