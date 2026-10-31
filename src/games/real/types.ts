import type { DragTable } from '../../engine/drag'
import type { TKey } from '../../i18n'

/** Research trust: V high (primary source for this exact rifle and round), S medium, N low (estimate). */
export type Trust = 'V' | 'S' | 'N'
export interface Sourced<T> { value: T; trust: Trust; source: string }
/** A measured table carries a note on what it was measured for, as an i18n key, shown in the calculation view. */
export type PresetDrag = { model: 'G1' | 'G7'; bc: number } | { table: DragTable; sectionalDensity: number; noteKey: TKey }

export interface RealPreset {
  id: string
  /** Groups rounds under one rifle tag, e.g. 'Desert Tech HTI'. */
  rifle: string
  round: string
  /** The round tag's text: calibre, bullet and weight, at most 22 characters (`.338 LM Scenar 250`). */
  short: string
  users: ('army' | 'police')[]
  barrel: Sourced<string>
  twistIn: Sourced<number>
  twist: 'right' | 'left'
  sightHeightMm: Sourced<number>
  accuracyMoa: Sourced<number>
  groupShots: 3 | 5
  muzzleVelocityMs: Sourced<number>
  mvRefTempC: Sourced<number>
  drag: Sourced<PresetDrag>
  bullet: { massGr: Sourced<number>; diameterIn: Sourced<number>; lengthMm: Sourced<number> | null }
  powderSensMsPerC: Sourced<number>
  mvSdMs: Sourced<number> | null
}
