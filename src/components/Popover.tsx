import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { PHONE, useMedia } from './useMedia'

const GAP_PX = 8
const GUTTER_PX = 16

/**
 * A small menu hung under the tag that opens it, in place of a dropdown (or over it, for a tag in a bar at the bottom
 * of the screen). It sits on <body> at the tag's position, so no header or strip clips it; on a phone it spans the
 * width. Escape or a pointer-down outside it (and outside the tag, which toggles it) closes it; it takes the focus on
 * opening and gives it back to the tag on closing.
 */
export function Popover({ open, onClose, anchorRef, hangFrom, label, className, placement = 'below', children }: {
  open: boolean
  onClose: () => void
  /** The tag: it toggles the menu and gets the focus back. */
  anchorRef: RefObject<HTMLElement | null>
  /** Where the menu hangs, when not from the tag: e.g. the whole bar the tag sits in, so the menu covers none of it. */
  hangFrom?: RefObject<HTMLElement | null>
  label: string
  className?: string
  placement?: 'below' | 'above'
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const phone = useMedia(PHONE)
  const [place, setPlace] = useState<CSSProperties>({})

  // Follow the tag while the page scrolls or resizes under it.
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const a = (hangFrom ?? anchorRef).current?.getBoundingClientRect()
      if (!a) return
      // From its own edge, top or bottom, the room to the far side of the screen less the gutter and that side's safe-area inset: ui.css caps the height
      // to it, so a menu hung low still ends on screen and scrolls inside (M11).
      const at = placement === 'above' ? window.innerHeight - a.top + GAP_PX : a.bottom + GAP_PX
      const edge = placement === 'above' ? { bottom: at } : { top: at }
      const room = { '--popover-room': `calc(100dvh - ${at + GUTTER_PX}px - var(--${placement === 'above' ? 'safe-top' : 'safe-bottom'}))` } as CSSProperties
      if (phone) return setPlace({ ...edge, ...room, left: GUTTER_PX, right: GUTTER_PX })
      const width = ref.current?.offsetWidth ?? 0
      setPlace({ ...edge, ...room, left: Math.max(GUTTER_PX, Math.min(a.left, window.innerWidth - width - GUTTER_PX)) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, phone, anchorRef, hangFrom, placement])

  // Focus in on opening, on the chosen option if there is one. On closing, a focus left on nothing (the menu it was in is gone: a pick, Escape) goes back
  // to the tag; a click that moved it elsewhere keeps it there.
  const wasOpen = useRef(false)
  useLayoutEffect(() => {
    if (open) {
      const menu = ref.current
      const target = menu?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? menu?.querySelector<HTMLElement>('button, input, [tabindex]') ?? menu
      target?.focus({ preventScroll: true })
    } else if (wasOpen.current && (document.activeElement === null || document.activeElement === document.body)) {
      anchorRef.current?.focus()
    }
    wasOpen.current = open
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchorRef.current?.contains(target)) onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return createPortal(
    <div ref={ref} className={`popover panel${className ? ` ${className}` : ''}`} role="dialog" aria-label={label}
      tabIndex={-1} style={place}>
      {children}
    </div>,
    document.body,
  )
}
