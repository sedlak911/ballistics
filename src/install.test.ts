import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installNoteShown, installPlatform, isStandalone, markInstallNoteShown, useInstallPrompt } from './install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'

afterEach(() => {
  window.dispatchEvent(new Event('appinstalled'))
  vi.unstubAllGlobals()
  delete (navigator as { standalone?: boolean }).standalone
})

describe('installPlatform', () => {
  it('tells an iPhone from Android', () => {
    expect(installPlatform(IPHONE)).toBe('ios')
    expect(installPlatform(PIXEL)).toBe('android')
  })
})

describe('isStandalone', () => {
  it('is true when the display mode matches', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }))
    expect(isStandalone()).toBe(true)
  })
  it('is true with navigator.standalone', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
  })
  it('is false with neither', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(isStandalone()).toBe(false)
  })
  it('is false without matchMedia, and does not throw', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isStandalone()).toBe(false)
  })
})

describe('the note flag', () => {
  it('starts false and is true once marked', () => {
    expect(installNoteShown()).toBe(false)
    markInstallNoteShown()
    expect(installNoteShown()).toBe(true)
    expect(localStorage.getItem('gb.install')).toBe('{"noteShown":true}')
  })
  it('reads a corrupt value as not shown', () => {
    localStorage.setItem('gb.install', 'x')
    expect(installNoteShown()).toBe(false)
  })
  it('reads a stored false or null as not shown', () => {
    localStorage.setItem('gb.install', '{"noteShown":false}')
    expect(installNoteShown()).toBe(false)
    localStorage.setItem('gb.install', 'null')
    expect(installNoteShown()).toBe(false)
  })
  it('reads blocked storage as shown, so it never nags', () => {
    const blocked = { getItem: () => { throw new Error('blocked') } } as unknown as Storage
    expect(installNoteShown(blocked)).toBe(true)
  })
  it('swallows a failing write', () => {
    const blocked = { setItem: () => { throw new Error('full') } } as unknown as Storage
    expect(() => markInstallNoteShown(blocked)).not.toThrow()
  })
})

describe('useInstallPrompt', () => {
  const fire = () => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(() => Promise.resolve()) })
    act(() => { window.dispatchEvent(event) })
    return event
  }
  it('is null before any event', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current).toBeNull()
  })
  it('is a function after the event, which is kept from the browser bar', () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = fire()
    expect(result.current).toBeTypeOf('function')
    expect(event.defaultPrevented).toBe(true)
  })
  it('prompts once and goes back to null', () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = fire()
    act(() => { result.current!() })
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
  })
  it('survives a rejected prompt', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { result } = renderHook(() => useInstallPrompt())
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(() => Promise.reject(new Error('InvalidStateError'))),
    })
    act(() => { window.dispatchEvent(event) })
    act(() => { result.current!() })
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
    expect(unhandled).not.toHaveBeenCalled()
  })
  it('goes back to null on appinstalled', () => {
    const { result } = renderHook(() => useInstallPrompt())
    fire()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current).toBeNull()
  })
})
