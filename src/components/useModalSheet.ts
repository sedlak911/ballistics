import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'

/**
 * A modal sheet's focus, once per opening, whatever the parent passes on a re-render: the focus moves to `first`,
 * Escape calls `onClose`, the page under it stops scrolling; on closing the focus goes back to `returnFocus`, as it
 * was when the sheet opened. Gives back the Tab trap for the sheet's `onKeyDown`: Tab and Shift+Tab go round inside `ref`.
 */
export function useModalSheet(
  ref: RefObject<HTMLElement | null>,
  first: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnFocus: RefObject<HTMLElement | null>,
): (e: KeyboardEvent) => void {
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    first.current?.focus()
    const back = returnFocus.current
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      back?.focus()
    }
  }, [first, returnFocus])

  return useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const all = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (all.length === 0) return
    const head = all[0]
    const last = all[all.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === head || at === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      head.focus()
    }
  }, [ref])
}
