import type { DragTable } from '../../../engine/drag'
import type { PresetDrag, RealPreset, Sourced, Trust } from '../types'

const s = <T,>(value: T, trust: Trust, source: string): Sourced<T> => ({ value, trust, source })

const SIGHT = 'estimate: nobody publishes the sight height'
const NO_TEMP = s(15, 'N', 'estimate: ICAO standard, the maker gives none')
const NO_SENS = s(0, 'N', 'no maker publishes it')
const NATO_V24 = 'NATO V24 standard, recalculated'

// McCoy, BRL-MR-3810 (1990), Table 2: Ball M33, measured C_D vs Mach (spark range, yaw 1.6-3.5 deg).
const M33_CD: DragTable = [
  [0.551, 0.1324], [0.606, 0.123], [0.888, 0.1372], [0.918, 0.1505], [0.989, 0.3215], [1.003, 0.3461],
  [1.041, 0.3569], [1.158, 0.3757], [1.222, 0.3725], [1.475, 0.3637], [1.516, 0.3489], [1.953, 0.341],
  [1.972, 0.3171], [2.57, 0.2923], [2.589, 0.2971], [2.653, 0.2813],
]

const g7 = (bc: number): PresetDrag => ({ model: 'G7', bc })

export const PRESETS: RealPreset[] = [
  {
    id: 'p1', rifle: 'CZ BREN 2 14″', round: 'S&B 5.56 SS109', short: '5.56 SS109 62', users: ['army'],
    barrel: s('14″', 'S', 'CZ BREN 2 14″ (357 mm), Army contract 27/2023'),
    twistIn: s(7, 'V', 'CZ, 1:7″'), twist: 'right',
    sightHeightMm: s(65, 'N', SIGHT),
    accuracyMoa: s(3, 'N', 'estimate: NATO allows 1.25 MOA SD per round'), groupShots: 3,
    muzzleVelocityMs: s(885, 'N', `estimate: 357 mm barrel from ${NATO_V24}`),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.151), 'N', 'Litz, M855'),
    bullet: {
      massGr: s(62, 'S', 'SS109 / M855'), diameterIn: s(0.224, 'S', '5.56 mm'),
      lengthMm: s(23.0, 'S', 'SS109 / M855'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p2', rifle: 'HK416 11″', round: '5.56 SS109', short: '5.56 SS109 62', users: ['police'],
    barrel: s('11″', 'S', 'Police contracts, HK416 11″ (279 mm)'),
    twistIn: s(7, 'S', 'HK416 1:7″'), twist: 'right',
    sightHeightMm: s(65, 'N', SIGHT),
    accuracyMoa: s(3, 'N', 'estimate: NATO allows 1.25 MOA SD per round'), groupShots: 3,
    muzzleVelocityMs: s(800, 'N', 'rough estimate for an 11″ barrel; police ammo unverified'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.151), 'N', 'Litz, M855'),
    bullet: {
      massGr: s(62, 'S', 'SS109 / M855'), diameterIn: s(0.224, 'S', '5.56 mm'),
      lengthMm: s(23.0, 'S', 'SS109 / M855'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p3', rifle: 'CZ BREN 2 PPS', round: 'S&B 7.62×51 FMJ NATO 147 gr', short: '7.62×51 FMJ 147', users: ['army'],
    barrel: s('475 mm', 'S', 'CZ and 7th brigade page (Army news says 457 mm)'),
    twistIn: s(11, 'S', 'CZ, 1:11″'), twist: 'right',
    sightHeightMm: s(65, 'N', SIGHT),
    accuracyMoa: s(2, 'S', 'Army news 24 Jan 2022, 2 MOA at 600 m'), groupShots: 3,
    muzzleVelocityMs: s(825, 'N', 'estimate: 475 mm barrel from S&B 850-856 m/s'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.204), 'S', 'S&B 147 gr FMJ, same bullet likely'),
    bullet: {
      massGr: s(147, 'S', 'S&B FMJ NATO'), diameterIn: s(0.308, 'S', '7.62 mm'),
      lengthMm: s(27.9, 'S', 'M80-type 147 gr FMJ'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p4', rifle: 'HK417 16.5″', round: 'S&B .308 HPBT 168 gr', short: '.308 HPBT 168', users: ['police'],
    barrel: s('16.5″', 'S', 'Police contracts, HK417 16.5″'),
    twistIn: s(11, 'N', 'Wikipedia, HK does not publish it'), twist: 'right',
    sightHeightMm: s(65, 'N', SIGHT),
    accuracyMoa: s(1.5, 'N', 'estimate: taken from the G28 (secondary)'), groupShots: 3,
    muzzleVelocityMs: s(750, 'N', 'estimate: 16.5″ barrel; police ammo unknown'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.231), 'S', 'S&B HPBT 168 gr'),
    bullet: {
      massGr: s(168, 'S', 'S&B HPBT'), diameterIn: s(0.308, 'S', '.308'),
      lengthMm: s(30.9, 'N', 'estimate: Sierra MatchKing of the same weight'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p5', rifle: 'Sako TRG-22 A1', round: 'S&B .308 HPBT 175 gr', short: '.308 HPBT 175', users: ['police', 'army'],
    barrel: s('508 mm', 'S', 'Sako B2B catalogue (Army TRG-22 uses 510 mm)'),
    twistIn: s(11, 'V', 'Sako B2B catalogue, 1:11″'), twist: 'right',
    sightHeightMm: s(60, 'N', SIGHT),
    accuracyMoa: s(1, 'S', 'Sako, guaranteed sub-MOA'), groupShots: 3,
    muzzleVelocityMs: s(775, 'S', 'estimate: 508 mm barrel from S&B 800 m/s at 600 mm'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.239), 'S', 'S&B, fits its own 1000 m drop'),
    bullet: {
      massGr: s(175, 'S', 'S&B HPBT'), diameterIn: s(0.308, 'S', '.308'),
      lengthMm: s(31.5, 'N', 'estimate: Sierra 175 SMK'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p6', rifle: 'Sako TRG-42 A1 27″', round: 'Lapua Scenar 300 gr GB528', short: '.338 LM Scenar 300', users: ['police'],
    barrel: s('690 mm', 'V', 'Sako B2B catalogue, 690 mm'),
    twistIn: s(10, 'V', 'Sako B2B catalogue, 1:10″'), twist: 'right',
    sightHeightMm: s(60, 'N', SIGHT),
    accuracyMoa: s(1, 'S', 'Sako, guaranteed sub-MOA'), groupShots: 3,
    muzzleVelocityMs: s(820, 'V', 'Lapua, 680 mm test barrel'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.38), 'S', 'Lapua table fits 0.38; Lapua publishes 0.368'),
    bullet: {
      massGr: s(300, 'S', 'Lapua Scenar GB528'), diameterIn: s(0.338, 'S', '.338'),
      lengthMm: s(44.0, 'S', 'Lapua, 1.733″'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p7', rifle: 'AI AXSR / AXMC .338 27″', round: 'Lapua Scenar 250 gr GB488', short: '.338 LM Scenar 250', users: ['army', 'police'],
    barrel: s('686 mm', 'V', 'AI AXSR/AXMC 27″; Lapua test barrel 680 mm'),
    twistIn: s(9.35, 'V', 'Accuracy International, 1:9.35″'), twist: 'right',
    sightHeightMm: s(60, 'N', SIGHT),
    accuracyMoa: s(1, 'N', 'estimate: AI gives none'), groupShots: 3,
    muzzleVelocityMs: s(900, 'S', 'Lapua, 680 mm test barrel'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.322), 'V', 'Lapua, Doppler'),
    bullet: {
      massGr: s(250, 'S', 'Lapua Scenar GB488'), diameterIn: s(0.338, 'S', '.338'),
      lengthMm: s(39.4, 'S', 'Lapua'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p8', rifle: 'Desert Tech HTI', round: 'DTM .375 CheyTac 352 gr', short: '.375 CheyTac DTM 352', users: ['army'],
    barrel: s('29″', 'S', 'Desert Tech HTI 29″ (737 mm)'),
    twistIn: s(10.25, 'S', 'Desert Tech, 1:10.25″'), twist: 'right',
    sightHeightMm: s(70, 'N', SIGHT),
    accuracyMoa: s(1, 'N', 'estimate'), groupShots: 3,
    muzzleVelocityMs: s(939, 'N', 'vendor only'),
    mvRefTempC: NO_TEMP,
    drag: s(g7(0.408), 'N', 'vendor only'),
    bullet: { massGr: s(352, 'S', 'DTM .375 CheyTac'), diameterIn: s(0.375, 'S', '.375'), lengthMm: null },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'p9', rifle: 'Desert Tech HTI', round: '12.7×99 ball (M33)', short: '12.7×99 M33 647', users: ['army'],
    barrel: s('29″', 'S', 'Desert Tech HTI 29″ (737 mm)'),
    twistIn: s(15, 'S', 'M2 barrel 1:15″, NATO standard'), twist: 'right',
    sightHeightMm: s(70, 'N', SIGHT),
    accuracyMoa: s(3, 'N', 'estimate'), groupShots: 3,
    muzzleVelocityMs: s(850, 'N', 'estimate: 29″ barrel; NATO V24 887-900 m/s from the 1.14 m M2'),
    mvRefTempC: NO_TEMP,
    drag: s(
      {
        table: M33_CD,
        sectionalDensity: 0.3564,
        noteKey: 'rm.curveNote',
      },
      'N',
      'McCoy BRL-MR-3810 (1990), Table 2; NATO reference round, not the army\'s Nammo/RUAG ammo',
    ),
    bullet: {
      massGr: s(647, 'S', 'M33 ball, 642-661 gr by source'), diameterIn: s(0.51, 'S', '12.7 mm'),
      lengthMm: s(57.9, 'S', 'M33 ball, 2.280″'),
    },
    powderSensMsPerC: NO_SENS, mvSdMs: null,
  },
  {
    id: 'custom', rifle: 'Custom', round: 'Custom', short: 'Custom', users: [],
    barrel: s('—', 'N', 'your entry'),
    twistIn: s(10, 'N', 'your entry'), twist: 'right',
    sightHeightMm: s(60, 'N', 'your entry'),
    accuracyMoa: s(1, 'N', 'your entry'), groupShots: 3,
    muzzleVelocityMs: s(800, 'N', 'your entry'),
    mvRefTempC: s(15, 'N', 'your entry'),
    drag: s(g7(0.3), 'N', 'your entry'),
    bullet: {
      massGr: s(175, 'N', 'your entry'), diameterIn: s(0.308, 'N', 'your entry'), lengthMm: s(31.5, 'N', 'your entry'),
    },
    powderSensMsPerC: s(0, 'N', 'your entry'), mvSdMs: null,
  },
]

export const DEFAULT_PRESET_ID = 'p7'

/** Distinct rifle names in PRESETS order. */
export function rifles(): string[] {
  return [...new Set(PRESETS.map((p) => p.rifle))]
}

export function roundsFor(rifle: string): RealPreset[] {
  return PRESETS.filter((p) => p.rifle === rifle)
}
