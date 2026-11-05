import { useEffect, useId, useRef, useState } from 'react'
import type { T } from '../i18n'

/**
 * ⚙'s last row: reset everything to defaults (spec §5, confirmation B). At rest a quiet text button after a hairline,
 * right-aligned like a section's reset; a tap turns the row into the question, the focus on `No`. `No` or Escape put it
 * back, the focus on the button again; Escape goes no further, so ⚙ stays open. Closing ⚙ unmounts the row, so it
 * reopens at rest.
 */
export function ResetRow({ t, onReset }: { t: T; onReset: () => void }) {
  const [asking, setAsking] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const no = useRef<HTMLButtonElement>(null)
  const keeps = useRef<HTMLParagraphElement>(null)
  // Only a way back returns the focus: at mount the row takes none.
  const back = useRef(false)
  const askId = useId()
  const keepsId = useId()

  useEffect(() => {
    if (asking) {
      // The keep line under the question is the row's end: a sheet that scrolls (a short phone) shows it whole.
      no.current?.focus({ preventScroll: true })
      keeps.current?.scrollIntoView?.({ block: 'nearest' })
    } else if (back.current) {
      back.current = false
      button.current?.focus()
    }
  }, [asking])

  const rest = () => {
    back.current = true
    setAsking(false)
  }

  if (!asking) {
    return (
      <div className="reset-row">
        <button ref={button} type="button" className="reset-button" onClick={() => setAsking(true)}>{t('reset.button')}</button>
      </div>
    )
  }
  return (
    <>
      <div className="reset-row is-asking" role="group" aria-labelledby={askId} aria-describedby={keepsId}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          rest()
        }}>
        <span id={askId} className="reset-ask">{t('reset.ask')}</span>
        <button type="button" className="btn ghost reset-yes" onClick={onReset}>{t('reset.yes')}</button>
        <button ref={no} type="button" className="btn ghost" onClick={rest}>{t('reset.no')}</button>
      </div>
      <p ref={keeps} id={keepsId} className="reset-keeps">{t('reset.keeps')}</p>
    </>
  )
}
