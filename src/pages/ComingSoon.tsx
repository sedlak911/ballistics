import { useSettings } from '../settings/SettingsContext'
import type { TKey } from '../i18n'
import './coming-soon.css'

// What a game needs before its workbench can ship: [label, note, ready].
const STATUS: [TKey, TKey, boolean][] = [
  ['comingSoon.engine', 'comingSoon.engineNote', true],
  ['comingSoon.data', 'comingSoon.dataNote', false],
  ['comingSoon.check', 'comingSoon.checkNote', false],
]

/** A reticle with hashes, drawn in the accent. Decoration only. */
function Reticle() {
  const ticks = []
  for (let i = -6; i <= 6; i++) {
    if (i === 0) continue
    const len = i % 2 === 0 ? 7 : 4
    const p = 100 + i * 12
    ticks.push(`M${p} ${100 - len}V${100 + len}`, `M${100 - len} ${p}H${100 + len}`)
  }
  return (
    <svg className="soon-reticle" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <circle cx="100" cy="100" r="3" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d="M4 100H92M108 100H196M100 4V92M100 108V196" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={ticks.join('')} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ComingSoon({ game, url }: { game?: string; url?: string }) {
  const { t } = useSettings()
  if (!game) {
    return (
      <section className="coming-soon">
        <h1>{t('comingSoon.title')}</h1>
        <p>{t('comingSoon.page')}</p>
      </section>
    )
  }
  return (
    <section className="soon-page">
      <div className="glow soon-glow" aria-hidden="true" />
      <Reticle />
      <div className="soon-copy">
        <p className="eyebrow">{t('app.name')}</p>
        <h1>
          {game} <span>{t('comingSoon.title')}</span>
        </h1>
        <p className="soon-lead">{t('comingSoon.game', { game })}</p>
        <div className="soon-actions">
          <a className="btn primary" href="#/gzw/workbench">
            {t('comingSoon.back')}
          </a>
          {url && (
            <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
              {t('comingSoon.link', { game })} ↗
            </a>
          )}
        </div>
      </div>
      <div className="panel soon-status">
        <div className="panel-h">
          <h2 className="h-panel">{t('comingSoon.status')}</h2>
        </div>
        <ul className="panel-b soon-rows">
          {STATUS.map(([label, note, ready]) => (
            <li key={label}>
              <div>
                <b>{t(label)}</b>
                <small>{t(note)}</small>
              </div>
              <span className={ready ? 'tag acc' : 'tag'}>{t(ready ? 'comingSoon.ready' : 'comingSoon.needed')}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
