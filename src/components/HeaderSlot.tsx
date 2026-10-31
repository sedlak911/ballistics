import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** The header's slot between the game switcher and the view toggle; the shell provides it once it is mounted. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null)

/** Renders its children into the header slot, or nothing until the slot exists. */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext)
  return slot ? createPortal(children, slot) : null
}
