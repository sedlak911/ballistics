import { useCallback, useRef, useState } from 'react'
import type { ToastInput, ToastState } from './Toast'

/** One toast at a time: each `show` replaces the current one and takes a new id, which restarts its timer. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const next = useRef(0)
  const show = useCallback((t: ToastInput) => {
    next.current += 1
    setToast({ ...t, id: next.current })
  }, [])
  const close = useCallback(() => setToast(null), [])
  /** Closes the toast only if it stays until closed (`durationMs: null`); a timed one keeps its time. */
  const closeSticky = useCallback(() => setToast((now) => (now && now.durationMs === null ? null : now)), [])
  return { toast, show, close, closeSticky }
}
