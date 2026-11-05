import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import { BottomBar } from './BottomBar'

const latest = { current: DEFAULT_SETUP }

function Page({ start }: { start?: Partial<RealSetup> }) {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, distanceM: 1500, windMs: 4, windClock: 9, windSet: true, ...start })
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

  it('has the ? and the zones icon from 1000 m, and no strip while the zones are off', () => {
    render(<Page />)
    expect(within(group()).getByRole('button', { name: 'How to read the wind' })).toBeInTheDocument()
    expect(within(group()).getByRole('button', { name: 'Wind zones' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group()).queryByRole('button', { name: /^Near/ })).toBeNull()
    expect(within(group()).getByText(/^Read it out to half the distance/)).toBeInTheDocument()
  })

  it('has only the ? under 1000 m', () => {
    render(<Page start={{ distanceM: 950 }} />)
    expect(within(group()).getByRole('button', { name: 'How to read the wind' })).toBeInTheDocument()
    expect(within(group()).queryByRole('button', { name: 'Wind zones' })).toBeNull()
  })

  it('shows the strip at 1500 m with the zones on, and its speed edits the selected zone', () => {
    render(<Page start={{ zonesOn: true }} />)
    const g = group()
    expect(within(g).getByRole('button', { name: /^Near/ })).toHaveTextContent('48 %4 · 9 h0–500 m')
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

describe('what glows until it is set', () => {
  const labelOf = (name: string) => screen.getByLabelText(name).closest('.number-field')!.querySelector('label')!

  it('lights the Direction and Wind speed labels with no direction and no wind', () => {
    render(<Page start={{ windSet: false, windMs: 0 }} />)
    expect(labelOf('Direction')).toHaveClass('glow-want')
    expect(screen.getByLabelText('Wind speed')).toHaveClass('glow-want')
  })

  it('lights Use instead of the speed with a forecast and a direction', () => {
    localStorage.setItem('gb.real.station', JSON.stringify({
      v: 1, heightAboveGroundM: { value: 1, source: 'manual' }, azimuthDeg: { value: 90, source: 'manual' },
      model: { time: '2026-11-03T12:00', fetchedAt: 0, windMs10: 3.1, windFromDeg: 180 },
    }))
    render(<Page start={{ windSet: false, windMs: 0 }} />)
    expect(screen.getByRole('button', { name: 'Use' })).toHaveClass('glow-want')
    expect(screen.getByLabelText('Wind speed')).not.toHaveClass('glow-want')
    expect(labelOf('Direction')).not.toHaveClass('glow-want')
  })
})
