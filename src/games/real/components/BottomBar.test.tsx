import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { BottomBar } from './BottomBar'

const latest = { current: DEFAULT_SETUP }

function Page({ start }: { start?: Partial<RealSetup> }) {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, distanceM: 600, windMs: 4, windClock: 9, windSet: true, ...start })
  useEffect(() => { latest.current = setup })
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <BottomBar setup={setup} update={(patch) => setSetup((s) => ({ ...s, ...patch }))} system="metric" windUnit="m/s" phone={false} now={0}
        weights={[48, 37, 15]} />
    </SettingsProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/real/workbench'
})
afterEach(cleanup)

describe('the desktop wind group', () => {
  const group = () => document.querySelector<HTMLElement>('.real-group-wind')!

  it('has the ? and the zones icon from 300 m, and no strip while the zones are off', () => {
    render(<Page />)
    expect(within(group()).getByRole('button', { name: 'How to read the wind' })).toBeInTheDocument()
    expect(within(group()).getByRole('button', { name: 'Wind zones' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group()).queryByRole('button', { name: /^Near/ })).toBeNull()
    expect(within(group()).getByText(/^Read it out to half the distance/)).toBeInTheDocument()
  })

  it('has only the ? under 300 m', () => {
    render(<Page start={{ distanceM: 250 }} />)
    expect(within(group()).getByRole('button', { name: 'How to read the wind' })).toBeInTheDocument()
    expect(within(group()).queryByRole('button', { name: 'Wind zones' })).toBeNull()
  })

  it('shows the strip at 600 m with the zones on, and its speed edits the selected zone', () => {
    render(<Page start={{ zonesOn: true }} />)
    const g = group()
    expect(within(g).getByRole('button', { name: /^Near/ })).toHaveTextContent('48 %4 · 9 h0–200 m')
    expect(within(g).getByRole('button', { name: /^Far/ })).toHaveTextContent('same as near')
    expect(within(g).queryByText(/^Read it out to half the distance/)).toBeNull()
    fireEvent.click(within(g).getByRole('button', { name: /^Far/ }))
    fireEvent.click(within(g).getByRole('button', { name: 'Wind speed: more' }))
    expect(latest.current.windFar).toEqual({ ms: 4.5, clock: 9 })
    expect(latest.current.windMs).toBe(4)
    fireEvent.click(within(g).getByRole('button', { name: 'Same as near' }))
    expect(latest.current.windFar).toBeNull()
  })
})
