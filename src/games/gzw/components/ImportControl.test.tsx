import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../../router'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { byName, gzw } from '../data'
import { ImportControl } from './ImportControl'

vi.mock('../ocr/recognize', () => ({ recognize: vi.fn(async () => ['M4A1']) }))

function show() {
  render(
    <SettingsProvider route={parseHash('#/gzw/workbench')} navigate={() => {}}>
      <ImportControl currentWeapon={byName(gzw.weapons, 'M700')!} onApply={() => {}} />
    </SettingsProvider>,
  )
  return screen.getByRole('button', { name: 'Import from clipboard (Ctrl+V)' })
}

function clipboardHolds(type: string) {
  const item = { types: [type], getType: async () => new Blob(['x'], { type }) }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: vi.fn(async () => [item]) } })
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
})

describe('ImportControl', () => {
  it('reads a screenshot from the clipboard on click', async () => {
    clipboardHolds('image/png')
    fireEvent.click(show())
    expect(await screen.findByText('Found in the screenshot')).toBeInTheDocument()
  })

  it('says when the clipboard holds no image', async () => {
    clipboardHolds('text/plain')
    fireEvent.click(show())
    expect(await screen.findByText(/No image on the clipboard/)).toBeInTheDocument()
  })

  it('opens the file picker where the browser cannot read the clipboard', () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(show())
    expect(pick).toHaveBeenCalled()
  })

  it('keeps the help in the hover title', () => {
    expect(show()).toHaveAttribute('title', expect.stringContaining('Ctrl+V'))
  })
})
