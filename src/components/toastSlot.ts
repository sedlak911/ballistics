import { createContext, type Dispatch, type SetStateAction } from 'react'

/**
 * Where the page's toast shows: in the slot an open modal sheet holds (`ToastSlot`), so its action is in the sheet's Tab
 * order and its status is read inside the modal; on <body> while there is none. The shell provides it, as it does the
 * header slot.
 */
export interface ToastSlotValue {
  slot: HTMLElement | null
  setSlot: Dispatch<SetStateAction<HTMLElement | null>>
}

export const ToastSlotContext = createContext<ToastSlotValue>({ slot: null, setSlot: () => {} })
