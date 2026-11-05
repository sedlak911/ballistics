import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_KEY } from './games/real/library'
import { restart } from './leave'
import { applyPendingReset, clearAppStorage, KEPT_KEY, RESET_FLAG, resetEverything } from './reset'

// jsdom can't reload the page; the reset restarts through this seam.
vi.mock('./leave', () => ({ leave: vi.fn(), restart: vi.fn() }))

const LOCAL = [
  'gb.real.setup', 'gb.real.profile', 'gb.real.profiles', 'gb.real.station', 'gb.real.wind', 'gb.real.weather',
  'gb.real.library', 'gb.gzw.setup', 'gb.gzw.profile', 'gb.display', 'gb.install', 'other.key',
]

const keys = (s: Storage) => Array.from({ length: s.length }, (_, i) => s.key(i)).sort()

function seed() {
  for (const k of LOCAL) localStorage.setItem(k, k === LIBRARY_KEY ? '{"rifles":[{"id":"c1"}]}' : 'x')
  sessionStorage.setItem('gb.real.written', 'p=p7')
  sessionStorage.setItem('other.session', 'y')
}

const denied = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError')
}

/** Storage as a browser blocks it: reading the global itself throws. */
function block(name: 'localStorage' | 'sessionStorage'): () => void {
  const was = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, get: denied })
  expect(() => globalThis[name]).toThrow('insecure')
  return () => {
    if (was) Object.defineProperty(globalThis, name, was)
    else delete (globalThis as Record<string, unknown>)[name]
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.mocked(restart).mockClear()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('clearAppStorage', () => {
  it('keeps the library, under the key the library is stored by', () => {
    expect(KEPT_KEY).toBe(LIBRARY_KEY)
  })

  it('clears every gb key but the library', () => {
    seed()
    clearAppStorage()
    expect(keys(localStorage)).toEqual(['gb.real.library', 'other.key'])
    expect(localStorage.getItem(LIBRARY_KEY)).toBe('{"rifles":[{"id":"c1"}]}')
    expect(keys(sessionStorage)).toEqual(['other.session'])
  })

  it('leaves a pending reset flag in session storage', () => {
    sessionStorage.setItem(RESET_FLAG, '1')
    clearAppStorage()
    expect(sessionStorage.getItem(RESET_FLAG)).toBe('1')
  })

  it('survives blocked storage', () => {
    const throwing = new Proxy({} as Storage, { get: denied })
    const half = { get length() { return 3 }, key: denied, getItem: denied, setItem: denied, removeItem: denied, clear: denied } as Storage
    expect(() => clearAppStorage(throwing, throwing)).not.toThrow()
    expect(() => clearAppStorage(half, half)).not.toThrow()
    expect(() => clearAppStorage(null, null)).not.toThrow()
  })

  it('a key that won’t go doesn’t stop the others', () => {
    seed()
    const removeItem = localStorage.removeItem.bind(localStorage)
    const local = {
      get length() { return localStorage.length },
      key: (i: number) => localStorage.key(i),
      removeItem: (k: string) => (k === 'gb.real.setup' ? denied() : removeItem(k)),
    } as Storage
    clearAppStorage(local, sessionStorage)
    expect(keys(localStorage)).toEqual(['gb.real.library', 'gb.real.setup', 'other.key'])
  })
})

describe('resetEverything', () => {
  it('flags the reset, clears and restarts REAL with a bare address in this language', () => {
    seed()
    window.history.replaceState(null, '', '/cs/?l=en#/gzw/workbench?d=300')
    resetEverything()
    expect(sessionStorage.getItem(RESET_FLAG)).toBe('1')
    expect(keys(localStorage)).toEqual(['gb.real.library', 'other.key'])
    expect(sessionStorage.getItem('gb.real.written')).toBeNull()
    expect(restart).toHaveBeenCalledExactlyOnceWith(`${location.origin}${location.pathname}#/real/workbench`)
    expect(vi.mocked(restart).mock.calls[0][0]).toBe('http://localhost:3000/cs/#/real/workbench')
  })

  it('without session storage it still clears and restarts', () => {
    seed()
    const unblock = block('sessionStorage')
    try {
      expect(() => resetEverything()).not.toThrow()
    } finally {
      unblock()
    }
    expect(keys(localStorage)).toEqual(['gb.real.library', 'other.key'])
    expect(restart).toHaveBeenCalledExactlyOnceWith(`${location.origin}${location.pathname}#/real/workbench`)
  })

  it('with all storage blocked it still restarts', () => {
    const unblockLocal = block('localStorage')
    const unblockSession = block('sessionStorage')
    try {
      expect(() => resetEverything()).not.toThrow()
    } finally {
      unblockSession()
      unblockLocal()
    }
    expect(restart).toHaveBeenCalledOnce()
  })
})

describe('applyPendingReset', () => {
  it('a pending reset clears what the unload wrote', () => {
    localStorage.setItem(LIBRARY_KEY, '{"rifles":[]}')
    sessionStorage.setItem(RESET_FLAG, '1')
    // What the page wrote while it unloaded: the setup effect, the profile, the URL's note.
    localStorage.setItem('gb.real.setup', 'd=300')
    localStorage.setItem('gb.real.profile', '{}')
    sessionStorage.setItem('gb.real.written', 'd=300')
    applyPendingReset()
    expect(localStorage.getItem('gb.real.setup')).toBeNull()
    expect(localStorage.getItem('gb.real.profile')).toBeNull()
    expect(sessionStorage.getItem('gb.real.written')).toBeNull()
    expect(sessionStorage.getItem(RESET_FLAG)).toBeNull()
    expect(localStorage.getItem(LIBRARY_KEY)).toBe('{"rifles":[]}')
  })

  it('a pending reset bares an address a trailing write put back', () => {
    sessionStorage.setItem(RESET_FLAG, '1')
    window.history.replaceState(null, '', '/cs/?l=en#/real/workbench?p=p7&d=300')
    applyPendingReset()
    expect(location.pathname).toBe('/cs/')
    expect(location.search).toBe('')
    expect(location.hash).toBe('#/real/workbench')
  })

  it('with no flag it touches nothing', () => {
    seed()
    window.history.replaceState(null, '', '/cs/#/real/workbench?p=p7')
    applyPendingReset()
    expect(keys(localStorage)).toEqual([...LOCAL].sort())
    expect(keys(sessionStorage)).toEqual(['gb.real.written', 'other.session'])
    expect(location.hash).toBe('#/real/workbench?p=p7')
  })

  it('runs once: the flag goes with the first start', () => {
    sessionStorage.setItem(RESET_FLAG, '1')
    applyPendingReset()
    localStorage.setItem('gb.real.setup', 'p=p7')
    applyPendingReset()
    expect(localStorage.getItem('gb.real.setup')).toBe('p=p7')
  })

  it('survives blocked storage', () => {
    const unblockSession = block('sessionStorage')
    try {
      expect(() => applyPendingReset()).not.toThrow()
    } finally {
      unblockSession()
    }
    sessionStorage.setItem(RESET_FLAG, '1')
    const unblockLocal = block('localStorage')
    try {
      expect(() => applyPendingReset()).not.toThrow()
    } finally {
      unblockLocal()
    }
    expect(sessionStorage.getItem(RESET_FLAG)).toBeNull()
  })
})
