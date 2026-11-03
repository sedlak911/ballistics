import { useSyncExternalStore } from 'react'

export type InstallPlatform = 'ios' | 'android'

/** The minimal shape of Chrome's install prompt event (not in TypeScript's DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>
}

export const INSTALL_KEY = 'gb.install'

export function installPlatform(ua: string = navigator.userAgent): InstallPlatform {
  return /iPhone|iPad|iPod/.test(ua) ? 'ios' : 'android'
}

/** Running as the installed home-screen app. */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true
  } catch { /* no matchMedia */ }
  return (navigator as { standalone?: boolean }).standalone === true
}

/** True when the note was shown before. Blocked storage counts as shown, so it never nags; corrupt is not shown. */
export function installNoteShown(storage?: Storage): boolean {
  try {
    const raw = (storage ?? localStorage).getItem(INSTALL_KEY)
    if (raw === null) return false
    try {
      return (JSON.parse(raw) as { noteShown?: unknown } | null)?.noteShown === true
    } catch {
      return false
    }
  } catch {
    return true
  }
}

export function markInstallNoteShown(storage?: Storage): void {
  try {
    (storage ?? localStorage).setItem(INSTALL_KEY, JSON.stringify({ noteShown: true }))
  } catch { /* blocked or full */ }
}

let kept: BeforeInstallPromptEvent | null = null
let captured = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Keeps Chrome's install prompt for the note's button, instead of its own bar. Idempotent. */
export function captureInstallPrompt(): void {
  if (captured || typeof window === 'undefined') return
  captured = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    kept = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    kept = null
    emit()
  })
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => void listeners.delete(onChange)
}
const getSnapshot = () => kept !== null
const getServerSnapshot = () => false

function runPrompt() {
  const event = kept
  if (!event) return
  kept = null
  emit()
  // A prompt can reject (InvalidStateError, say); the note has closed either way.
  try {
    event.prompt().catch(() => {})
  } catch { /* thrown synchronously */ }
}

/** A function that opens the browser's install prompt, or null when none is on offer. */
export function useInstallPrompt(): (() => void) | null {
  captureInstallPrompt()
  const has = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return has ? runPrompt : null
}
