import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Route } from '../router'
import { buildHash } from '../router'
import type { T } from '../i18n'
import type { Display } from '../settings/url'
import { InfoSheet, type DataInfo } from './InfoSheet'
import { Logo } from './Logo'
import { Segmented } from './Segmented'
import { PHONE, useMedia } from './useMedia'

export interface GameTab {
  id: string
  name: string
  /** Shown instead of the name on a phone, where the full name doesn't fit. */
  short?: string
  available: boolean
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M16.1 8.1L18.5 8.8L18.5 11.2L16.1 11.9L15.7 13L16.9 15.2L15.2 16.9L13 15.7L11.9 16.1L11.2 18.5L8.8 18.5L8.1 16.1L7 15.7L4.8 16.9L3.1 15.2L4.3 13L3.9 11.9L1.5 11.2L1.5 8.8L3.9 8.1L4.3 7L3.1 4.8L4.8 3.1L7 4.3L8.1 3.9L8.8 1.5L11.2 1.5L11.9 3.9L13 4.3L15.2 3.1L16.9 4.8L15.7 7Z" />
      <circle cx="10" cy="10" r="2.6" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="10" cy="10" r="8.2" />
      <path d="M10 9v5.2" />
      <circle cx="10" cy="6.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

type Sheet = 'settings' | 'info'

/**
 * Slides the header away while the page scrolls down and back on the way up; always shown near the top. `over`: the
 * page has scrolled under the header, which then needs a ground of its own.
 */
function useHeaderScroll(pinned: boolean): { hidden: boolean; over: boolean } {
  const [hidden, setHidden] = useState(false)
  const [over, setOver] = useState(() => window.scrollY > 0)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setOver(y > 0)
      if (Math.abs(y - last) < 4) return
      setHidden(y > last && y > 64)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return { hidden: hidden && !pinned, over }
}

export function AppHeader({ route, games, display, setDisplay, t, slotRef, info, extraSettings }: {
  route: Route
  games: GameTab[]
  display: Display
  setDisplay: (patch: Partial<Display>) => void
  t: T
  /** Receives the slot pages fill through HeaderSlot. */
  slotRef?: (el: HTMLDivElement | null) => void
  /** The data credits for the ⓘ sheet; null on a game without data. */
  info: DataInfo | null
  /** A game's own rows, after the shared ones in the ⚙ sheet. */
  extraSettings?: ReactNode
}) {
  const href = (patch: Partial<Route>) => buildHash({ ...route, ...patch })
  const [open, setOpen] = useState<Sheet | null>(null)
  const { hidden, over } = useHeaderScroll(open !== null)
  const phone = useMedia(PHONE)
  const settingsRef = useRef<HTMLButtonElement>(null)
  const infoRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const toggle = (s: Sheet) => setOpen((o) => (o === s ? null : s))

  // One sheet at a time. It closes on Escape and on a click anywhere outside it; its button toggles it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(null)
      ;(open === 'info' ? infoRef : settingsRef).current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!sheetRef.current?.contains(target) && !settingsRef.current?.contains(target) && !infoRef.current?.contains(target)) setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <header className={`app-header${hidden ? ' hidden' : ''}${over ? ' over' : ''}`}>
      <a className="logo" href={href({ page: 'workbench' })}>
        <Logo />
        <span>
          <b>BALLISTICS</b>
          <small>CALCULATOR</small>
        </span>
      </a>
      <nav className="games" aria-label="Game">
        {games.map((g) => (
          <a key={g.id} href={href({ game: g.id, page: 'workbench' })} aria-current={g.id === route.game ? 'true' : undefined}
            className={g.available ? undefined : 'unavailable'}>
            {phone && g.short ? g.short : g.name}
            {!g.available && <span className="soon">{t('soon')}</span>}
          </a>
        ))}
      </nav>
      <div className="header-slot" ref={slotRef} />
      <div className="toggles">
        <button ref={infoRef} type="button" className="icon-btn hdr-btn info" aria-label={t('hdr.info')} title={t('hdr.info')}
          aria-expanded={open === 'info'} onClick={() => toggle('info')}>
          <InfoIcon />
        </button>
        <button ref={settingsRef} type="button" className="icon-btn hdr-btn settings" aria-label={t('hdr.settings')} title={t('hdr.settings')}
          aria-expanded={open === 'settings'} onClick={() => toggle('settings')}>
          <GearIcon />
        </button>
      </div>
      {open === 'info' && (
        <div ref={sheetRef} className="sheet info-sheet panel" role="dialog" aria-label={t('hdr.info')}>
          <InfoSheet info={info} t={t} game={route.game} />
        </div>
      )}
      {open === 'settings' && (
        <div ref={sheetRef} className="sheet settings-sheet panel" role="dialog" aria-label={t('hdr.settings')}>
          <div className="sheet-row">
            <span className="label">{t('toggle.lang')}</span>
            <Segmented label={t('toggle.lang')} value={display.lang} onChange={(lang) => setDisplay({ lang })}
              options={[{ value: 'en', label: 'EN' }, { value: 'cs', label: 'CS' }]} />
          </div>
          <div className="sheet-row">
            <span className="label">{t('toggle.units')}</span>
            <Segmented label={t('toggle.units')} value={display.system} onChange={(system) => setDisplay({ system })}
              options={[{ value: 'metric', label: 'm' }, { value: 'imperial', label: 'yd' }]} />
          </div>
          <div className="sheet-row">
            <span className="label">{t('toggle.angle')}</span>
            <Segmented label={t('toggle.angle')} value={display.angle} onChange={(angle) => setDisplay({ angle })}
              options={[{ value: 'mil', label: route.game === 'real' ? 'MRAD' : 'MIL' }, { value: 'moa', label: 'MOA' }]} />
          </div>
          {extraSettings}
        </div>
      )}
    </header>
  )
}
