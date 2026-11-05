import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeGuide, guideDue, guidePages, openGuide, useGuide } from './guide'

describe('guideDue', () => {
  beforeEach(() => localStorage.clear())
  it('is true on empty storage', () => expect(guideDue()).toBe(true))
  it('is false with the setup alone, and with the profile alone', () => {
    localStorage.setItem('gb.real.setup', 'p=p7')
    expect(guideDue()).toBe(false)
    localStorage.clear()
    localStorage.setItem('gb.real.profile', '{}')
    expect(guideDue()).toBe(false)
  })
  it('is false when the storage cannot be read', () => {
    const broken = { getItem: () => { throw new Error('blocked') } } as unknown as Storage
    expect(guideDue(broken)).toBe(false)
  })
})

describe('guidePages', () => {
  it('gives a phone in the browser all six, in order', () => {
    expect(guidePages({ phone: true, standalone: false })).toEqual(['install', 'rifle', 'weather', 'wind', 'direction', 'distance'])
  })
  it("leaves the install page out of the phone's home-screen app", () => {
    expect(guidePages({ phone: true, standalone: true })).toEqual(['rifle', 'weather', 'wind', 'direction', 'distance'])
  })
  it('gives a desktop five', () => {
    expect(guidePages({ phone: false, standalone: false })).toHaveLength(5)
  })
})

describe('the guide store', () => {
  afterEach(() => act(() => closeGuide()))
  it('opens with the element to return to, raises the token on every open, and closes', () => {
    const { result } = renderHook(() => useGuide())
    const el = document.createElement('button')
    act(() => openGuide(el))
    expect(result.current).toMatchObject({ open: true, returnFocus: el })
    const t = result.current.token
    act(() => openGuide(null))
    expect(result.current.token).toBe(t + 1)
    act(() => closeGuide())
    expect(result.current.open).toBe(false)
  })
})
