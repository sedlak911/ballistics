import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { BottomBar } from './BottomBar'

function Page({ phone }: { phone: boolean }) {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, distanceM: 600, windMs: 4, windClock: 9, windSet: true })
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <BottomBar setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch }))} system="metric" windUnit="m/s" phone={phone} now={0}
        weights={[48, 37, 15]} />
    </SettingsProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/real/workbench?l=cs'
})
afterEach(cleanup)

/** The phone's Wind panel, opened. */
function openWindPanel() {
  render(<Page phone />)
  fireEvent.click(screen.getByRole('button', { name: /^Vítr \d/ }))
}
const help = () => screen.getByRole('button', { name: 'Jak číst vítr' })
const sheet = () => screen.getByRole('dialog', { name: 'Jak číst vítr' })

describe('how to read the wind', () => {
  it('opens from the ? in the Wind panel and holds the flag rule and the table', () => {
    openWindPanel()
    fireEvent.click(help())
    expect(within(sheet()).getByText(/úhel od žerdi ÷ 9 ≈ m\/s/)).toBeInTheDocument()
    expect(within(sheet()).getByRole('rowheader', { name: '5,5–7 m/s' })).toBeInTheDocument()
    expect(within(sheet()).getAllByRole('row')).toHaveLength(5)
    expect(within(sheet()).getByRole('heading', { name: 'Střed: mirage' })).toBeInTheDocument()
  })

  it('closes with the ✕ and returns the focus to the ?, the Wind panel stays open', () => {
    openWindPanel()
    fireEvent.click(help())
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Zavřít' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(help()).toHaveFocus()
    expect(screen.getByRole('button', { name: /^Vítr \d/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes with Escape, and a press on the sheet or the Escape does not close the panel', () => {
    openWindPanel()
    fireEvent.click(help())
    fireEvent.pointerDown(within(sheet()).getByText(/úhel od žerdi/))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(help()).toHaveFocus()
    expect(screen.getByRole('button', { name: /^Vítr \d/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('a ? gone while the sheet is open (the dock turned into the bar) hands the focus to the ? on screen', () => {
    const { rerender } = render(<Page phone />)
    fireEvent.click(screen.getByRole('button', { name: /^Vítr \d/ }))
    const dockHelp = help()
    fireEvent.click(dockHelp)
    rerender(<Page phone={false} />)
    expect(dockHelp.isConnected).toBe(false)
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Zavřít' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(help()).not.toBe(dockHelp)
    expect(help()).toHaveFocus()
  })

  it('opens from the desktop wind group too, in English', () => {
    window.location.hash = '#/real/workbench'
    render(<Page phone={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'How to read the wind' }))
    const dialog = screen.getByRole('dialog', { name: 'How to read the wind' })
    expect(within(dialog).getByRole('rowheader', { name: '5.5–7 m/s' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'How to read the wind' })).toHaveFocus()
  })
})
