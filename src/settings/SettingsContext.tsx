import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { translate, type T } from '../i18n'
import type { Route } from '../router'
import { readDisplay, type Display } from './url'

const STORAGE_KEY = 'gb.display'

function loadStored(): Partial<Display> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Display>
  } catch {
    return {}
  }
}

function store(d: Display): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
  } catch {
    // Private mode or blocked storage: the URL still carries the choice.
  }
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
  const display = useMemo(() => readDisplay(route.params, loadStored()), [route.params])

  const setDisplay = useCallback(
    (patch: Partial<Display>) => {
      const next = { ...display, ...patch }
      store(next)
      const params = new URLSearchParams(route.params)
      params.set('l', next.lang)
      params.set('u', next.system)
      params.set('a', next.angle)
      // The one view has no switch; an old link's v= goes.
      params.delete('v')
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
