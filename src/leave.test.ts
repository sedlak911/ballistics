import { describe, expect, it, vi } from 'vitest'
import { restart } from './leave'

/** A window whose history and reload are recorded in order; jsdom can't reload, and its location can't be spied on. */
function fakeWindow(replaceState: (href: string) => void) {
  const calls: string[] = []
  const w = {
    history: { replaceState: vi.fn((_s: unknown, _t: string, href: string) => { calls.push(`replace ${href}`); replaceState(href) }) },
    location: { reload: vi.fn(() => { calls.push('reload') }) },
  }
  return { w: w as unknown as Pick<Window, 'history' | 'location'>, calls, reload: w.location.reload }
}

describe('restart', () => {
  it('writes the address, then reloads', () => {
    const { w, calls } = fakeWindow(() => {})
    restart('http://localhost:3000/cs/#/real/workbench', w)
    expect(calls).toEqual(['replace http://localhost:3000/cs/#/real/workbench', 'reload'])
  })

  it('still reloads when the browser refuses the history write', () => {
    // WebKit throws past 100 history writes in 10 s; one flick of the distance ruler is up to ~55 (router.ts).
    const { w, reload } = fakeWindow(() => {
      throw new DOMException('Attempt to use history.replaceState() more than 100 times per 10 seconds', 'SecurityError')
    })
    expect(() => restart('http://localhost:3000/cs/#/real/workbench', w)).not.toThrow()
    expect(reload).toHaveBeenCalledOnce()
  })
})
