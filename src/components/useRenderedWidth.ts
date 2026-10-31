import { useEffect, useState, type RefObject } from 'react'

/**
 * The element's rendered width in whole CSS px, following resizes. Null until the first measurement, and where it
 * cannot be measured (no ResizeObserver, as in jsdom, or a zero-size box), so callers fall back to their own size.
 */
export function useRenderedWidth(ref: RefObject<Element | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // The observer reports once on observe, then on every change of size.
    const observer = new ResizeObserver(() => {
      const w = Math.round(el.getBoundingClientRect().width)
      setWidth(w > 0 ? w : null)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}
