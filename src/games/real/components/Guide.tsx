import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { TKey } from '../../../i18n'
import { installPlatform, isStandalone, useInstallPrompt } from '../../../install'
import { useSettings } from '../../../settings/SettingsContext'
import { closeGuide, guidePages, type GuidePage } from '../guide'
import { useRealProfile } from '../profile'
import { hasCompass } from './compass'
import { CloseIcon } from './icons'
import './guide.css'

/** A swipe: at least this far sideways, and more than twice as far sideways as up or down. */
const SWIPE_PX = 40

/**
 * The guide: a card at the bottom of the screen that doesn't dim or block the page. All its pages sit in one grid cell,
 * so the card takes the height of the tallest and the buttons stay put from page to page. The pages are decided once,
 * at mount.
 */
export function Guide({ returnFocus, phone: phoneNow }: { returnFocus: HTMLElement | null; phone: boolean }) {
  const { t } = useSettings()
  const [, setProfile] = useRealProfile()
  const prompt = useInstallPrompt()
  // The device decision is made once, at mount: turning the phone across the breakpoint must not change the pages.
  const [phone] = useState(phoneNow)
  const [pages] = useState(() => guidePages({ phone, standalone: isStandalone() }))
  const [at, setIndex] = useState(0)
  const index = Math.min(at, pages.length - 1)
  const id = useId()
  const card = useRef<HTMLElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const hadFocus = useRef(false)
  const down = useRef<{ x: number; y: number } | null>(null)
  const last = index === pages.length - 1
  const titleId = (i: number) => `${id}-t${i}`

  useEffect(() => {
    setProfile({ guideSeen: true })
  }, [setProfile])
  // Opened from ⓘ, the shown title takes the focus; opened by itself, nothing does.
  useEffect(() => {
    if (returnFocus) card.current?.querySelector<HTMLElement>(`[id="${titleId(0)}"]`)?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (to: number) => {
    const next = Math.min(pages.length - 1, Math.max(0, to))
    if (next === index) return
    hadFocus.current = card.current?.contains(document.activeElement) ?? false
    setIndex(next)
  }
  // On desktop the card stands above the bottom bar the pages talk about: `--guide-lift` is how much of the screen's
  // foot the bar takes, kept as the bar grows, the window changes and the page scrolls (guide.css). A bar below the
  // screen's foot (a short window) takes none. On a phone the card stays over the dock.
  useLayoutEffect(() => {
    const el = card.current
    if (phoneNow || !el) return
    const place = () => {
      const top = document.querySelector('.real-bar')?.getBoundingClientRect().top
      const lift = top === undefined ? 0 : Math.min(Math.max(0, window.innerHeight - top), window.innerHeight / 2)
      el.style.setProperty('--guide-lift', `${Math.round(lift)}px`)
    }
    place()
    const bar = document.querySelector('.real-bar')
    const observer = bar && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    if (bar) observer?.observe(bar)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, { passive: true })
    // The bar slides in as the page opens (`.enter`): measured again once it has.
    document.addEventListener('animationend', place)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place)
      document.removeEventListener('animationend', place)
      el.style.removeProperty('--guide-lift')
    }
  }, [phoneNow])

  // A Back that goes away with the first page must not drop the focus out of the card.
  useLayoutEffect(() => {
    if (hadFocus.current && !card.current?.contains(document.activeElement)) nextBtn.current?.focus()
    hadFocus.current = false
  }, [index])

  const close = () => {
    closeGuide()
    if (returnFocus?.isConnected) returnFocus.focus()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowRight') go(index + 1)
    else if (e.key === 'ArrowLeft') go(index - 1)
  }
  const onPointerUp = (e: PointerEvent) => {
    const from = down.current
    down.current = null
    if (!from) return
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) go(index + (dx < 0 ? 1 : -1))
  }

  const text = (page: GuidePage): { title: TKey; body: ReactNode } => {
    switch (page) {
      case 'install': {
        const ios = installPlatform() === 'ios'
        return {
          title: 'guide.install.title',
          body: (
            <>
              <p>{t('guide.install.why')}</p>
              <p>{t(ios ? 'guide.install.ios' : 'install.android')}</p>
              {ios && <p>{t('guide.install.camera')}</p>}
              {!ios && prompt && <button type="button" className="btn ghost guide-install" onClick={prompt}>{t('install.button')}</button>}
            </>
          ),
        }
      }
      case 'rifle':
        return { title: 'guide.rifle.title', body: <><p>{t('guide.rifle.text')}</p><p>{t('guide.rifle.colours')}</p></> }
      case 'weather':
        return { title: 'guide.weather.title', body: <p>{t('guide.weather.text')}</p> }
      case 'wind':
        return { title: 'guide.wind.title', body: <p>{t('guide.wind.text')}</p> }
      case 'direction':
        return { title: 'guide.direction.title', body: <p>{t(phone && hasCompass() ? 'guide.direction.aim' : 'guide.direction.typed')}</p> }
      case 'distance':
        return { title: 'guide.distance.title', body: <p>{t(phone ? 'guide.distance.phone' : 'guide.distance.desktop')}</p> }
    }
  }

  return createPortal(
    <section ref={card} className="guide-card" aria-labelledby={titleId(index)} onKeyDown={onKeyDown}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY } }} onPointerUp={onPointerUp}
      onPointerCancel={() => { down.current = null }}>
      <div className="guide-head">
        <span className="label guide-count" aria-live="polite">{t('guide.count', { n: index + 1, total: pages.length })}</span>
        <button type="button" className="icon-btn" aria-label={t('guide.close')} title={t('guide.close')} onClick={close}>
          <CloseIcon />
        </button>
      </div>
      <div className="guide-pages">
        {pages.map((page, i) => {
          const { title, body } = text(page)
          const shown = i === index
          return (
            <div key={page} className="guide-page" data-shown={shown} aria-hidden={shown ? undefined : true} inert={!shown}>
              <h2 id={titleId(i)} className="guide-title" tabIndex={-1}>{t(title)}</h2>
              {body}
            </div>
          )
        })}
      </div>
      <div className="guide-foot">
        <div className="guide-dots" aria-hidden="true">
          {pages.map((p, i) => <span key={p} className="guide-dot" data-current={i === index} />)}
        </div>
        <div className="guide-buttons">
          {index > 0 && <button type="button" className="btn ghost" onClick={() => go(index - 1)}>{t('guide.back')}</button>}
          <button ref={nextBtn} type="button" className="btn primary" onClick={() => (last ? close() : go(index + 1))}>
            {t(last ? 'guide.done' : 'guide.next')}
          </button>
        </div>
      </div>
    </section>,
    document.body,
  )
}
