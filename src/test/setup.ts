import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// Node 25 ships a global localStorage that is inert without --localstorage-file and shadows jsdom's; a node-environment
// test on Node 22 (CI) has no storage at all.
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[name]?.setItem === 'function') continue
  const data = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
  Object.defineProperty(globalThis, name, { value: storage, configurable: true })
}

// Stored display and setup, and REAL's per-tab note of the URL it wrote, would otherwise leak from one test into the
// next. The first-visit setup counts as done, so tests see the normal Focus view unless they clear the profile.
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('gb.gzw.profile', JSON.stringify({ setupDone: true }))
  // A returning REAL visitor, a rifle chosen: tests see today's page unless they clear it.
  localStorage.setItem('gb.real.setup', 'p=p7')
})
