import { useId, type ReactNode } from 'react'
import { ChipGroup } from '../../../components/ChipGroup'
import { useSettings } from '../../../settings/SettingsContext'
import type { GzwWeapon } from '../types'

/**
 * The first visit asks for a weapon before anything else: a pick (which comes with its best round) or a screenshot
 * of the character with the inventory and the weapon detail open.
 */
export function FirstSetup({ weapons, onWeapon, importControl }: {
  weapons: GzwWeapon[]
  onWeapon: (id: string) => void
  importControl: ReactNode
}) {
  const { t } = useSettings()
  const titleId = useId()
  return (
    <section className="first-setup panel enter" aria-labelledby={titleId}>
      <header className="panel-h">
        <h2 id={titleId} className="h-panel">{t('fs.title')}</h2>
      </header>
      <div className="panel-b">
        <p className="note">{t('fs.hint')}</p>
        <ChipGroup label={t('wb.weapon')} value={null} onChange={onWeapon}
          options={weapons.map((w) => ({ value: w.id, label: w.name, title: w.caliber ?? undefined }))} />
        <div className="fs-or">
          <p className="note">{t('fs.screenshot')}</p>
          {importControl}
        </div>
      </div>
    </section>
  )
}
