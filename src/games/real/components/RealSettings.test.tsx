import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import type { ToastInput } from '../../../components/Toast'
import { translate, type TKey } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import { PRESETS, presetsOfRifle, rifleIds } from '../data/presets'
import commonCustom from '../__fixtures__/profiles-with-custom-common.json'
import custom from '../__fixtures__/profiles-with-custom.json'
import { readLinkOverrides, resolvePreset, writeLinkOverrides, type Overrides } from '../profiles'
import { resolveSelection } from '../selection'
import { DEFAULT_SETUP } from '../setup'
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

  it('prints — for a missing required value, never the stand-in the incomplete selection holds', () => {
    const library = {
      v: 1 as const,
      rifles: [{ id: 'u-r', name: 'Custom' }],
      rounds: [{ id: 'u-o', rifleId: 'u-r', name: 'Custom', bc: 0.25, dragModel: 'G7' as const }, { id: 'u-n', rifleId: 'u-r', name: 'No BC', muzzleVelocityMs: 800, massGr: 150 }],
      scopes: [
        { id: 'u-s', rifleId: 'u-r', name: 'No zero', sightHeightMm: 55, clickValue: 0.25, scopeUnit: 'moa' as const },
        { id: 'u-t', rifleId: 'u-r', name: 'No click', zeroM: 200, scopeUnit: 'mil' as const },
      ],
    }
    const sel = (roundId: string, scopeId: string) => resolveSelection({ ...DEFAULT_SETUP, roundId, scopeId }, library, {}, undefined, new Set(), false)
    const a = sel('u-o', 'u-s')
    // The stand-ins are p7's 900 m/s and the generic 100 m zero.
    expect(a.preset.muzzleVelocityMs.value).toBe(900)
    expect(a.preset.zeroM).toBe(100)
    expect(sectionSummary('round', a.preset, 'moa', 'metric', t('en'), 'en', a.incomplete)).toBe('Custom · G7 0.25 · —')
    expect(sectionSummary('scope', a.preset, 'moa', 'metric', t('en'), 'en', a.incomplete)).toBe(`MOA · click ¼ · zero — · sight 55${NBSP}mm`)
    expect(sectionSummary('scope', a.preset, 'moa', 'metric', t('cs'), 'cs', a.incomplete)).toBe(`MOA · klik ¼ · nástřel — · záměrná 55${NBSP}mm`)
    const b = sel('u-n', 'u-t')
    expect(sectionSummary('round', b.preset, 'mil', 'metric', t('en'), 'en', b.incomplete)).toBe(`No BC · — · 800${NBSP}m/s`)
    expect(sectionSummary('scope', b.preset, 'mil', 'metric', t('en'), 'en', b.incomplete)).toBe(`MRAD · click — · zero 200${NBSP}m · sight —`)
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

describe('RealSettings: custom items', () => {
  const RIFLE = 'u-rifle-1'
  const ROUND = 'u-round-1'
  const SCOPE = 'u-scope-1'
  const HANDLOAD = { id: ROUND, rifleId: 'axsr', name: 'Handload 250', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880, massGr: 250 }
  const STEYR = { id: RIFLE, name: 'Steyr SSG 08' }
  const MOA_SCOPE = { id: SCOPE, rifleId: 'axsr', name: 'S&B 5-25', scopeUnit: 'moa', clickValue: 0.25, zeroM: 100, sightHeightMm: 55 }
  const onRound = `#/real/workbench?cr=${ROUND}&d=800`
  const onRifle = `#/real/workbench?cr=${ROUND}&cf=${RIFLE}&d=800`
  type Items = { rifles: Record<string, unknown>[]; rounds: Record<string, unknown>[]; scopes: Record<string, unknown>[] }
  const seed = (l: Partial<Items>) => localStorage.setItem('gb.real.library', JSON.stringify({ v: 1, rifles: [], rounds: [], scopes: [], ...l }))
  const lib = () => JSON.parse(localStorage.getItem('gb.real.library')!) as Items
  const expand = (title: string) => {
    if (header(title).getAttribute('aria-expanded') === 'false') fireEvent.click(header(title))
    return section(title)
  }
  /** A field's box by its label word, with or without the `optional` mark after it. */
  const input = (s: HTMLElement, label: string) =>
    within(s).getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}( optional)?$`)) as HTMLInputElement
  const field = (el: HTMLElement) => el.closest<HTMLElement>('.rm-field')!
  const type = (el: HTMLElement, text: string) => {
    fireEvent.change(el, { target: { value: text } })
    fireEvent.blur(el)
  }
  /** Opens a section's picker row, named by what it shows, and picks the row whose name matches. */
  const choose = (title: string, shown: string, name: RegExp) => {
    const s = expand(title)
    fireEvent.click(within(s).getByRole('button', { name: shown }))
    fireEvent.click(within(within(s).getByRole('group', { name: title })).getByRole('button', { name }))
  }
  const answer = () => ['real-elevation', 'real-dial-line', 'real-windage'].map((id) => screen.getByTestId(id).textContent)

  it('edits a custom round\'s mass into the library, not the preset overrides', () => {
    seed({ rounds: [HANDLOAD] })
    open(`${onRound}&u=imperial`)
    fireEvent.click(tag(/^Round:/))
    const mass = input(section('Round'), 'Bullet mass')
    expect(mass).toHaveValue('250')
    type(mass, '180')
    expect(lib().rounds[0].massGr).toBe(180)
    expect(localStorage.getItem('gb.real.profiles')).toBeNull()
    expect(input(section('Round'), 'Bullet mass')).toHaveValue('180')
    expect(within(field(input(section('Round'), 'Bullet mass'))).getByText('yours')).toBeInTheDocument()
  })

  it('marks a custom item\'s optional fields and leaves them empty', () => {
    seed({ rounds: [HANDLOAD] })
    open(onRound)
    fireEvent.click(tag(/^Round:/))
    for (const label of ['MV spread (SD)', 'Powder sensitivity', 'MV reference temperature']) {
      const box = input(section('Round'), label)
      expect(box.labels![0]).toHaveTextContent(`${label} optional`)
      expect(box).toHaveAttribute('placeholder', 'not set')
      expect(box).toHaveValue('')
      expect(box).toHaveAttribute('aria-invalid', 'false')
    }
    // A required field has no mark.
    expect(input(section('Round'), 'Muzzle velocity').labels![0]).toHaveTextContent(/^Muzzle velocity$/)
  })

  it('clears an optional field to not set', () => {
    seed({ rounds: [{ ...HANDLOAD, powderSensMsPerC: 1.2 }] })
    open(onRound)
    fireEvent.click(tag(/^Round:/))
    const sens = input(section('Round'), 'Powder sensitivity')
    expect(sens).toHaveValue('1.2')
    type(sens, '')
    expect(lib().rounds[0]).not.toHaveProperty('powderSensMsPerC')
    expect(input(section('Round'), 'Powder sensitivity')).toHaveValue('')
    expect(input(section('Round'), 'Powder sensitivity')).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows a stored out-of-range twist flagged', () => {
    seed({ rifles: [{ ...STEYR, twistIn: 50 }], rounds: [{ ...HANDLOAD, rifleId: RIFLE }] })
    open(onRifle)
    fireEvent.click(tag(/^Rifle:/))
    const twist = input(section('Rifle'), 'Twist')
    expect(twist).toHaveValue('50')
    expect(twist).toHaveAttribute('aria-invalid', 'true')
    expect(within(section('Rifle')).getByRole('alert')).toHaveTextContent('Type a value from 5 to 20')
    expect(lib().rifles[0].twistIn).toBe(50)
  })

  it('flags only a value the formulas skip, never one that rounds past the box\'s bounds in another unit', () => {
    // 80 mm is 3.15 in, over the box's 3.14; 1000 gr is 64.8 g, over its 64.79. Both are in range, so both count.
    seed({ rounds: [{ ...HANDLOAD, lengthMm: 80, massGr: 1000 }] })
    open(`${onRound}&u=imperial`)
    fireEvent.click(tag(/^Round:/))
    expect(input(section('Round'), 'Bullet length')).toHaveValue('3.15')
    expect(input(section('Round'), 'Bullet length')).toHaveAttribute('aria-invalid', 'false')
    cleanup()
    open(onRound)
    fireEvent.click(tag(/^Round:/))
    expect(input(section('Round'), 'Bullet mass')).toHaveValue('64.8')
    expect(input(section('Round'), 'Bullet mass')).toHaveAttribute('aria-invalid', 'false')
    expect(within(section('Round')).queryByRole('alert')).toBeNull()
  })

  it('keeps a twist edited under a custom round on the AXSR away from the AXSR\'s own round', () => {
    seed({ rounds: [HANDLOAD] })
    open(onRound)
    fireEvent.click(tag(/^Rifle:/))
    type(input(section('Rifle'), 'Twist'), '11')
    expect(lib().rounds[0].overrides).toEqual({ twistIn: 11 })
    expect(localStorage.getItem('gb.real.profiles')).toBeNull()
    choose('Round', 'Handload 250', /^Lapua Scenar 250 gr GB488$/)
    expect(window.location.hash).not.toContain('cr=')
    expect(input(section('Rifle'), 'Twist')).toHaveValue('9.35')
    choose('Round', 'Lapua Scenar 250 gr GB488', /^Handload 250/)
    expect(window.location.hash).toContain(`cr=${ROUND}`)
    expect(input(section('Rifle'), 'Twist')).toHaveValue('11')
  })

  it('offers no reset under a custom round', () => {
    keep({ p7: { twistIn: 8, bc: 0.3, zeroM: 300 } })
    seed({ rounds: [{ ...HANDLOAD, overrides: { zeroM: 200 } }] })
    open(onRound)
    fireEvent.click(tag(/^Rifle:/))
    for (const title of ['Rifle', 'Round', 'Scope']) expect(within(expand(title)).queryByRole('button', { name: /^↺/ })).not.toBeInTheDocument()
    // Back on the built-in round, its resets are there.
    choose('Round', 'Handload 250', /^Lapua Scenar 250 gr GB488$/)
    expect(within(section('Round')).getByRole('button', { name: '↺ Reset the round to the preset' })).toBeInTheDocument()
  })

  it('tags a zero kept with a custom round yours, and counts it; the round\'s own fields count nothing', () => {
    seed({ rounds: [{ ...HANDLOAD, overrides: { zeroM: 200 } }] })
    open(onRound)
    fireEvent.click(tag(/^Scope:/))
    expect(within(field(within(section('Scope')).getByRole('group', { name: 'Zero' }))).getByText('yours')).toBeInTheDocument()
    expect(within(header('Scope')).getByText('1 yours')).toBeInTheDocument()
    expect(header('Round')).toHaveAccessibleName('Round')
  })

  it('shows a custom scope\'s own values: no reset and no count for the preset\'s scope values it hides', () => {
    keep({ p7: { sightHeightMm: 70, zeroM: 300 } })
    seed({ scopes: [MOA_SCOPE] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=moa`)
    fireEvent.click(tag(/^Scope:/))
    expect(header('Scope')).toHaveAccessibleName('Scope')
    expect(within(section('Scope')).queryByRole('button', { name: /^↺/ })).not.toBeInTheDocument()
    expect(input(section('Scope'), 'Sight height')).toHaveValue('55')
    expect(input(section('Scope'), 'Name')).toHaveValue('S&B 5-25')
  })

  it('lists custom rifles first, each marked custom', () => {
    seed({ rifles: [STEYR], rounds: [{ ...HANDLOAD, rifleId: RIFLE }] })
    open()
    fireEvent.click(tag(/^Rifle:/))
    fireEvent.click(within(section('Rifle')).getByRole('button', { name: 'AI AXSR / AXMC .338 27″' }))
    const rows = within(within(section('Rifle')).getByRole('group', { name: 'Rifle' })).getAllByRole('button')
    expect(rows[0]).toHaveTextContent(/^Steyr SSG 08custom$/)
    expect(within(rows[0]).getByText('custom')).toHaveClass('tag', 'muted')
    expect(rows.slice(1).map((r) => r.textContent)).toEqual(rifleIds().map((id) => presetsOfRifle(id)[0].rifle))
    fireEvent.click(rows[0])
    expect(window.location.hash).toContain(`cr=${ROUND}`)
    expect(window.location.hash).toContain(`cf=${RIFLE}`)
    expect(within(section('Rifle')).getByRole('button', { name: 'Steyr SSG 08' })).toHaveFocus()
    expect(input(section('Rifle'), 'Name')).toHaveValue('Steyr SSG 08')
  })

  it('shows the round row for a one-round rifle', () => {
    open('#/real/workbench?p=p6&d=800')
    fireEvent.click(tag(/^Round:/))
    fireEvent.click(within(section('Round')).getByRole('button', { name: 'Lapua Scenar 300 gr GB528' }))
    const list = within(section('Round')).getByRole('group', { name: 'Round' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Lapua Scenar 300 gr GB528'])
  })

  it('picks a custom MOA scope and turns the display angle to MOA', () => {
    seed({ scopes: [MOA_SCOPE] })
    open()
    expect(tag(/^Scope: MRAD/)).toBeInTheDocument()
    fireEvent.click(tag(/^Scope:/))
    fireEvent.click(within(section('Scope')).getByRole('button', { name: 'Generic scope' }))
    const list = within(section('Scope')).getByRole('group', { name: 'Scope' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Generic scope', 'S&B 5-25custom'])
    fireEvent.click(within(list).getByRole('button', { name: /^S&B 5-25/ }))
    expect(window.location.hash).toContain(`cs=${SCOPE}`)
    expect(window.location.hash).toContain('a=moa')
    expect(screen.getByTestId('real-elevation')).toHaveTextContent(/MOA$/)
    expect(tag(/^Scope: MOA · ¼ · zero 100/)).toBeInTheDocument()
    const scope = section('Scope')
    expect(within(scope).getByRole('button', { name: 'S&B 5-25' })).toHaveFocus()
    expect(within(scope).getByRole('button', { name: '¼' })).toHaveAttribute('aria-pressed', 'true')
    // Back on the generic scope, the angle stays.
    choose('Scope', 'S&B 5-25', /^Generic scope$/)
    expect(window.location.hash).not.toContain('cs=')
    expect(window.location.hash).toContain('a=moa')
  })

  it('a custom scope\'s unit writes the scope and the display angle; its click and travel in the old unit go', () => {
    seed({ scopes: [{ ...MOA_SCOPE, travelUp: 60 }] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=moa`)
    fireEvent.click(tag(/^Scope:/))
    fireEvent.click(within(section('Scope')).getByRole('button', { name: 'MRAD' }))
    expect(lib().scopes[0].scopeUnit).toBe('mil')
    expect(lib().scopes[0]).not.toHaveProperty('clickValue')
    expect(lib().scopes[0]).not.toHaveProperty('travelUp')
    expect(window.location.hash).toContain('a=mil')
    const clicks = within(section('Scope')).getByRole('group', { name: 'Click value' })
    for (const b of within(clicks).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(clicks).getByRole('button', { name: '0.1' }))
    expect(lib().scopes[0]).toMatchObject({ scopeUnit: 'mil', clickValue: 0.1 })
  })

  it('brings a custom scope\'s click and travel back on MRAD → MOA → MRAD', () => {
    seed({ scopes: [{ ...MOA_SCOPE, scopeUnit: 'mil', clickValue: 0.05, travelUp: 20 }] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=mil`)
    fireEvent.click(tag(/^Scope:/))
    fireEvent.click(within(section('Scope')).getByRole('button', { name: 'MOA' }))
    expect(lib().scopes[0].scopeUnit).toBe('moa')
    expect(lib().scopes[0]).not.toHaveProperty('clickValue')
    // Folding the section away and back doesn't lose them: the sheet keeps them while it is open.
    fireEvent.click(header('Scope'))
    expand('Scope')
    fireEvent.click(within(section('Scope')).getByRole('button', { name: 'MRAD' }))
    expect(lib().scopes[0]).toMatchObject({ scopeUnit: 'mil', clickValue: 0.05, travelUp: 20 })
    expect(window.location.hash).toContain('a=mil')
    expect(within(section('Scope')).getByRole('button', { name: '0.05' })).toHaveAttribute('aria-pressed', 'true')
    expect(input(section('Scope'), 'Turret travel up')).toHaveValue('20')
  })

  it('never stores a default click into a custom scope: a travel typed under the other angle leaves the click unset', () => {
    // The MOA scope under an MRAD display: the travel is written in MRAD, so its ¼ MOA click isn't this unit's.
    seed({ scopes: [MOA_SCOPE] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=mil`)
    fireEvent.click(tag(/^Scope:/))
    type(input(section('Scope'), 'Turret travel up'), '20')
    expect(lib().scopes[0]).toMatchObject({ scopeUnit: 'mil', travelUp: 20 })
    expect(lib().scopes[0]).not.toHaveProperty('clickValue')
    for (const b of within(within(section('Scope')).getByRole('group', { name: 'Click value' })).getAllByRole('button')) {
      expect(b).toHaveAttribute('aria-pressed', 'false')
    }
    cleanup()
    // A click set in the display's own unit stays as it is.
    seed({ scopes: [{ ...MOA_SCOPE, scopeUnit: 'mil', clickValue: 0.05 }] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=mil`)
    fireEvent.click(tag(/^Scope:/))
    type(input(section('Scope'), 'Turret travel up'), '20')
    expect(lib().scopes[0]).toMatchObject({ scopeUnit: 'mil', clickValue: 0.05, travelUp: 20 })
  })

  it('renames a custom rifle and refuses an empty name', () => {
    seed({ rifles: [STEYR], rounds: [{ ...HANDLOAD, rifleId: RIFLE }] })
    open(onRifle)
    fireEvent.click(tag(/^Rifle:/))
    const name = input(section('Rifle'), 'Name')
    expect(name).toHaveAttribute('maxLength', '40')
    type(name, 'Steyr SSG 69')
    expect(lib().rifles[0].name).toBe('Steyr SSG 69')
    expect(tag(/^Rifle: Steyr SSG 69$/)).toBeInTheDocument()
    type(input(section('Rifle'), 'Name'), ' ')
    expect(within(section('Rifle')).getByRole('alert')).toHaveTextContent('Give it a name, at most 40 characters')
    expect(lib().rifles[0].name).toBe('Steyr SSG 69')
  })

  it('edits a custom scope\'s sight height into the library', () => {
    seed({ scopes: [MOA_SCOPE] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=1000&a=moa`)
    const before = answer()
    fireEvent.click(tag(/^Scope:/))
    expect(header('Scope')).toHaveAccessibleDescription(new RegExp(`sight 55${NBSP}mm$`))
    type(input(section('Scope'), 'Sight height'), '80')
    expect(lib().scopes[0].sightHeightMm).toBe(80)
    expect(localStorage.getItem('gb.real.profiles')).toBeNull()
    expect(within(field(input(section('Scope'), 'Sight height'))).getByText('yours')).toBeInTheDocument()
    expect(header('Scope')).toHaveAccessibleDescription(new RegExp(`sight 80${NBSP}mm$`))
    expect(answer()).not.toEqual(before)
  })

  describe('an incomplete selection', () => {
    const migrated = (entry: object) => localStorage.setItem('gb.real.profiles', JSON.stringify(entry))
    const onPhone = (run: () => void) => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(max-width: 699px)', media: query, addEventListener: () => {}, removeEventListener: () => {},
      }))
      try {
        run()
      } finally {
        vi.unstubAllGlobals()
      }
    }
    const zeroOf = () => within(section('Scope')).getByRole('group', { name: 'Zero' })
    const shownZero = () => zeroOf().querySelector('output')!

    it('shows — for the missing values in the summaries and the scope tag, never the stand-ins (0.1.3\'s common Custom)', () => {
      migrated(commonCustom)
      open('#/real/workbench?p=custom&d=800&a=moa')
      expect(screen.getByText('To compute, add: bullet mass, muzzle velocity, zero')).toBeInTheDocument()
      // The stand-ins are p7's 900 m/s and the generic 100 m zero.
      expect(tag(/^Scope:/)).toHaveTextContent(/^MOA · ¼ · zero —$/)
      expect(tag(/^Scope:/)).toHaveAccessibleName('Scope: MOA · ¼ · zero —')
      fireEvent.click(tag(/^Round:/))
      expect(header('Round')).toHaveAccessibleDescription('Custom · G7 0.25 · —')
      expect(header('Scope')).toHaveAccessibleDescription(`MOA · click ¼ · zero — · sight 55${NBSP}mm`)
      cleanup()
      onPhone(() => {
        open('#/real/workbench?p=custom&d=800&a=moa')
        expect(tag(/^Scope:/).textContent).toBe('MOA —')
      })
    })

    it('shows — for a missing click in the scope tag and its summary', () => {
      migrated(custom)
      open('#/real/workbench?p=custom&d=800')
      expect(screen.getByText('To compute, add: click')).toBeInTheDocument()
      expect(tag(/^Scope:/)).toHaveTextContent(/^MRAD · — · zero 200$/)
      expect(tag(/^Scope:/)).toHaveAccessibleName(`Scope: MRAD · — · zero 200${NBSP}m`)
      fireEvent.click(tag(/^Scope:/))
      expect(header('Scope')).toHaveAccessibleDescription(`MRAD · click — · zero 200${NBSP}m · sight 55${NBSP}mm`)
      // A complete round prints as before.
      expect(header('Round')).toHaveAccessibleDescription(`Custom · G7 0.25 · 790${NBSP}m/s`)
    })

    it('shows a custom scope\'s missing zero as not set, flagged, and the first + gives the 100 m it starts at', () => {
      migrated(commonCustom)
      open('#/real/workbench?p=custom&d=800&a=moa')
      fireEvent.click(tag(/^Scope:/))
      expect(shownZero()).toHaveTextContent(/^—$/)
      expect(zeroOf()).toHaveAttribute('aria-invalid', 'true')
      expect(zeroOf()).toHaveAccessibleDescription(`Set the zero, from 25${NBSP}m to 600${NBSP}m`)
      expect(within(field(zeroOf())).getByRole('alert')).toHaveTextContent(/^Set the zero, from 25\sm to 600\sm$/)
      // Both buttons work from not set.
      expect(within(zeroOf()).getByRole('button', { name: 'Zero: less' })).toBeEnabled()
      fireEvent.click(within(zeroOf()).getByRole('button', { name: 'Zero: more' }))
      expect(lib().scopes[0].zeroM).toBe(100)
      expect(shownZero()).toHaveTextContent(/^100\sm$/)
      expect(zeroOf()).not.toHaveAttribute('aria-invalid')
      expect(within(field(zeroOf())).queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('To compute, add: bullet mass, muzzle velocity')).toBeInTheDocument()
      expect(tag(/^Scope:/)).toHaveTextContent(/^MOA · ¼ · zero 100$/)
    })

    it('starts at 100 m from not set with −, too', () => {
      seed({ scopes: [{ ...MOA_SCOPE, zeroM: undefined }] })
      open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=moa`)
      fireEvent.click(tag(/^Scope:/))
      fireEvent.click(within(zeroOf()).getByRole('button', { name: 'Zero: less' }))
      expect(lib().scopes[0].zeroM).toBe(100)
    })

    it('shows a stored zero outside today\'s bounds as it is, flagged', () => {
      seed({ scopes: [{ ...MOA_SCOPE, zeroM: 2000 }] })
      open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=moa`)
      expect(screen.getByText('To compute, add: zero')).toBeInTheDocument()
      fireEvent.click(tag(/^Scope:/))
      expect(shownZero()).toHaveTextContent(/^2000\sm$/)
      expect(zeroOf()).toHaveAttribute('aria-invalid', 'true')
      expect(zeroOf()).toHaveAccessibleDescription(`Set the zero, from 25${NBSP}m to 600${NBSP}m`)
      expect(lib().scopes[0].zeroM).toBe(2000)
    })

    it('leaves a built-in scope\'s zero as it was', () => {
      open('#/real/workbench?p=p7&d=800')
      fireEvent.click(tag(/^Scope:/))
      expect(shownZero()).toHaveTextContent(/^100\sm$/)
      expect(zeroOf()).not.toHaveAttribute('aria-invalid')
      expect(within(field(zeroOf())).queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('the MV hint from the barrel length', () => {
    const STEYR_20 = { id: RIFLE, name: 'Steyr SSG 08', barrelIn: 20 }
    const BOXED = { id: ROUND, rifleId: RIFLE, name: 'Box 24', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 800, massGr: 168, mvBarrelIn: 24 }

    it('offers the barrel hint on a custom round and applies it', () => {
      seed({ rifles: [STEYR_20], rounds: [{ ...BOXED, truedAtM: 600 }] })
      open(onRifle)
      fireEvent.click(tag(/^Round:/))
      const s = section('Round')
      expect(within(s).getByText('The MV is for a 24″ barrel, yours is 20″: about −30 m/s.', { exact: false })).toBeInTheDocument()
      expect(within(s).getByText(/A chronograph beats it\./)).toBeInTheDocument()
      fireEvent.click(within(s).getByRole('button', { name: 'Use 770 m/s' }))
      expect(lib().rounds[0]).toMatchObject({ muzzleVelocityMs: 770, mvBarrelIn: 20 })
      expect(lib().rounds[0]).not.toHaveProperty('truedAtM')
      expect(within(section('Round')).queryByRole('button', { name: /^Use / })).not.toBeInTheDocument()
      expect(within(section('Round')).queryByText(/The MV is for a/)).not.toBeInTheDocument()
    })

    it('uses a built-in rifle\'s barrel, and offers nothing when the lengths agree or the barrel is unknown', () => {
      seed({ rounds: [{ ...BOXED, rifleId: 'axsr', mvBarrelIn: 24 }] })
      open(`#/real/workbench?cr=${ROUND}&d=800`)
      fireEvent.click(tag(/^Round:/))
      expect(within(section('Round')).getByText(/The MV is for a 24″ barrel, yours is 27″: about \+25 m\/s\./)).toBeInTheDocument()
      cleanup()
      seed({ rounds: [{ ...BOXED, rifleId: 'axsr', mvBarrelIn: 27 }] })
      open(`#/real/workbench?cr=${ROUND}&d=800`)
      fireEvent.click(tag(/^Round:/))
      expect(within(section('Round')).queryByText(/The MV is for a/)).not.toBeInTheDocument()
    })

    it('offers nothing for a stored barrel outside today\'s bounds, which counts as missing', () => {
      seed({ rifles: [{ ...STEYR_20, barrelIn: 50 }], rounds: [BOXED] })
      open(onRifle)
      fireEvent.click(tag(/^Round:/))
      expect(within(section('Round')).queryByText(/The MV is for a/)).not.toBeInTheDocument()
      expect(within(section('Round')).queryByRole('button', { name: /^Use / })).not.toBeInTheDocument()
    })

    it('writes the lengths and the MV with a decimal comma in Czech', () => {
      seed({ rifles: [{ ...STEYR_20, barrelIn: 16.5 }], rounds: [{ ...BOXED, muzzleVelocityMs: 812.5 }] })
      open(`${onRifle}&l=cs`)
      fireEvent.click(tag(/^Munice:/))
      const s = within(screen.getByRole('dialog', { name: 'Nastavení' })).getByRole('region', { name: 'Munice' })
      expect(within(s).getByText('Rychlost platí pro hlaveň 24″, tvoje má 16,5″: asi −55 m/s.', { exact: false })).toBeInTheDocument()
      fireEvent.click(within(s).getByRole('button', { name: 'Použít 757,5 m/s' }))
      expect(lib().rounds[0]).toMatchObject({ muzzleVelocityMs: 757.5, mvBarrelIn: 16.5 })
    })

    it('never offers it on a built-in round', () => {
      seed({ rifles: [STEYR_20] })
      open('#/real/workbench?p=p7&d=800')
      fireEvent.click(tag(/^Round:/))
      expect(within(section('Round')).queryByText(/The MV is for a/)).not.toBeInTheDocument()
      expect(within(section('Round')).queryByLabelText(/^Barrel the MV is for/)).not.toBeInTheDocument()
    })

    it('has the barrel the MV is for as an optional field of a custom round, in inches or millimetres', () => {
      seed({ rounds: [{ ...BOXED, rifleId: 'axsr' }] })
      open(`#/real/workbench?cr=${ROUND}&d=800&u=imperial`)
      fireEvent.click(tag(/^Round:/))
      expect(input(section('Round'), 'Barrel the MV is for')).toHaveValue('24')
      type(input(section('Round'), 'Barrel the MV is for'), '22')
      expect(lib().rounds[0].mvBarrelIn).toBe(22)
    })
  })
})
