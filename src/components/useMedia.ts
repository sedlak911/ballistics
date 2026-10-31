import { useSyncExternalStore } from 'react'

/** Phone layout (DESIGN.md, Phone): one column, the sticky bottom bar, 44px targets. */
export const PHONE = '(max-width: 699px)'

/** Whether a media query matches, following changes. False where matchMedia is missing (tests, old browsers). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener?.('change', onChange)
      return () => list?.removeEventListener?.('change', onChange)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
