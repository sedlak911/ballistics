import { useCallback, useEffect, useState } from 'react'
import { GAMES } from './games/registry'

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

/** Current route; the setter pushes a history entry for page changes and replaces it for param-only changes. */
export function useRoute(): [Route, (r: Partial<Route>) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((patch: Partial<Route>) => {
    setRoute((cur) => {
      const next = { ...cur, ...patch }
      const hash = buildHash(next)
      if (next.game !== cur.game || next.page !== cur.page) window.location.hash = hash
      else window.history.replaceState(null, '', hash)
      return parseHash(hash)
    })
  }, [])

  return [route, navigate]
}
