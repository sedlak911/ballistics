import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { T } from '../i18n'
import { installNoteShown, installPlatform, isStandalone, markInstallNoteShown, useInstallPrompt } from '../install'
import { PHONE } from './useMedia'

/**
 * A one-time note on a phone's first visit, in the browser: how to add the app to the home screen. It decides once, at
 * mount, and never again, so it neither flips with the width nor shows from the home screen. It sits on <body> beside
 * the toast's box, under the page toast and the sheets (see .install-note).
 */
export function InstallNote({ t }: { t: T }) {
  const [open, setOpen] = useState(
    () => (window.matchMedia?.(PHONE)?.matches ?? false) && !isStandalone() && !installNoteShown(),
  )
  const prompt = useInstallPrompt()
  // Written after the read, so a StrictMode double render still sees the note unshown.
  useEffect(() => {
    if (open) markInstallNoteShown()
  }, [open])
  if (!open) return null
  const ios = installPlatform() === 'ios'
  return createPortal(
    <div className="toast install-note" role="status">
      <div className="toast-row">
        <span className="toast-text">{t('install.title')}</span>
        {prompt && (
          <button type="button" className="toast-action" onClick={() => { setOpen(false); prompt() }}>
            {t('install.button')}
          </button>
        )}
        <button type="button" className="toast-close" aria-label={t('toast.close')} onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <p className="install-note-line">{ios ? t('install.ios') : t('install.android')}</p>
      {ios && <p className="install-note-line install-note-own">{t('install.own')}</p>}
    </div>,
    document.body,
  )
}
