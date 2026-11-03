import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import type { ToastInput } from '../../../components/Toast'
import { translate, type TKey } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import { PRESETS } from '../data/presets'
import { readLinkOverrides, resolvePreset, writeLinkOverrides, type Overrides } from '../profiles'
import { NBSP, sectionSummary } from './realText'

// The last toast the page asked for, its Undo included, so a test can run the Undo after the toast has gone.
const shown = vi.hoisted(() => ({ last: null as ToastInput | null }))
vi.mock('../../../components/useToast', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../components/useToast')>()
  return {
    useToast: () => {
      const toast = real.useToast()
      return { ...toast, show: (input: ToastInput) => { shown.last = input; toast.show(input) } }
    },
  }
})

function open(hash = '#/real/workbench?p=p7&d=800') {
  window.location.hash = hash
  return render(<App />)
}

const tag = (name: RegExp) => within(screen.getByTestId('real-strip')).getByRole('button', { name })
const sheet = () => screen.getByRole('dialog', { name: 'Settings' })
const section = (title: string) => within(sheet()).getByRole('region', { name: title })
/** A section's header: the one button named by the title, with the `{n} yours` chip after it when there is one. */
const header = (title: string) => within(section(title)).getByRole('button', { name: new RegExp(`^${title}( \\d+ yours)?$`) })
const keep = (o: object) => localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: o }))

afterEach(cleanup)

describe('RealSettings: the sheet', () => {
  it('opens on the round tag with only Round expanded', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    expect(sheet()).toHaveAttribute('aria-modal', 'true')
    expect(header('Round')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Rifle')).toHaveAttribute('aria-expanded', 'false')
    expect(header('Scope')).toHaveAttribute('aria-expanded', 'false')
    expect(tag(/^Round:/)).toHaveAttribute('aria-expanded', 'true')
    expect(tag(/^Scope:/)).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Rifle details' })).toBeNull()
  })

  it('expands several sections at once', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(header('Rifle'))
    expect(header('Rifle')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Round')).toHaveAttribute('aria-expanded', 'true')
    expect(within(section('Rifle')).getByLabelText('Twist')).toBeInTheDocument()
    expect(within(section('Round')).getByLabelText('Muzzle velocity')).toBeInTheDocument()
    fireEvent.click(header('Rifle'))
    expect(header('Rifle')).toHaveAttribute('aria-expanded', 'false')
    expect(within(section('Rifle')).queryByLabelText('Twist')).not.toBeInTheDocument()
  })

  // Review focus 3: back to the tag that opened it, also when reopened from another one.
  it('returns focus to the tag that opened it', () => {
    open()
    fireEvent.click(tag(/^Round:/))
    expect(sheet().contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tag(/^Round:/)).toHaveFocus()
    fireEvent.click(tag(/^Scope:/))
    expect(header('Scope')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tag(/^Scope:/)).toHaveFocus()
    expect(tag(/^Scope:/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps Tab inside the sheet', () => {
    open()
    fireEvent.click(tag(/^Scope:/))
    const all = [...sheet().querySelectorAll<HTMLElement>('button:not([disabled]), input')]
    all[all.length - 1].focus()
    fireEvent.keyDown(all[all.length - 1], { key: 'Tab' })
    expect(all[0]).toHaveFocus()
    fireEvent.keyDown(all[0], { key: 'Tab', shiftKey: true })
    expect(all[all.length - 1]).toHaveFocus()
  })

  it('shows the sight height in Scope and truing collapsed in Round', () => {
    open()
    fireEvent.click(tag(/^Scope:/))
    expect(within(section('Scope')).getByLabelText('Sight height')).toBeInTheDocument()
    fireEvent.click(header('Round'))
    const truing = within(section('Round')).getByRole('button', { name: 'True the muzzle velocity' })
    expect(truing).toHaveAttribute('aria-expanded', 'false')
    expect(within(section('Round')).queryByLabelText('Dial needed (MRAD)')).not.toBeInTheDocument()
    fireEvent.click(truing)
    expect(truing).toHaveAttribute('aria-expanded', 'true')
    expect(within(section('Round')).getByLabelText('Dial needed (MRAD)')).toBeInTheDocument()
    expect(within(section('Round')).getByRole('button', { name: 'True it' })).toBeInTheDocument()
  })

  it('counts what is yours on the header', () => {
    keep({ p7: { bc: 0.3, dragModel: 'G1' } })
    open()
    fireEvent.click(tag(/^Rifle:/))
    expect(within(header('Round')).getByText('1 yours')).toBeInTheDocument()
    expect(within(header('Rifle')).queryByText(/yours/)).not.toBeInTheDocument()
    expect(within(header('Scope')).queryByText(/yours/)).not.toBeInTheDocument()
  })

  it('picks a rifle in place and stays open on the new preset', () => {
    open()
    fireEvent.click(tag(/^Rifle:/))
    const pick = within(section('Rifle')).getByRole('button', { name: 'AI AXSR / AXMC .338 27″' })
    expect(pick).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(pick)
    const list = within(section('Rifle')).getByRole('group', { name: 'Rifle' })
    fireEvent.click(within(list).getByRole('button', { name: 'Desert Tech HTI' }))
    expect(window.location.hash).toContain('p=p8')
    expect(sheet()).toBeInTheDocument()
    expect(within(section('Rifle')).queryByRole('group', { name: 'Rifle' })).not.toBeInTheDocument()
    const again = within(section('Rifle')).getByRole('button', { name: 'Desert Tech HTI' })
    expect(again).toHaveFocus()
    expect(header('Rifle')).toHaveAccessibleDescription(/^Desert Tech HTI · 29″/)
  })

  it('summarises each section in its header', () => {
    open('#/real/workbench?p=p7&d=800&l=cs')
    fireEvent.click(tag(/^Munice:/))
    expect(screen.getByRole('dialog', { name: 'Nastavení' })).toBeInTheDocument()
    const optika = within(screen.getByRole('dialog')).getByRole('region', { name: 'Optika' })
    expect(within(optika).getAllByRole('button')[0]).toHaveAccessibleDescription(`MRAD · klik 0,1 · nástřel 100${NBSP}m · záměrná 60${NBSP}mm`)
  })
})

describe('RealSettings: reset per section, with undo', () => {
  const stored = () => JSON.parse(localStorage.getItem('gb.real.profiles') ?? '{"presets":{}}').presets as Record<string, Overrides>
  const link = (o: Overrides) => `o=${writeLinkOverrides(o)}`
  const linkInUrl = () => readLinkOverrides(new URLSearchParams(window.location.hash.split('?')[1]).get('o'))
  const note = () => screen.queryByText('Values from the shared link')
  /** The toast: the status line in the open sheet's toast slot, else on <body> itself; not one of the page's or the sheet's own. */
  const toast = () => screen.queryAllByRole('status')
    .find((el) => el.parentElement === document.body || el.parentElement!.classList.contains('toast-slot')) ?? null
  const undo = () => fireEvent.click(within(toast()!).getByRole('button', { name: 'Undo' }))
  const expand = (title: string) => {
    if (header(title).getAttribute('aria-expanded') === 'false') fireEvent.click(header(title))
    return section(title)
  }
  const field = (s: HTMLElement, label: string) => within(s).getByLabelText(label).closest<HTMLElement>('.rm-field')!
  const resetButton = (title: string, name: string) => within(expand(title)).getByRole('button', { name })
  const pickRifle = (name: string) => {
    const rifle = expand('Rifle')
    fireEvent.click(within(rifle).getByRole('button', { expanded: false }))
    fireEvent.click(within(within(rifle).getByRole('group', { name: 'Rifle' })).getByRole('button', { name }))
  }
  const type = (el: HTMLElement, text: string) => {
    fireEvent.change(el, { target: { value: text } })
    fireEvent.blur(el)
  }
  /** What the formulas give: the elevation, its clicks and what is left over, and the windage. */
  const answer = () => ['real-elevation', 'real-dial-line', 'real-windage'].map((id) => screen.getByTestId(id).textContent)

  it('resets only the round and undoes it', () => {
    keep({ p7: { twistIn: 8, bc: 0.3, zeroM: 300 } })
    open()
    fireEvent.click(tag(/^Round:/))
    const button = resetButton('Round', '↺ Reset the round to the preset')
    button.focus()
    fireEvent.click(button)
    expect(stored().p7).toEqual({ twistIn: 8, zeroM: 300 })
    expect(toast()).toHaveTextContent(/^Round reset to the preset/)
    // The button goes with the values; the focus stays in the sheet, on the section's header.
    expect(within(section('Round')).queryByRole('button', { name: '↺ Reset the round to the preset' })).not.toBeInTheDocument()
    expect(header('Round')).toHaveFocus()
    undo()
    expect(stored().p7).toEqual({ twistIn: 8, bc: 0.3, zeroM: 300 })
    expect(toast()).toBeNull()
    expect(within(field(section('Round'), 'BC')).getByText('yours')).toBeInTheDocument()
  })

  it('shows the toast inside the open sheet: Undo is in its Tab order, and the focus stays in it after Undo', () => {
    keep({ p7: { bc: 0.3 } })
    open()
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(resetButton('Round', '↺ Reset the round to the preset'))
    const undoButton = within(sheet()).getByRole('button', { name: 'Undo' })
    expect(sheet()).toContainElement(toast())
    expect(toast()).toHaveTextContent(/^Round reset to the preset/)
    // The sheet's last control: Tab from it comes round to the first, Shift+Tab from the first back to it.
    const all = [...sheet().querySelectorAll<HTMLElement>('button:not([disabled]), input')]
    expect(all[all.length - 1]).toBe(undoButton)
    undoButton.focus()
    fireEvent.keyDown(undoButton, { key: 'Tab' })
    expect(all[0]).toHaveFocus()
    fireEvent.keyDown(all[0], { key: 'Tab', shiftKey: true })
    expect(undoButton).toHaveFocus()
    fireEvent.click(undoButton)
    expect(stored().p7).toEqual({ bc: 0.3 })
    expect(toast()).toBeNull()
    expect(document.activeElement).not.toBe(document.body)
    expect(sheet()).toContainElement(document.activeElement as HTMLElement)
  })

  it('closing the sheet while the toast shows moves the toast to the body, with no error', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      keep({ p7: { bc: 0.3 } })
      open()
      fireEvent.click(tag(/^Round:/))
      fireEvent.click(resetButton('Round', '↺ Reset the round to the preset'))
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Close settings' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(toast()!.parentElement).toBe(document.body)
      expect(screen.getAllByText('Round reset to the preset')).toHaveLength(1)
      undo()
      expect(stored().p7).toEqual({ bc: 0.3 })
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('hides the reset when the section has nothing of yours', () => {
    open()
    fireEvent.click(tag(/^Rifle:/))
    for (const title of ['Rifle', 'Round', 'Scope']) expect(within(expand(title)).queryByRole('button', { name: /^↺/ })).not.toBeInTheDocument()
    // The whole-preset reset is gone.
    expect(screen.queryByRole('button', { name: 'Reset to preset' })).not.toBeInTheDocument()
    cleanup()
    keep({ p7: { bc: 0.3 } })
    open()
    fireEvent.click(tag(/^Rifle:/))
    expect(within(expand('Rifle')).queryByRole('button', { name: /^↺/ })).not.toBeInTheDocument()
    expect(within(expand('Scope')).queryByRole('button', { name: /^↺/ })).not.toBeInTheDocument()
    expect(resetButton('Round', '↺ Reset the round to the preset')).toBeInTheDocument()
  })

  it('shows the scope\'s reset for a click saved in the other unit, which no field shows, and clears it', () => {
    keep({ p7: { clickValue: 0.125, scopeUnit: 'moa' } })
    open()
    fireEvent.click(tag(/^Scope:/))
    expect(header('Scope')).toHaveAccessibleName('Scope')
    fireEvent.click(resetButton('Scope', '↺ Reset the scope to the preset'))
    expect(stored().p7).toBeUndefined()
    expect(toast()).toHaveTextContent(/^Scope reset to the preset/)
  })

  it('drops the preset from storage when nothing is left', () => {
    keep({ p7: { bc: 0.3 } })
    open()
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(resetButton('Round', '↺ Reset the round to the preset'))
    expect(JSON.parse(localStorage.getItem('gb.real.profiles')!).presets).not.toHaveProperty('p7')
    expect(linkInUrl()).toBeNull()
  })

  // Review focus 1: a section reset on a shared-link view must not move the other sections.
  it('keeps the other sections\' values on a shared-link view', () => {
    const at = '#/real/workbench?p=p7&d=1000&ws=3&wc=9'
    open(`${at}&${link({ twistIn: 8, bc: 0.3 })}`)
    fireEvent.click(tag(/^Round:/))
    expect(within(field(expand('Rifle'), 'Twist')).getByText('from link')).toBeInTheDocument()
    fireEvent.click(resetButton('Round', '↺ Reset the round to the preset'))
    const twist = field(section('Rifle'), 'Twist')
    expect(within(twist).getByLabelText('Twist')).toHaveValue('8')
    expect(within(twist).getByText('yours')).toBeInTheDocument()
    expect(within(twist).queryByText('from link')).not.toBeInTheDocument()
    expect(note()).not.toBeInTheDocument()
    expect(stored().p7).toEqual({ twistIn: 8 })
    expect(linkInUrl()).toEqual({ twistIn: 8 })
    const after = answer()
    // The answer is the one a stored twist of 8 alone gives.
    cleanup()
    keep({ p7: { twistIn: 8 } })
    open(at)
    expect(answer()).toEqual(after)
  })

  it('on a shared-link view, a rifle reset keeps the round and the scope, and Undo brings the twist back as yours', () => {
    const at = '#/real/workbench?p=p7&d=1000&ws=3&wc=9'
    open(`${at}&${link({ twistIn: 8, bc: 0.3, sightHeightMm: 65 })}`)
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(resetButton('Rifle', '↺ Reset the rifle to the preset'))
    expect(stored().p7).toEqual({ bc: 0.3, sightHeightMm: 65 })
    expect(within(field(expand('Round'), 'BC')).getByLabelText('BC')).toHaveValue('0.3')
    expect(within(field(section('Round'), 'BC')).getByText('yours')).toBeInTheDocument()
    expect(within(field(expand('Scope'), 'Sight height')).getByLabelText('Sight height')).toHaveValue('65')
    expect(within(field(section('Scope'), 'Sight height')).getByText('yours')).toBeInTheDocument()
    expect(within(sheet()).queryByText('from link')).not.toBeInTheDocument()
    const after = answer()
    undo()
    expect(stored().p7).toEqual({ bc: 0.3, sightHeightMm: 65, twistIn: 8 })
    expect(within(field(section('Rifle'), 'Twist')).getByText('yours')).toBeInTheDocument()
    expect(linkInUrl()).toEqual(stored().p7)
    cleanup()
    keep({ p7: { bc: 0.3, sightHeightMm: 65 } })
    open(at)
    expect(answer()).toEqual(after)
  })

  it('on a shared-link view with different stored values, a rifle reset keeps the link\'s round and scope on screen', () => {
    keep({ p7: { bc: 0.25, sightHeightMm: 50, twistIn: 9 } })
    open(`#/real/workbench?p=p7&d=1000&ws=3&wc=9&${link({ twistIn: 8, bc: 0.3, sightHeightMm: 65 })}`)
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(resetButton('Rifle', '↺ Reset the rifle to the preset'))
    expect(within(field(expand('Round'), 'BC')).getByLabelText('BC')).toHaveValue('0.3')
    expect(within(field(section('Round'), 'BC')).getByText('yours')).toBeInTheDocument()
    expect(within(field(expand('Scope'), 'Sight height')).getByLabelText('Sight height')).toHaveValue('65')
    expect(within(field(section('Scope'), 'Sight height')).getByText('yours')).toBeInTheDocument()
    expect(stored().p7).toEqual({ bc: 0.3, sightHeightMm: 65 })
  })

  it('an Undo acts on the page as it is then: an edit in another section and a new distance stay', () => {
    open(`#/real/workbench?p=p7&d=800&${link({ twistIn: 8, bc: 0.3 })}`)
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(resetButton('Round', '↺ Reset the round to the preset'))
    type(within(expand('Rifle')).getByLabelText('Twist'), '9')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Distance: more' }))
    expect(window.location.hash).toContain('d=810')
    undo()
    expect(stored().p7).toEqual({ twistIn: 9, bc: 0.3 })
    expect(window.location.hash).toContain('d=810')
  })

  it('does nothing on undo after the preset changed', () => {
    keep({ p7: { twistIn: 8, bc: 0.3 } })
    open()
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(resetButton('Round', '↺ Reset the round to the preset'))
    const run = shown.last!.action!.run
    expect(stored()).toEqual({ p7: { twistIn: 8 } })
    pickRifle('CZ BREN 2 14″')
    expect(window.location.hash).toContain('p=p1')
    expect(toast()).toBeNull()
    act(run)
    expect(stored()).toEqual({ p7: { twistIn: 8 } })
    // Back on the preset the Undo was for: it is still withdrawn.
    pickRifle('AI AXSR / AXMC .338 27″')
    expect(window.location.hash).toContain('p=p7')
    expect(toast()).toBeNull()
    act(run)
    expect(stored()).toEqual({ p7: { twistIn: 8 } })
  })

  it('speaks Czech', () => {
    keep({ p7: { bc: 0.3 } })
    open('#/real/workbench?p=p7&d=800&l=cs')
    fireEvent.click(tag(/^Munice:/))
    const munice = within(screen.getByRole('dialog', { name: 'Nastavení' })).getByRole('region', { name: 'Munice' })
    fireEvent.click(within(munice).getByRole('button', { name: '↺ Vrátit munici na předvolbu' }))
    expect(toast()).toHaveTextContent(/^Munice vrácena na předvolbu/)
    expect(within(toast()!).getByRole('button', { name: 'Zpět' })).toBeInTheDocument()
  })
})

describe('sectionSummary', () => {
  const t = (lang: Lang) => (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
  const preset = (id: string) => resolvePreset(PRESETS.find((p) => p.id === id)!, undefined)

  it('summarises each section', () => {
    const p7 = preset('p7')
    expect(sectionSummary('rifle', p7, 'mil', 'metric', t('cs'), 'cs')).toBe(`AI AXSR / AXMC .338 · 27″ · 1:9,35″ · 1${NBSP}MOA`)
    expect(sectionSummary('round', p7, 'mil', 'metric', t('cs'), 'cs')).toBe(`.338 LM Scenar 250 · G7 0,322 · 900${NBSP}m/s`)
    expect(sectionSummary('scope', p7, 'mil', 'metric', t('cs'), 'cs')).toBe(`MRAD · klik 0,1 · nástřel 100${NBSP}m · záměrná 60${NBSP}mm`)
    expect(sectionSummary('scope', p7, 'mil', 'metric', t('en'), 'en')).toBe(`MRAD · click 0.1 · zero 100${NBSP}m · sight 60${NBSP}mm`)
  })

  it('shows a table drag by its word, a barrel without a length in the name by its value, and imperial lengths', () => {
    expect(sectionSummary('round', preset('p9'), 'mil', 'metric', t('en'), 'en')).toBe(`12.7×99 M33 647 · measured Cd curve · 850${NBSP}m/s`)
    expect(sectionSummary('rifle', preset('p3'), 'mil', 'metric', t('en'), 'en')).toMatch(new RegExp(`^CZ BREN 2 PPS · 475${NBSP}mm · 1:`))
    expect(sectionSummary('scope', preset('p7'), 'moa', 'imperial', t('en'), 'en')).toBe(`MOA · click ¼ · zero 109${NBSP}yd · sight 2.36${NBSP}in`)
  })
})

describe('RealSettings: share', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const stub = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
  const status = () => screen.queryAllByRole('status')
    .find((el) => el.parentElement === document.body || el.parentElement!.classList.contains('toast-slot')) ?? null
  const share = () => {
    open()
    fireEvent.click(tag(/^Rifle/))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Share settings' }))
  }

  afterEach(() => {
    vi.useRealTimers()
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else delete (navigator as { clipboard?: unknown }).clipboard
  })

  it('copies the link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stub({ writeText })
    share()
    expect(writeText).toHaveBeenCalledWith(location.href)
    expect(await within(sheet()).findByText('Link copied')).toBeTruthy()
    expect(status()!.textContent).toContain('Link copied')
  })

  it('shows the link to copy by hand when the clipboard refuses', async () => {
    stub({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    vi.useFakeTimers()
    share()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(status()!.textContent).toContain('Copy the link from the field')
    expect((within(status()!).getByRole('textbox') as HTMLInputElement).value).toBe(location.href)
    expect(within(status()!).getByRole('button', { name: 'Close' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(status()!.textContent).toContain('Copy the link from the field')
  })

  it('takes the copy-by-hand toast with it when the sheet closes, and the focus returns to the tag', async () => {
    stub({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    share()
    await act(async () => { await Promise.resolve() })
    expect(status()!.textContent).toContain('Copy the link from the field')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(status()).toBeNull()
    expect(tag(/^Rifle/)).toHaveFocus()
  })

  it('keeps a timed toast, a reset\'s Undo, after the sheet closes', () => {
    localStorage.setItem('gb.real.profiles', JSON.stringify({ v: 1, presets: { p7: { bc: 0.3 } } }))
    open()
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(within(within(sheet()).getByRole('region', { name: 'Round' })).getByRole('button', { name: '↺ Reset the round to the preset' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(within(status()!).getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('falls back when there is no clipboard', () => {
    stub(undefined)
    share()
    expect(status()!.textContent).toContain('Copy the link from the field')
    expect((within(status()!).getByRole('textbox') as HTMLInputElement).value).toBe(location.href)
  })
})
