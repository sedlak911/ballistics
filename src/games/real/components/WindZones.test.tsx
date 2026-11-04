import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoute } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { DEFAULT_SETUP, type RealSetup } from '../setup'
import type { ZoneName } from '../zones'
import { WindZones } from './WindZones'

const SETUP: RealSetup = { ...DEFAULT_SETUP, distanceM: 1500, windMs: 4, windClock: 9, windSet: true, zonesOn: true, windMid: { ms: 3, clock: 9 } }

function Strip({ setup = SETUP, weights = [48, 37, 15], onSelect }: { setup?: RealSetup; weights?: number[] | null; onSelect?: (z: ZoneName) => void }) {
  const [route, navigate] = useRoute()
  const [sel, setSel] = useState<ZoneName>('near')
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <WindZones setup={setup} system="metric" windUnit="m/s" weights={weights} selected={sel} onSelect={(z) => { setSel(z); onSelect?.(z) }} />
    </SettingsProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/real/workbench'
})
afterEach(cleanup)

describe('WindZones', () => {
  it('draws the speed and hour of a zone with its own wind and "same as near" for the rest', () => {
    render(<Strip />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: /^Middle/ })).toHaveTextContent('3 · 9 h')
    expect(screen.getByRole('button', { name: /^Far/ })).toHaveTextContent('same as near')
  })

  it('selects a cell on a tap', () => {
    const onSelect = vi.fn()
    render(<Strip onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /^Far/ }))
    expect(onSelect).toHaveBeenCalledWith('far')
    expect(screen.getByRole('button', { name: /^Far/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Near/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('leaves the weight out when the shot has none', () => {
    render(<Strip weights={null} />)
    expect(screen.getByRole('button', { name: /^Near/ })).not.toHaveTextContent('%')
  })

  it('draws two cells at 1250 m, halves of the distance rounded to 10 m', () => {
    render(<Strip setup={{ ...SETUP, distanceM: 1250 }} weights={[60, 40]} />)
    expect(screen.getByRole('button', { name: /^Near/ })).toHaveTextContent('0–630 m')
    expect(screen.getByRole('button', { name: /^Far/ })).toHaveTextContent('630–1250 m')
  })
})
