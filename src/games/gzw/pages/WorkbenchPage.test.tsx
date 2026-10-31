import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { readingScale } from '../../../engine/ranging'

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

const strip = () => screen.getByTestId('setup-strip')

beforeEach(() => {
  localStorage.setItem('gb.gzw.profile', JSON.stringify({ setupDone: true }))
})
afterEach(cleanup)

describe('WorkbenchPage', () => {
  it('opens on the M700 with M80A1 by default', () => {
    open('#/gzw/workbench')
    expect(strip()).toHaveTextContent('M700')
    expect(strip()).toHaveTextContent('M80A1')
    expect(screen.getAllByText('MIL').length).toBeGreaterThan(0)
  })

  it('opens on a standing target at 100 m with a 100 m zero', () => {
    open('#/gzw/workbench')
    expect(window.location.hash).toContain('d=100')
    expect(window.location.hash).toContain('mv=standing')
    expect(window.location.hash).toContain('z=100')
  })

  it('says "hold under" when the target is closer than the zero, on the scope too', () => {
    open('#/gzw/workbench?z=300&d=100')
    expect(screen.getByText('Hold under')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /FFP/ })).toHaveTextContent(/HOLD UNDER/)
    cleanup()
    open('#/gzw/workbench?z=100&d=300')
    expect(screen.getByRole('img', { name: /FFP/ })).toHaveTextContent(/HOLD OVER/)
  })

  it('shows distances in yards in imperial mode', () => {
    open('#/gzw/workbench?u=imperial&d=400')
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('437 yd')
  })

  it('reopens the last setup when the link carries none, and puts it back in the link', () => {
    open('#/gzw/workbench?w=sks&d=600')
    cleanup()
    open('#/gzw/workbench')
    expect(strip()).toHaveTextContent('SKS')
    expect(window.location.hash).toContain('w=sks')
    expect(window.location.hash).toContain('d=600')
  })

  it('says to shoot at a standing head at 100 m', () => {
    open('#/gzw/workbench?d=100&mv=standing&rs=3')
    expect(screen.getByTestId('focus-verdict')).toHaveTextContent('Shoot')
    expect(screen.getByTestId('focus-sentence')).toHaveTextContent(/^Head:/)
    expect(parseInt(screen.getByTestId('focus-sentence').querySelector('.num')!.textContent!, 10)).toBeGreaterThanOrEqual(90)
  })

  it('names no biggest error when fixing none would move the chance', () => {
    open('#/gzw/workbench?d=100&mv=standing&rs=3')
    expect(screen.getByTestId('focus-sentence')).not.toHaveTextContent(/Biggest error/)
    expect(screen.getByTestId('focus-sentence')).toHaveTextContent(/chance to hit\.$/)
  })

  it('gives a prone target a lower chance than a standing one', () => {
    open('#/gzw/workbench?d=400&po=standing')
    const chance = () => Number(screen.getByTestId('focus-sentence').textContent!.match(/(\d+)\s*%/)![1])
    const standing = chance()
    fireEvent.click(within(screen.getByRole('group', { name: 'Target' })).getByRole('button', { name: /Prone/ }))
    expect(chance()).toBeLessThan(standing)
  })

  it('says to close in on a sprinting head at 300 m', () => {
    open('#/gzw/workbench?d=300&mv=sprinting')
    expect(screen.getByTestId('focus-verdict')).toHaveTextContent(/Close in to|No good shot/)
    expect(screen.getByTestId('focus-sentence')).toHaveTextContent(/lead/i)
  })

  it('suggests a zero the game can set', () => {
    open('#/gzw/workbench?d=170')
    expect(screen.getByText(/or set zero to 150 m/)).toBeInTheDocument()
  })

  it('writes the distance certainty into the link', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: /±20 %/ }))
    expect(window.location.hash).toContain('rs=20')
  })

  const byHeight = () => fireEvent.click(within(screen.getByRole('group', { name: 'Range by' })).getByRole('button', { name: 'MIL' }))
  // The height slider runs on a log scale from the reference's size at 1000 m to its size at 50 m (in MIL).
  const spans = (mil: number, sizeM: number) =>
    fireEvent.change(screen.getByLabelText(/ spans \(MIL\)$/), { target: { value: String(readingScale(sizeM, sizeM * 20).toPos(mil)) } })

  it('turns the height of a standing person in mils into distance, keeping the certainty you chose', () => {
    open('#/gzw/workbench')
    fireEvent.click(screen.getByRole('button', { name: /±20 %/ }))
    byHeight()
    spans(6, 1.8)
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('300 m')
    expect(window.location.hash).toContain('rs=20')
    expect(screen.getByRole('button', { name: /±20 %/ })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('gb.gzw.profile')).toContain('"rangeBy":"height"')
  })

  it('steps the height reading with the arrow keys, even at close range', () => {
    open('#/gzw/workbench?d=100&mv=standing')
    byHeight()
    const slider = screen.getByLabelText('Standing figure (1.8 m) spans (MIL)')
    expect(slider).toHaveAttribute('aria-valuetext', '18.0 MIL')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(slider).toHaveAttribute('aria-valuetext', '17.95 MIL')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(slider).toHaveAttribute('aria-valuetext', '17.9 MIL')
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('101 m')
  })

  it('ranges the whole figure: no reference to pick, no guide button', () => {
    open('#/gzw/workbench')
    byHeight()
    expect(screen.queryByRole('group', { name: 'What I measure' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /How to read mil-dots/ })).not.toBeInTheDocument()
  })

  it('keeps a prone target still and ranges it by its length', () => {
    open('#/gzw/workbench?mv=sprinting')
    fireEvent.click(within(screen.getByRole('group', { name: 'Target' })).getByRole('button', { name: /Prone/ }))
    expect(window.location.hash).toContain('po=prone')
    expect(window.location.hash).toContain('mv=standing')
    expect(document.querySelector('[data-pose="prone"]')).not.toBeNull()
    byHeight()
    expect(screen.getByLabelText('Prone figure (1.8 m long) spans (MIL)')).toBeInTheDocument()
    spans(6, 1.8)
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('300 m')
  })

  it('keeps a kneeling target still and ranges it by its kneeling height', () => {
    open('#/gzw/workbench?mv=sprinting')
    const target = screen.getByRole('group', { name: 'Target' })
    fireEvent.click(within(target).getByRole('button', { name: /Kneeling/ }))
    expect(window.location.hash).toContain('po=kneeling')
    expect(window.location.hash).toContain('mv=standing')
    expect(document.querySelector('[data-pose="kneeling"]')).not.toBeNull()
    byHeight()
    expect(screen.getByLabelText('Kneeling figure (1.2 m) spans (MIL)')).toBeInTheDocument()
    spans(4, 1.2)
    expect(screen.getByTestId('distance-readout')).toHaveTextContent('300 m')
    fireEvent.click(within(target).getByRole('button', { name: /Sprinting/ }))
    expect(window.location.hash).toContain('po=standing')
    expect(window.location.hash).toContain('mv=sprinting')
  })

  it('sets my stance beside the target in the toolbar: standing, kneeling or prone', () => {
    open('#/gzw/workbench?d=200')
    const me = screen.getByRole('group', { name: 'Me' })
    expect(within(me).getAllByRole('button').map((b) => b.textContent)).toEqual(['Standing', 'Kneeling', 'Prone'])
    expect(within(me).getByRole('button', { name: 'Kneeling' })).toHaveAttribute('aria-pressed', 'true')
    expect(me).toHaveTextContent(/^Me/)
    expect(screen.getByRole('group', { name: 'Target' })).toHaveTextContent(/^Target/)
    const chance = () => Number(screen.getByTestId('focus-sentence').textContent!.match(/(\d+)\s*%/)![1])
    fireEvent.click(within(me).getByRole('button', { name: 'Standing' }))
    const standing = chance()
    fireEvent.click(within(me).getByRole('button', { name: 'Prone' }))
    expect(chance()).toBeGreaterThan(standing)
    expect(localStorage.getItem('gb.gzw.profile')).toContain('"steadiness":"prone"')
    expect(screen.queryByRole('button', { name: 'Supported' })).not.toBeInTheDocument()
  })

  it('puts distance and movement in a sticky bar on a phone', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 699px)', media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    }))
    try {
      open('#/gzw/workbench?dir=1&mv=walking')
      const dock = screen.getByTestId('dock')
      expect(within(dock).getByTestId('distance-readout')).toBeInTheDocument()
      expect(within(dock).getByRole('button', { name: /Sprinting/ })).toBeInTheDocument()
      expect(within(dock).queryByRole('group', { name: 'Me' })).not.toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Me' })).toBeInTheDocument()
      fireEvent.click(within(dock).getByRole('button', { name: 'Direction' }))
      expect(window.location.hash).toContain('dir=-1')
      fireEvent.click(within(dock).getByRole('button', { name: /Standing/ }))
      expect(within(dock).getByRole('button', { name: 'Direction' })).toBeDisabled()
      expect(within(screen.getByRole('group', { name: 'Crossing angle' })).getByRole('button', { name: '45°' })).toBeDisabled()
      expect(screen.getByRole('group', { name: 'Crossing angle' })).toHaveTextContent(/^Crossing angle90°45°Speed0\s?m\/s$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('names every toolbar control: range by, direction, crossing angle and the assumed speed', () => {
    open('#/gzw/workbench?mv=walking')
    expect(screen.getByRole('group', { name: 'Range by' }).parentElement).toHaveTextContent(/^Range bymMIL/)
    expect(screen.getByRole('group', { name: 'Direction' })).toHaveTextContent(/^Direction←→$/)
    const crossing = screen.getByRole('group', { name: 'Crossing angle' })
    expect(crossing).toHaveTextContent(/^Crossing angle90°45°Speed1\.5\s?m\/s$/)
    expect(within(crossing).getByText(/m\/s/).closest('[title]')).toHaveAttribute('title', 'Real-world running speeds, not measured in game')
  })

  it('turns off direction and crossing angle while the target stands still', () => {
    open('#/gzw/workbench?mv=walking&dir=1&x=90')
    const arrows = () => within(screen.getByRole('group', { name: 'Direction' })).getAllByRole('button')
    const angles = () => within(screen.getByRole('group', { name: 'Crossing angle' })).getAllByRole('button')
    const target = screen.getByRole('group', { name: 'Target' })
    for (const b of [...arrows(), ...angles()]) expect(b).toBeEnabled()
    for (const still of [/Standing/, /Kneeling/, /Prone/]) {
      fireEvent.click(within(target).getByRole('button', { name: still }))
      for (const b of [...arrows(), ...angles()]) expect(b).toBeDisabled()
    }
    fireEvent.click(within(target).getByRole('button', { name: /Jogging/ }))
    for (const b of [...arrows(), ...angles()]) expect(b).toBeEnabled()
    fireEvent.click(within(screen.getByRole('group', { name: 'Crossing angle' })).getByRole('button', { name: '45°' }))
    expect(window.location.hash).toContain('x=45')
  })

  it('says the weapon spread is left out when its accuracy is unknown', () => {
    open('#/gzw/workbench?w=sks')
    expect(screen.getByTestId('focus-sentence')).toHaveTextContent(/Weapon spread not counted/)
  })

  it('is the only page: no page links, and old links open the bench', () => {
    open('#/gzw/sheet')
    expect(strip()).toHaveTextContent('M700')
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it('says so when the aim point is outside the scope view', () => {
    open('#/gzw/workbench?d=800&mv=sprinting')
    expect(screen.getByText(/Beyond the scope view/)).toBeInTheDocument()
    cleanup()
    // Sprinting at 300 m needs about 7.3 MIL of lead: past the last hash, still in view.
    open('#/gzw/workbench?d=300&mv=sprinting')
    expect(screen.queryByText(/Beyond the scope view/)).not.toBeInTheDocument()
  })

  it('falls back to a compatible scope and ammo when the link carries foreign ones', () => {
    open('#/gzw/workbench?w=sks&am=7.62x51mm-fmj-m80')
    expect(strip()).not.toHaveTextContent('M80')
  })
})
