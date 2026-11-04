import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translate, type T } from '../i18n'
import { chooseLang, DISPLAY_KEY, langHref, pathLang } from '../lang'
import { leave } from '../leave'
import type { Route } from '../router'
import { routeHref } from '../routeHref'
import { readDisplay, type Display, type Lang } from './url'

function loadStored(): Partial<Display> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? '{}')
    return typeof v === 'object' && v !== null ? (v as Partial<Display>) : {}
  } catch {
    return {}
  }
}

function store(d: Partial<Display>): void {
  try {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(d))
  } catch {
    // Private mode or blocked storage: the URL still carries units and angles, and the path the language.
  }
}

/**
 * The language, once, when the app opens (R2): the path's (/cs/, /en/), else an old link's l= (tests and the bare dev
 * root), else the stored one, else the browser's. Links no longer write l=, so it is never read from them again.
 */
function initialLang(params: URLSearchParams): Lang {
  return pathLang(window.location.pathname) ?? chooseLang(params.get('l'), loadStored().lang, navigator.language)
}

interface Settings {
  display: Display
  setDisplay: (patch: Partial<Display>) => void
  t: T
  route: Route
  navigate: (r: Partial<Route>) => void
}

const Ctx = createContext<Settings | null>(null)

export function SettingsProvider({ route, navigate, children }: { route: Route; navigate: (r: Partial<Route>) => void; children: ReactNode }) {
  const [lang, setLang] = useState(() => initialLang(route.params))
  // Units and angles still follow the link; the language is the state above.
  const fromLink = useMemo(() => readDisplay(route.params, loadStored()), [route.params])
  const display = useMemo(() => ({ ...fromLink, lang }), [fromLink, lang])

  // On /cs/ or /en/ the stored language follows the page, so the root sends the next bare visit back here.
  useEffect(() => {
    if (pathLang(window.location.pathname) === lang && loadStored().lang !== lang) store({ ...loadStored(), lang })
  }, [lang])

  const setDisplay = useCallback(
    (patch: Partial<Display>) => {
      const next = { ...display, ...patch }
      store(next)
      // On a language's page, the other language is the other page, with the same hash.
      if (next.lang !== display.lang && pathLang(window.location.pathname) !== null) {
        leave(langHref(routeHref(), next.lang))
        return
      }
      setLang(next.lang)
      const params = new URLSearchParams(route.params)
      params.set('u', next.system)
      params.set('a', next.angle)
      // The one view has no switch; an old link's v= goes. So does its l=: a reload would read it before the stored choice.
      params.delete('v')
      params.delete('l')
      navigate({ params })
    },
    [display, route.params, navigate],
  )

  const t = useCallback<T>((key, vars) => translate(display.lang, key, vars), [display.lang])

  useEffect(() => {
    document.documentElement.lang = display.lang
  }, [display.lang])

  const value = useMemo(() => ({ display, setDisplay, t, route, navigate }), [display, setDisplay, t, route, navigate])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): Settings {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSettings outside SettingsProvider')
  return s
}
