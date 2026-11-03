import { describe, expect, it } from 'vitest'
import { APP_VERSION } from '../version'
import { ENTRIES } from './entries'

const parts = (v: string) => v.split('.').map(Number)
/** Negative when a is older than b. */
const compare = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

describe('the what’s-new entries', () => {
  // A release can't ship without its entry.
  it('lead with the app’s own version', () => {
    expect(ENTRIES[0].version).toBe(APP_VERSION)
  })

  it('have unique versions, newest first', () => {
    for (const e of ENTRIES) expect(e.version, e.version).toMatch(/^\d+\.\d+\.\d+$/)
    for (let i = 1; i < ENTRIES.length; i++) expect(compare(ENTRIES[i - 1].version, ENTRIES[i].version), ENTRIES[i].version).toBeGreaterThan(0)
  })

  it('say the same number of things in Czech and English, none of them empty', () => {
    for (const e of ENTRIES) {
      expect(e.title.cs, e.version).toMatch(/\S/)
      expect(e.title.en, e.version).toMatch(/\S/)
      expect(e.items.cs.length, e.version).toBeGreaterThan(0)
      expect(e.items.cs.length, e.version).toBe(e.items.en.length)
      for (const s of [...e.items.cs, ...e.items.en]) expect(s, e.version).toMatch(/\S/)
      // The ⚙ glyph renders tiny in the fallback font: the text says "settings" instead.
      for (const s of [e.title.cs, e.title.en, ...e.items.cs, ...e.items.en]) expect(s, e.version).not.toContain('⚙')
    }
  })

  // The deploy fills in the newest date; every released version has a real one, never later than a newer version's.
  it('date each released version, oldest last', () => {
    ENTRIES.slice(1).forEach((e) => expect(e.date, e.version).not.toBeNull())
    const dates = ENTRIES.map((e) => e.date).filter((d): d is string => d !== null)
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10), d).toBe(d)
    }
    for (let i = 1; i < dates.length; i++) expect(dates[i - 1] >= dates[i], dates[i]).toBe(true)
  })
})
