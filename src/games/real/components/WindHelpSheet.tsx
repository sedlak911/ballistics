import { useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useModalSheet } from '../../../components/useModalSheet'
import { useSettings } from '../../../settings/SettingsContext'
import { SHEET_BACKDROP } from './CalcSheet'
import { CloseIcon } from './icons'
import './calc.css'

const MIRAGE = ['mirage.1', 'mirage.2', 'mirage.3', 'mirage.4'] as const
const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5'] as const

/** How to read the wind: at the rifle, by mirage at the middle, by flags and a speed table far out. A side sheet like the calculation. */
export function WindHelpSheet({ onClose, returnFocus }: { onClose: () => void; returnFocus: RefObject<HTMLElement | null> }) {
  const { t } = useSettings()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const trap = useModalSheet(ref, closeRef, onClose, returnFocus)
  // On <body>, so no sticky bar or stacked column paints over it.
  return createPortal(
    <div className={SHEET_BACKDROP} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="calc-sheet panel wind-help" role="dialog" aria-modal="true" aria-labelledby="wind-help-title" tabIndex={-1} onKeyDown={trap}>
        <div className="calc-head">
          <h2 id="wind-help-title">{t('zones.help')}</h2>
          <button ref={closeRef} type="button" className="icon-btn calc-close" aria-label={t('calc.close')} title={t('calc.close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="calc-body wind-help-body">
          <section>
            <h3>{t('help.wind.rifle.h')}</h3>
            <p>{t('help.wind.rifle.p')}</p>
          </section>
          <section>
            <h3>{t('help.wind.mirage.h')}</h3>
            <ul>{MIRAGE.map((k) => <li key={k}>{t(`help.wind.${k}`)}</li>)}</ul>
          </section>
          <section>
            <h3>{t('help.wind.far.h')}</h3>
            <p>{t('help.wind.far.p')}</p>
            <table>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r}>
                    <th scope="row" className="num">{t(`help.wind.${r}.v`)}</th>
                    <td>{t(`help.wind.${r}.d`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="wind-help-note">{t('help.wind.note')}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
