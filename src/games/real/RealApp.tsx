import type { DataInfo } from '../../components/InfoSheet'
import { RealPage } from './pages/RealPage'

export const realInfo: DataInfo = {
  builtAt: '2026-10-31',
  // Real rifles: no game to disclaim, and the figures are ours to check (M3).
  notes: { before: null, after: 'info.realEstimates' },
  credits: [
    { label: 'Lapua (.338 data)', href: 'https://www.lapua.com/support/lapua-ballistics-app-2/' },
    { label: 'McCoy, BRL-MR-3810 (M33 drag curve)', href: 'https://apps.dtic.mil/sti/pdfs/ADA219106.pdf' },
    { label: 'Litz (spin drift, aerodynamic jump)', href: 'https://appliedballisticsllc.com/custom-drag-factor-cdf/' },
    { label: 'Miller (stability)', href: 'https://arxiv.org/abs/1410.5340' },
    { label: 'Open-Meteo (weather, CC BY 4.0)', href: 'https://open-meteo.com/' },
    { label: 'Copernicus DEM GLO-90 (elevation)', href: 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model' },
    { label: 'py-ballisticcalc (validation)', href: 'https://github.com/o-murphy/py-ballisticcalc' },
  ],
}

export function RealApp() {
  return <RealPage />
}
