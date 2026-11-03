import { useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToastSlotContext } from './toastSlot'

export interface ToastInput {
  text: string
  /** An optional button; running it closes the toast. */
  action?: { label: string; run: () => void }
  /** Extra content under the text (the share fallback's link field). */
  body?: ReactNode
  /** Default 6000. null: it stays, with a close ✕, until closed. */
  durationMs?: number | null
}

export type ToastState = ToastInput & { id: number }

/**
 * The page's one status message, with an optional action. It shows in the open modal sheet's slot (`ToastSlot`), else
 * on <body>, and moves between the two as a sheet opens and closes.
 */
export function Toast({ toast, onClose, closeLabel }: { toast: ToastState | null; onClose: () => void; closeLabel: string }) {
  const { slot } = useContext(ToastSlotContext)
  const id = toast?.id
  const durationMs = toast?.durationMs === undefined ? 6000 : toast.durationMs
  const box = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  // Going while it holds the focus (its action, its ✕ or its time), it gives the focus to the dialog it sits in, so
  // the focus never falls to <body> behind a modal.
  const leave = useCallback(() => {
    const el = box.current
    if (el?.contains(document.activeElement)) el.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true })
    onCloseRef.current()
  }, [])

  useEffect(() => {
    if (id === undefined || durationMs === null) return
    const timer = setTimeout(leave, durationMs)
    return () => clearTimeout(timer)
  }, [id, durationMs, leave])

  if (!toast) return null
  const { action } = toast
  return createPortal(
    <div ref={box} className="toast" role="status" key={toast.id}>
      <div className="toast-row">
        <span className="toast-text">{toast.text}</span>
        {action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              leave()
              action.run()
            }}
          >
            {action.label}
          </button>
        )}
        {durationMs === null && (
          <button type="button" className="toast-close" aria-label={closeLabel} onClick={leave}>
            ✕
          </button>
        )}
      </div>
      {toast.body}
    </div>,
    slot ?? document.body,
  )
}

/**
 * The toast's place in a modal sheet: render it inside the dialog. While it is mounted the page's toast portals into
 * it, so its action is in the sheet's Tab order and its status is read inside the modal.
 */
export function ToastSlot() {
  const { setSlot } = useContext(ToastSlotContext)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    setSlot(el)
    // Only its own: a slot that registered since stays.
    return () => setSlot((now) => (now === el ? null : now))
  }, [setSlot])
  return <div ref={ref} className="toast-slot" />
}
