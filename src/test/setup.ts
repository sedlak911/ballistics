import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// Node 25 ships a global localStorage that is inert without --localstorage-file and shadows jsdom's.
if (typeof globalThis.localStorage?.setItem !== 'function') {
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
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

// Stored display and setup would otherwise leak from one test into the next. The first-visit setup counts as done,
// so tests see the normal Focus view unless they clear the profile.
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('gb.gzw.profile', JSON.stringify({ setupDone: true }))
})
