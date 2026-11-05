import { useSyncExternalStore } from 'react'
import { PROFILE_KEY } from './profile'
import { SETUP_KEY } from './setup'

export const GUIDE_PAGES = ['install', 'rifle', 'weather', 'wind', 'direction', 'distance'] as const
export type GuidePage = (typeof GUIDE_PAGES)[number]

export interface GuideState {
  open: boolean
  /** Where the focus goes when the guide closes; null when it opened by itself and took none. */
  returnFocus: HTMLElement | null
  /** Raised on every open, so a second open starts the card afresh. */
  token: number
}

let state: GuideState = { open: false, returnFocus: null, token: 0 }
const listeners = new Set<() => void>()
const set = (next: GuideState) => {
  state = next
  listeners.forEach((l) => l())
}

/** null: opened by itself, takes no focus. */
export function openGuide(returnFocus: HTMLElement | null): void {
  set({ open: true, returnFocus, token: state.token + 1 })
}

export function closeGuide(): void {
  if (state.open) set({ ...state, open: false })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useGuide(): GuideState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** A first visit: neither the setup nor the profile is stored. Storage that can't be read counts as seen. */
export function guideDue(storage?: Storage): boolean {
  try {
    const s = storage ?? localStorage
    return s.getItem(SETUP_KEY) === null && s.getItem(PROFILE_KEY) === null
  } catch {
    return false
  }
}

/** The install page is for a phone in the browser only. */
export function guidePages(env: { phone: boolean; standalone: boolean }): GuidePage[] {
  return GUIDE_PAGES.filter((p) => p !== 'install' || (env.phone && !env.standalone))
}
