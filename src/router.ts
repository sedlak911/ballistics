import { useCallback, useEffect, useRef, useState } from 'react'
import { GAMES } from './games/registry'
import { setNewestHash } from './routeHref'

// Hash routes: #/<game>/<page>?<params>. Hash routing needs no server fallback on GitLab Pages.

// One page per game: the workbench. Links to pages that existed before (armor, sheet, …) open it with their setup.
export const PAGES = ['workbench'] as const
export type PageId = (typeof PAGES)[number]

export interface Route {
  game: string
  page: PageId
  params: URLSearchParams
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?', 2)
  const [game, page] = path.split('/').filter(Boolean)
  const knownGame = GAMES.some((g) => g.id === game)
  return {
    game: knownGame ? game : GAMES[0].id,
    page: knownGame && (PAGES as readonly string[]).includes(page) ? (page as PageId) : 'workbench',
    params: new URLSearchParams(query),
  }
}

export function buildHash(r: Route): string {
  const q = r.params.toString()
  return `#/${r.game}/${r.page}${q ? `?${q}` : ''}`
}

// A browser limits how often a page may write its URL: WebKit throws a SecurityError past 100 history writes in 10 s
// (30 s in older versions), Firefox past 200, and one flick of the distance ruler is up to ~55 steps. So the URL is
// written at once while there were fewer than BUDGET writes in the last WINDOW_MS; past that the newest hash waits for
// one trailing write every TRAIL_MS. A write the browser refuses anyway is tried again RETRY_MS later: the route on
// screen never waits for the URL, and its newest state always reaches it.
const WINDOW_MS = 10_000
const BUDGET = 80
const TRAIL_MS = 150
const RETRY_MS = 1000

/** The URL's hash, written for the router: at once while the browser allows it, otherwise a little later; it never throws. */
function hashWriter() {
  // When each write of the last WINDOW_MS went through.
  const times: number[] = []
  let waiting: { hash: string; push: boolean } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  // The hash the URL holds as far as the router knows: what it wrote last, or the last change it took from outside.
  let known = window.location.hash

  const put = (hash: string, push: boolean): boolean => {
    try {
      if (push) window.location.hash = hash
      else window.history.replaceState(null, '', hash)
    } catch {
      return false
    }
    times.push(Date.now())
    known = window.location.hash
    return true
  }
  const stop = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const flush = () => {
    timer = undefined
    if (waiting !== null && put(waiting.hash, waiting.push)) waiting = null
    if (waiting !== null) timer = setTimeout(flush, RETRY_MS)
  }

  return {
    /** `push` adds a history entry (a page change); a page change still waiting stays one, with the newest hash. */
    write(hash: string, push: boolean) {
      const next = { hash, push: push || waiting?.push === true }
      const now = Date.now()
      while (times.length > 0 && now - times[0] >= WINDOW_MS) times.shift()
      if (times.length < BUDGET) {
        stop()
        waiting = put(next.hash, next.push) ? null : next
        if (waiting !== null) timer = setTimeout(flush, RETRY_MS)
        return
      }
      waiting = next
      if (timer === undefined) timer = setTimeout(flush, TRAIL_MS)
    },
    /**
     * Whether a hash change came from outside (Back, a link, a typed URL); then it wins over a write still waiting.
     * The router's own page change comes back as one too, and must not undo a newer write that waits.
     */
    adopt(): boolean {
      if (window.location.hash === known) return false
      known = window.location.hash
      waiting = null
      stop()
      return true
    },
    dispose() {
      waiting = null
      stop()
    },
  }
}

/**
 * Current route; the setter pushes a history entry for page changes and replaces it for param-only changes. The route
 * changes at once; the URL follows as the browser allows (hashWriter), never from inside a state update.
 */
export function useRoute(): [Route, (r: Partial<Route>) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  // The newest route, ahead of a render: the setter builds on it, as a state updater would on the queued state.
  const latest = useRef(route)
  const [writer] = useState(hashWriter)

  useEffect(() => {
    const onChange = () => {
      if (!writer.adopt()) return
      setNewestHash(window.location.hash)
      latest.current = parseHash(window.location.hash)
      setRoute(latest.current)
    }
    window.addEventListener('hashchange', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      writer.dispose()
      setNewestHash(null)
    }
  }, [writer])

  const navigate = useCallback((patch: Partial<Route>) => {
    const cur = latest.current
    const next = { ...cur, ...patch }
    const hash = buildHash(next)
    setNewestHash(hash)
    latest.current = parseHash(hash)
    setRoute(latest.current)
    writer.write(hash, next.game !== cur.game || next.page !== cur.page)
  }, [writer])

  return [route, navigate]
}
