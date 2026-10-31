import type { DataInfo } from '../../components/InfoSheet'
import { gzw } from './data'
import { WorkbenchPage } from './pages/WorkbenchPage'

export const gzwInfo: DataInfo = {
  version: gzw.version,
  patch: gzw.gamePatch,
  builtAt: gzw.builtAt,
  credits: [
    { label: 'gzw-data.dev', href: 'https://gzw-data.dev' },
    { label: 'GZW Fandom wiki (CC BY-SA 3.0)', href: 'https://gray-zone-warfare.fandom.com/wiki/Ballistics' },
  ],
}

export function GzwApp() {
  return <WorkbenchPage />
}
