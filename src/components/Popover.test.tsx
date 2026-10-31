import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Popover } from './Popover'

function Harness({ placement }: { placement?: 'below' | 'above' }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)}>Tag</button>
      <button type="button">Elsewhere</button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label="Menu" placement={placement}>
        <button type="button" onClick={() => setOpen(false)}>Pick</button>
      </Popover>
    </>
  )
}

// A tag inside a bar: the menu hangs from the bar, so it covers none of it, and gives the focus back to the tag.
function InBar() {
  const [open, setOpen] = useState(false)
  const tag = useRef<HTMLButtonElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  return (
    <div ref={bar} data-testid="bar">
      <button ref={tag} type="button" onClick={() => setOpen((o) => !o)}>Tag</button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={tag} hangFrom={bar} label="Menu" placement="above">
        <button type="button">Pick</button>
      </Popover>
    </div>
  )
}

const rectAt = (top: number) => () => ({ top, bottom: top + 44, left: 0, right: 100, width: 100, height: 44, x: 0, y: top, toJSON: () => ({}) })

afterEach(cleanup)

describe('Popover', () => {
  it('opens under its tag with focus on its first control', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick' })).toHaveFocus()
  })

  it('hangs above its tag when asked, for a tag in a bar at the bottom of the screen', () => {
    render(<Harness placement="above" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    const menu = screen.getByRole('dialog', { name: 'Menu' })
    expect(menu.style.top).toBe('')
    expect(menu.style.bottom).toBe(`${window.innerHeight + 8}px`)
  })

  it('hangs from the bar its tag sits in, and still gives the focus back to the tag', () => {
    render(<InBar />)
    screen.getByTestId('bar').getBoundingClientRect = rectAt(600)
    screen.getByRole('button', { name: 'Tag' }).getBoundingClientRect = rectAt(650)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(screen.getByRole('dialog', { name: 'Menu' }).style.bottom).toBe(`${window.innerHeight - 600 + 8}px`)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveFocus()
  })

  it('closes on Escape and gives the focus back to its tag', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveFocus()
  })

  it('closes on a pointer-down outside, not inside', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    fireEvent.pointerDown(screen.getByRole('dialog', { name: 'Menu' }))
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
  })

  // M11: a menu hung low (REAL's station sheet under the strip and the station line) must still end on screen.
  it('keeps to the room under its top, less the 16px gutter, or above its bottom when it hangs above', () => {
    render(<Harness />)
    screen.getByRole('button', { name: 'Tag' }).getBoundingClientRect = rectAt(133)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    const menu = screen.getByRole('dialog', { name: 'Menu' })
    expect(menu.style.top).toBe('185px')
    expect(menu.style.getPropertyValue('--popover-room')).toBe('calc(100dvh - 201px)')
    cleanup()
    render(<InBar />)
    screen.getByTestId('bar').getBoundingClientRect = rectAt(600)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(screen.getByRole('dialog', { name: 'Menu' }).style.getPropertyValue('--popover-room')).toBe(`calc(100dvh - ${window.innerHeight - 600 + 8 + 16}px)`)
  })

  it('gives the focus back to its tag when a pick inside closes it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveFocus()
  })
})
