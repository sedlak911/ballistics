import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { PHONE } from '../../../components/useMedia'
import { SettingsProvider } from '../../../settings/SettingsContext'
import { useRoute } from '../../../router'
import { closeGuide } from '../guide'
import { Guide } from './Guide'

function open(hash = '#/real/workbench') {
  window.location.hash = hash
  return render(<App />)
}
const stubPhone = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE, media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
const card = () => document.querySelector('.guide-card') as HTMLElement
const count = () => card().querySelector('.label')?.textContent
const pages = () => [...card().querySelectorAll('.guide-page')]

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  closeGuide()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the guide', () => {
  it('opens by itself at a first visit, without the focus', () => {
    open()
    expect(count()).toBe('Guide · 1 / 5')
    expect(document.activeElement).toBe(document.body)
    expect(JSON.parse(localStorage.getItem('gb.real.profile')!)).toMatchObject({ guideSeen: true })
    expect(JSON.parse(localStorage.getItem('gb.install')!)).toEqual({ noteShown: true })
    cleanup()
    closeGuide()
    localStorage.clear()
    stubPhone()
    open()
    expect(count()).toBe('Guide · 1 / 6')
    expect(card()).toHaveTextContent('First, to the home screen')
  })

  it('shows once', () => {
    open()
    expect(card()).not.toBeNull()
    cleanup()
    closeGuide()
    open()
    expect(card()).toBeNull()
  })

  it('stays away when the storage is blocked', () => {
    const blocked = () => { throw new Error('blocked') }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })
    open()
    expect(card()).toBeNull()
  })

  it('turns the pages', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(count()).toBe('Guide · 2 / 5')
    expect(card()).toHaveTextContent('Rifle, round, scope')
    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    fireEvent.keyDown(next, { key: 'ArrowRight' })
    expect(count()).toBe('Guide · 3 / 5')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }), { key: 'ArrowLeft' })
    expect(count()).toBe('Guide · 2 / 5')
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(count()).toBe('Guide · 5 / 5')
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(pages()).toHaveLength(5)
    expect(pages().filter((p) => !p.hasAttribute('aria-hidden'))).toEqual([pages()[4]])
  })

  it('a swipe turns the page', () => {
    open()
    fireEvent.pointerDown(card(), { clientX: 40, clientY: 10 })
    fireEvent.pointerUp(card(), { clientX: 80, clientY: 100 })
    expect(count()).toBe('Guide · 1 / 5')
    fireEvent.pointerDown(card(), { clientX: 200, clientY: 10 })
    fireEvent.pointerUp(card(), { clientX: 120, clientY: 10 })
    expect(count()).toBe('Guide · 2 / 5')
    fireEvent.pointerDown(card(), { clientX: 120, clientY: 10 })
    fireEvent.pointerUp(card(), { clientX: 200, clientY: 10 })
    expect(count()).toBe('Guide · 1 / 5')
  })

  it('closes on Escape in the card and on ✕, but not on Escape elsewhere', () => {
    open()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(card()).not.toBeNull()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }), { key: 'Escape' })
    expect(card()).toBeNull()
    cleanup()
    closeGuide()
    localStorage.clear()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Close the guide' }))
    expect(card()).toBeNull()
  })

  it('has texts that follow the device', () => {
    open()
    expect(pages()[3]).toHaveTextContent('In the bar at the bottom type the direction')
    expect(pages()[4]).toHaveTextContent('Set the distance in the bar at the bottom')
    cleanup()
    closeGuide()
    localStorage.clear()
    stubPhone()
    vi.stubGlobal('DeviceOrientationEvent', class {})
    open()
    expect(pages()[4]).toHaveTextContent('In the Distance panel tap Aim')
    expect(pages()[5]).toHaveTextContent('drag the ruler sideways')
  })

  it('speaks Czech', () => {
    open('#/real/workbench?l=cs')
    expect(count()).toBe('Průvodce · 1 / 5')
  })

  it('announces the page change politely', () => {
    open()
    expect(card().querySelector('.guide-count')).toHaveAttribute('aria-live', 'polite')
  })

  it('keeps the head row and the buttons out of the pages, so only a page’s text scrolls on a short screen', () => {
    open()
    expect([...card().children].map((c) => c.className)).toEqual(['guide-head', 'guide-pages', 'guide-foot'])
    expect(card().querySelector('.guide-pages')!.children).toHaveLength(5)
  })
})

describe('the guide over the bottom bar', () => {
  // The bar's top on screen, as the layout would give it (jsdom has none); the window is 768px tall.
  let barTop: number
  const realRect = Element.prototype.getBoundingClientRect
  beforeEach(() => {
    barTop = 680
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('real-bar') ? DOMRect.fromRect({ x: 0, y: barTop, width: 1000, height: 70 }) : realRect.call(this)
    })
  })
  const lift = () => card().style.getPropertyValue('--guide-lift')

  it('on desktop stands above the bar, and follows it', () => {
    open()
    expect(document.querySelector('.real-bar')).not.toBeNull()
    expect(lift()).toBe('88px')
    barTop = 600
    fireEvent(window, new Event('resize'))
    expect(lift()).toBe('168px')
    fireEvent.scroll(window)
    barTop = 800
    fireEvent.scroll(window)
    // Below the screen's foot (a short window): the card keeps its place at the foot.
    expect(lift()).toBe('0px')
  })

  it('on a phone stays over the dock', () => {
    stubPhone()
    open()
    expect(document.querySelector('.real-bar')).toBeNull()
    expect(lift()).toBe('')
  })
})

function Standalone({ phone, returnFocus }: { phone: boolean; returnFocus: HTMLElement | null }) {
  const [route, navigate] = useRoute()
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <Guide returnFocus={returnFocus} phone={phone} />
    </SettingsProvider>
  )
}

describe('the guide on its own', () => {
  it('keeps its pages when the phone turns across the breakpoint', () => {
    window.location.hash = '#/real/workbench'
    const { rerender } = render(<Standalone phone returnFocus={null} />)
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(count()).toBe('Guide · 6 / 6')
    rerender(<Standalone phone={false} returnFocus={null} />)
    expect(count()).toBe('Guide · 6 / 6')
    expect(pages().filter((p) => !p.hasAttribute('aria-hidden'))).toEqual([pages()[5]])
  })

  describe('with an element to return the focus to', () => {
    let opener: HTMLButtonElement
    beforeEach(() => {
      window.location.hash = '#/real/workbench'
      opener = document.body.appendChild(document.createElement('button'))
    })
    afterEach(() => opener.remove())

    it('puts the focus on the title', () => {
      render(<Standalone phone={false} returnFocus={opener} />)
      expect(document.activeElement).toBe(card().querySelector('.guide-title'))
    })
    it('gives the focus back on ✕, Done and Escape', () => {
      render(<Standalone phone={false} returnFocus={opener} />)
      fireEvent.click(screen.getByRole('button', { name: 'Close the guide' }))
      expect(document.activeElement).toBe(opener)
      opener.blur()
      for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(document.activeElement).toBe(opener)
      opener.blur()
      fireEvent.keyDown(screen.getByRole('button', { name: 'Done' }), { key: 'Escape' })
      expect(document.activeElement).toBe(opener)
    })
  })
})
