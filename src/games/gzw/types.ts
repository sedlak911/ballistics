// Mirrors src/games/gzw/data/gzw-data.json, produced by scripts/build_gzw_data.py.

export const NIJ_CLASSES = ['I', 'IIA', 'IIA+', 'IIIA', 'IIIA+', 'III', 'III+', 'III++'] as const
export type NijClass = (typeof NIJ_CLASSES)[number]

/** 2 = usually penetrates, 1 = magdump only, 0 = pointless. */
export type PenRating = 0 | 1 | 2

export interface GzwWeapon {
  id: string
  name: string
  type: string | null
  caliber: string | null
  ammoIds: string[]
  accuracyMoa: number | null
  barrelIds: string[]
  scopeIds: string[]
  soldBy: string | null
}

export interface GzwBarrel {
  id: string
  name: string
  accuracyMoa: number | null
  velocityModifierPct: number | null
  soldBy: string | null
}

export interface GzwScope {
  id: string
  name: string
  magnification: string | null
  maxZeroM: number | null
  ffp: boolean
  soldBy: string | null
}

export interface GzwAmmo {
  id: string
  name: string
  caliber: string
  muzzleVelocityMs: number | null
  accuracyModifierPct: number | null
  /** "NIJ 0" … "NIJ IV": the lowest class that stops the round. */
  stoppedBy: string | null
  /** Wiki chart ratings for I … III++. */
  chart: PenRating[] | null
  soldBy: string | null
}

export type ArmorLocation = 'front' | 'back' | 'sides'

export interface GzwArmor {
  id: string
  name: string
  kind: 'helmet' | 'vest' | 'carrier'
  nijClass: NijClass | null
  locations: ArmorLocation[]
  material: string | null
  soldBy: string | null
}

export interface GzwData {
  version: string
  builtAt: string
  gamePatch: string | null
  weapons: GzwWeapon[]
  barrels: GzwBarrel[]
  scopes: GzwScope[]
  ammo: GzwAmmo[]
  armor: GzwArmor[]
}
