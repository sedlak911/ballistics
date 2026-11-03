import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import type { ToastInput } from '../../../components/Toast'

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

function open(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

type Title = 'Rifle' | 'Round' | 'Scope'
type Items = { rifles: Record<string, unknown>[]; rounds: Record<string, unknown>[]; scopes: Record<string, unknown>[] }
const seed = (l: Partial<Items>) => localStorage.setItem('gb.real.library', JSON.stringify({ v: 1, rifles: [], rounds: [], scopes: [], ...l }))
const lib = () => JSON.parse(localStorage.getItem('gb.real.library')!) as Items & { v: number }
const params = () => new URLSearchParams(window.location.hash.split('?')[1])
const tag = (name: RegExp) => within(screen.getByTestId('real-strip')).getByRole('button', { name })
const sheet = () => screen.getByRole('dialog', { name: 'Settings' })
const section = (title: Title) => within(sheet()).getByRole('region', { name: title })
/** A section's header: the one button named by the title, with the `{n} yours` chip after it when there is one. */
const header = (title: Title) => within(section(title)).getByRole('button', { name: new RegExp(`^${title}( \\d+ yours)?$`) })
const expand = (title: Title) => {
  if (header(title).getAttribute('aria-expanded') === 'false') fireEvent.click(header(title))
  return section(title)
}
/** The section's picker row, which shows the name of what is selected. */
const row = (title: Title, name: string) => within(expand(title)).getByRole('button', { name })
const deleteButton = (title: Title) => within(expand(title)).queryByRole('button', { name: `Delete this ${title.toLowerCase()}` })
const remove = (title: Title) => fireEvent.click(deleteButton(title)!)
/** The toast: the status line in the open sheet's toast slot, else on <body> itself; not one of the page's or the sheet's own. */
const toast = () => screen.queryAllByRole('status')
  .find((el) => el.parentElement === document.body || el.parentElement!.classList.contains('toast-slot')) ?? null
const undo = () => fireEvent.click(within(toast()!).getByRole('button', { name: 'Undo' }))
/** Opens a section's picker row, named by what it shows, and picks the row whose name matches. */
const choose = (title: Title, shownName: string, name: RegExp) => {
  const s = expand(title)
  fireEvent.click(within(s).getByRole('button', { name: shownName }))
  fireEvent.click(within(within(s).getByRole('group', { name: title })).getByRole('button', { name }))
}
const sightHeight = () => within(section('Scope')).getByLabelText(/^Sight height( optional)?$/)

const RIFLE = 'u-rifle-1'
const ROUND = 'u-round-1'
const SCOPE = 'u-scope-1'
const STEYR = { id: RIFLE, name: 'Steyr SSG 08' }
const HANDLOAD = { id: ROUND, rifleId: 'axsr', name: 'Handload 250', bc: 0.31, dragModel: 'G7', muzzleVelocityMs: 880, massGr: 250 }
const SECOND = { ...HANDLOAD, id: 'u-round-2', name: 'Handload 300', massGr: 300 }
const MOA_SCOPE = { id: SCOPE, rifleId: 'axsr', name: 'S&B 5-25', scopeUnit: 'moa', clickValue: 0.25, zeroM: 100, sightHeightMm: 55 }
const steyrRound = (id: string, name: string) => ({ ...HANDLOAD, id, rifleId: RIFLE, name })
const onRifle = `#/real/workbench?cr=${ROUND}&cf=${RIFLE}&d=800`

afterEach(() => {
  cleanup()
  shown.last = null
})

describe('Deleting your own items, with undo', () => {
  it('deletes the selected custom round and falls back to the rifle\'s first round', () => {
    seed({ rounds: [HANDLOAD] })
    // The link's p= is a BREN 2's, left from before: the round goes back to its own rifle's first preset.
    open(`#/real/workbench?p=p1&cr=${ROUND}&d=800`)
    fireEvent.click(tag(/^Round:/))
    const button = deleteButton('Round')!
    button.focus()
    fireEvent.click(button)
    expect(lib().rounds).toEqual([])
    expect(params().has('cr')).toBe(false)
    expect(params().get('p')).toBe('p7')
    expect(tag(/^Round:/)).toHaveAccessibleName('Round: .338 LM Scenar 250')
    expect(row('Round', 'Lapua Scenar 250 gr GB488')).toBeInTheDocument()
    expect(toast()).toHaveTextContent(/^Round deleted/)
    // The button goes with the round; the focus stays in the sheet, on the section's header.
    expect(deleteButton('Round')).toBeNull()
    expect(header('Round')).toHaveFocus()
    cleanup()

    // On a custom rifle, its first remaining round.
    const rounds = [steyrRound(ROUND, 'Steyr 175'), steyrRound('u-round-2', 'Steyr 168'), steyrRound('u-round-3', 'Steyr 155')]
    seed({ rifles: [STEYR], rounds })
    open(onRifle)
    fireEvent.click(tag(/^Round:/))
    remove('Round')
    expect(lib().rounds).toEqual(rounds.slice(1))
    expect(params().get('cr')).toBe('u-round-2')
    expect(params().get('cf')).toBe(RIFLE)
    expect(row('Round', 'Steyr 168')).toBeInTheDocument()
    expect(toast()).toHaveTextContent(/^Round deleted/)
  })

  it('undoes a delete: the round and the selection come back', () => {
    // Another round before it, the rifle's custom scope selected, and a field this build doesn't know.
    const items = { rifles: [], rounds: [SECOND, { ...HANDLOAD, later: 'kept' }], scopes: [MOA_SCOPE] }
    seed(items)
    open(`#/real/workbench?p=p7&cr=${ROUND}&cs=${SCOPE}&d=800&a=moa`)
    fireEvent.click(tag(/^Round:/))
    remove('Round')
    expect(lib().rounds).toEqual([SECOND])
    // A built-in rifle goes back to its preset, not to another custom round; its scope stays.
    expect(params().has('cr')).toBe(false)
    expect(params().get('cs')).toBe(SCOPE)
    undo()
    expect(lib()).toEqual({ v: 1, ...items })
    expect(params().get('cr')).toBe(ROUND)
    expect(params().get('cs')).toBe(SCOPE)
    expect(tag(/^Round:/)).toHaveAccessibleName('Round: Handload 250')
    expect(row('Round', 'Handload 250')).toBeInTheDocument()
    expect(toast()).toBeNull()
    expect(sheet()).toContainElement(document.activeElement as HTMLElement)
  })

  it('keeps a delete\'s Undo through its own fallback, and withdraws it on a later change of round, even one back', () => {
    seed({ rounds: [HANDLOAD, SECOND], scopes: [MOA_SCOPE] })
    open(`#/real/workbench?p=p7&cr=${ROUND}&cs=${SCOPE}&d=800&a=moa`)
    fireEvent.click(tag(/^Round:/))
    remove('Round')
    const run = shown.last!.action!.run
    expect(toast()).toHaveTextContent(/^Round deleted/)
    choose('Round', 'Lapua Scenar 250 gr GB488', /^Handload 300/)
    expect(params().get('cr')).toBe(SECOND.id)
    expect(toast()).toBeNull()
    act(run)
    expect(lib().rounds).toEqual([SECOND])
    expect(params().get('cr')).toBe(SECOND.id)
    // A scope's delete moves no round. Back on the round the first delete fell back to, both Undos are withdrawn.
    remove('Scope')
    const runScope = shown.last!.action!.run
    choose('Round', 'Handload 300', /^Lapua Scenar 250 gr GB488$/)
    expect(params().has('cr')).toBe(false)
    expect(toast()).toBeNull()
    act(run)
    act(runScope)
    expect(lib()).toMatchObject({ rounds: [SECOND], scopes: [] })
    expect(params().has('cr')).toBe(false)
    expect(params().has('cs')).toBe(false)
  })

  it('deletes a rifle with its rounds and scopes, and Undo brings all three back', () => {
    const steyrScope = { ...MOA_SCOPE, id: 'u-scope-2', rifleId: RIFLE, name: 'Kahles K525i', sightHeightMm: 48 }
    const items = {
      rifles: [STEYR],
      rounds: [HANDLOAD, steyrRound('u-round-2', 'Steyr 175'), steyrRound('u-round-3', 'Steyr 168')],
      scopes: [steyrScope, MOA_SCOPE],
    }
    seed(items)
    open(`#/real/workbench?p=p7&cr=u-round-3&cf=${RIFLE}&cs=u-scope-2&d=800&a=moa`)
    fireEvent.click(tag(/^Rifle:/))
    remove('Rifle')
    // Only the rifle's own go: the AXSR's round and scope stay.
    expect(lib()).toEqual({ v: 1, rifles: [], rounds: [HANDLOAD], scopes: [MOA_SCOPE] })
    for (const k of ['cr', 'cf', 'cs']) expect(params().has(k)).toBe(false)
    expect(params().get('p')).toBe('p7')
    expect(tag(/^Rifle:/)).toHaveAccessibleName(/^Rifle: AI AXSR/)
    expect(toast()).toHaveTextContent(/^Rifle deleted/)
    undo()
    expect(lib()).toEqual({ v: 1, ...items })
    expect(params().get('cr')).toBe('u-round-3')
    expect(params().get('cf')).toBe(RIFLE)
    expect(params().get('cs')).toBe('u-scope-2')
    expect(tag(/^Rifle:/)).toHaveAccessibleName(/^Rifle: Steyr SSG 08/)
    expect(row('Round', 'Steyr 168')).toBeInTheDocument()
    expect(row('Scope', 'Kahles K525i')).toBeInTheDocument()
  })

  it('falls back to the generic scope after deleting the selected scope, and Undo brings it back', () => {
    seed({ scopes: [MOA_SCOPE] })
    open(`#/real/workbench?p=p7&cs=${SCOPE}&d=800&a=moa`)
    fireEvent.click(tag(/^Scope:/))
    expect(sightHeight()).toHaveValue('55')
    remove('Scope')
    expect(lib().scopes).toEqual([])
    expect(params().has('cs')).toBe(false)
    // The display angle stays where the scope put it.
    expect(params().get('a')).toBe('moa')
    expect(row('Scope', 'Generic scope')).toBeInTheDocument()
    expect(sightHeight()).toHaveValue('60')
    expect(toast()).toHaveTextContent(/^Scope deleted/)
    expect(header('Scope')).toHaveFocus()
    undo()
    expect(lib().scopes).toEqual([MOA_SCOPE])
    expect(params().get('cs')).toBe(SCOPE)
    expect(row('Scope', 'S&B 5-25')).toBeInTheDocument()
    expect(sightHeight()).toHaveValue('55')
  })

  // Review focus 4.
  it('keeps the sheet open on the fallback after deleting the selected rifle', () => {
    seed({ rifles: [STEYR], rounds: [{ ...HANDLOAD, rifleId: RIFLE }] })
    open(onRifle)
    fireEvent.click(tag(/^Rifle:/))
    const button = deleteButton('Rifle')!
    button.focus()
    fireEvent.click(button)
    expect(lib()).toMatchObject({ rifles: [], rounds: [] })
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(sheet()).toContainElement(document.activeElement as HTMLElement)
    expect(header('Rifle')).toHaveFocus()
    expect(row('Rifle', 'AI AXSR / AXMC .338 27″')).toBeInTheDocument()
    expect(sheet()).toContainElement(toast())
    expect(within(toast()!).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('offers no delete for built-in items, nor for a custom rifle\'s only round', () => {
    const titles: Title[] = ['Rifle', 'Round', 'Scope']
    open('#/real/workbench?p=p7&d=800')
    fireEvent.click(tag(/^Rifle:/))
    for (const title of titles) expect(within(expand(title)).queryByRole('button', { name: /^Delete/ })).toBeNull()
    cleanup()

    // A custom round on a built-in rifle: only the round can go.
    seed({ rounds: [HANDLOAD] })
    open(`#/real/workbench?p=p7&cr=${ROUND}&d=800`)
    fireEvent.click(tag(/^Rifle:/))
    expect(deleteButton('Rifle')).toBeNull()
    expect(deleteButton('Round')).toBeInTheDocument()
    expect(deleteButton('Scope')).toBeNull()
    cleanup()

    // A custom rifle keeps one round (Ruling 13).
    seed({ rifles: [STEYR], rounds: [{ ...HANDLOAD, rifleId: RIFLE }] })
    open(onRifle)
    fireEvent.click(tag(/^Rifle:/))
    expect(deleteButton('Rifle')).toBeInTheDocument()
    expect(deleteButton('Round')).toBeNull()
    cleanup()

    // With a second round, either can go.
    seed({ rifles: [STEYR], rounds: [steyrRound(ROUND, 'Steyr 175'), steyrRound('u-round-2', 'Steyr 168')] })
    open(onRifle)
    fireEvent.click(tag(/^Rifle:/))
    expect(deleteButton('Round')).toBeInTheDocument()
  })

  it('speaks Czech', () => {
    const scope = { ...MOA_SCOPE, rifleId: RIFLE }
    seed({ rifles: [STEYR], rounds: [steyrRound(ROUND, 'Steyr 175'), steyrRound('u-round-2', 'Steyr 168')], scopes: [scope] })
    open(`#/real/workbench?cr=${ROUND}&cf=${RIFLE}&cs=${SCOPE}&d=800&a=moa&l=cs`)
    fireEvent.click(tag(/^Zbraň:/))
    const region = (name: string) => within(screen.getByRole('dialog', { name: 'Nastavení' })).getByRole('region', { name })
    const expandCs = (name: string) => {
      fireEvent.click(within(region(name)).getByRole('button', { name: new RegExp(`^${name}`), expanded: false }))
      return region(name)
    }
    fireEvent.click(within(expandCs('Optika')).getByRole('button', { name: 'Smazat tuto optiku' }))
    expect(toast()).toHaveTextContent(/^Optika smazána/)
    expect(within(toast()!).getByRole('button', { name: 'Zpět' })).toBeInTheDocument()
    fireEvent.click(within(expandCs('Munice')).getByRole('button', { name: 'Smazat tento náboj' }))
    expect(toast()).toHaveTextContent(/^Náboj smazán/)
    fireEvent.click(within(region('Zbraň')).getByRole('button', { name: 'Smazat tuto pušku' }))
    expect(toast()).toHaveTextContent(/^Puška smazána/)
  })
})
