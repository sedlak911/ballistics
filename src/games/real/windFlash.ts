import { useSyncExternalStore } from 'react'

// The hour that was just turned lights up for a moment, so the owner sees that the wind moved with the direction.

export const FLASH_MS = 1200

export interface WindFlash { hour: number; key: number }

const listeners = new Set<() => void>()
let current: WindFlash | null = null
let counter = 0
let timer: ReturnType<typeof setTimeout> | undefined

const emit = () => listeners.forEach((l) => l())

/** Lights `hour` for FLASH_MS; a second flash restarts the time and the key. */
export function flashWindHour(hour: number): void {
  counter += 1
  current = { hour, key: counter }
  clearTimeout(timer)
  timer = setTimeout(() => {
    current = null
    emit()
  }, FLASH_MS)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The flash now, or null once FLASH_MS has passed. */
export function useWindFlash(): WindFlash | null {
  return useSyncExternalStore(subscribe, () => current)
}
