// Reset everything to defaults, from ⚙ (spec §5). This module imports nothing but the restart seam: resetBoot.ts runs it
// before any other module evaluates, so nothing reads the storage before a pending reset has cleared it.
import { restart } from './leave'

/** In session storage, one-shot: a reset this tab asked for, which the next start finishes (applyPendingReset). */
export const RESET_FLAG = 'gb.reset'

/**
 * The one gb key a reset keeps: your own rifles, rounds and scopes. The library's own key (games/real/library.ts
 * LIBRARY_KEY), by value: importing the library would evaluate it, and what it imports, before the boot's clear.
 */
export const KEPT_KEY = 'gb.real.library'

/** Session storage's one app key: what REAL last wrote to the URL in this tab (games/real/setup.ts). */
const WRITTEN_KEY = 'gb.real.written'

/** Where a reset lands: REAL, with a bare address. */
const HOME = '#/real/workbench'

/** A storage global, or null where there is none or the browser blocks even reading it. */
function storage(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return globalThis[name] ?? null
  } catch {
    return null
  }
}

function attempt(f: () => void): void {
  try {
    f()
  } catch {
    // Blocked storage, or a history write the browser refused: the rest still runs.
  }
}

/** This page in this language (the path), with no search and REAL's bare hash. */
function homeHref(href: string): string {
  const url = new URL(href)
  url.search = ''
  url.hash = HOME
  return url.href
}

/** Every gb.* key in local storage but gb.real.library goes; in session storage only gb.real.written. Never throws. */
export function clearAppStorage(local: Storage | null = storage('localStorage'), session: Storage | null = storage('sessionStorage')): void {
  if (local !== null) {
    // Listed first, then removed: a removal shifts the indexes.
    const keys: string[] = []
    attempt(() => {
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i)
        if (key !== null && key.startsWith('gb.') && key !== KEPT_KEY) keys.push(key)
      }
    })
    for (const key of keys) attempt(() => local.removeItem(key))
  }
  if (session !== null) attempt(() => session.removeItem(WRITTEN_KEY))
}

/**
 * At boot, before anything reads storage: a pending reset clears again (what the page wrote while unloading) and drops
 * the flag. The page could also have written the URL while it unloaded (the router's trailing write), so the address
 * goes bare again too: the reloaded page is a first visit either way.
 */
export function applyPendingReset(): void {
  const session = storage('sessionStorage')
  let pending = false
  attempt(() => {
    pending = session !== null && session.getItem(RESET_FLAG) !== null
  })
  if (!pending || session === null) return
  clearAppStorage(storage('localStorage'), session)
  attempt(() => session.removeItem(RESET_FLAG))
  const home = homeHref(window.location.href)
  if (window.location.href !== home) attempt(() => window.history.replaceState(null, '', home))
}

/**
 * ⚙'s Yes: flag, clear now, then reload REAL bare in this language. Without session storage there is no flag; it still
 * clears and reloads.
 */
export function resetEverything(): void {
  attempt(() => storage('sessionStorage')?.setItem(RESET_FLAG, '1'))
  clearAppStorage()
  restart(homeHref(window.location.href))
}
