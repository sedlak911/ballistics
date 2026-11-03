import type { T, TKey } from '../i18n'
import { APP_VERSION } from '../version'

export interface DataInfo {
  /** Absent on a game with no data build of its own; the sheet then shows only the build date. */
  version?: string
  patch?: string | null
  builtAt: string
  credits: { label: string; href: string }[]
  /**
   * The sheet's two notes as i18n keys, when not the game ones: the line before the data (the fan-project note) and the
   * one after it (the estimates note). Null leaves a note out. A page with no game to disclaim passes its own.
   */
  notes?: { before: TKey | null; after: TKey | null }
  /** "How to read the answer": each term as the page shows it, with what it means. Absent: the sheet has no help part. */
  help?: { term: TKey; text: TKey }[]
}

const GAME_NOTES = { before: 'info.fan', after: 'info.estimates' } as const

/** The whole site's, so every page shows all of it: what stays in the browser and what leaves it. */
const PRIVACY: TKey[] = ['info.privacy.storage', 'info.privacy.location', 'info.privacy.screenshot', 'info.privacy.hosting', 'info.privacy.none']

/**
 * What the site is and where its data comes from: the fan-project note, how to read the answer, the data version and
 * the credits, then privacy and the app's version. Help and privacy start closed, so the sheet stays short.
 */
export function InfoSheet({ info, t }: { info: DataInfo | null; t: T }) {
  const notes = info?.notes ?? GAME_NOTES
  return (
    <div className="info-body">
      {notes.before && <p>{t(notes.before)}</p>}
      {info?.help && (
        <details className="info-more">
          <summary>{t('info.help')}</summary>
          <dl>
            {info.help.map((h) => (
              <div key={h.term}>
                <dt>{t(h.term)}</dt>
                <dd>{t(h.text)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {info && (
        <p>
          {info.version === undefined
            ? t('info.builtOnly', { built: info.builtAt.slice(0, 10) })
            : t('info.data', { version: info.version.slice(0, 10), patch: info.patch ?? '?', built: info.builtAt.slice(0, 10) })}
          <br />
          {t('info.credits')}:{' '}
          {info.credits.map((c, i) => (
            <span key={c.href}>
              {i > 0 && ', '}
              <a href={c.href} target="_blank" rel="noreferrer">{c.label}</a>
            </span>
          ))}
        </p>
      )}
      {notes.after && <p>{t(notes.after)}</p>}
      <details className="info-more">
        <summary>{t('info.privacy')}</summary>
        {PRIVACY.map((k) => <p key={k}>{t(k)}</p>)}
      </details>
      <p>{t('info.version', { v: APP_VERSION })}</p>
    </div>
  )
}
