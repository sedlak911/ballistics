import { effectiveMoa } from '../../engine/aim'
import type { DragModel } from '../../engine/drag'
import type { Projectile } from '../../engine/trajectory'
import constantsRaw from './data/ballistics-constants.json'
import { byId } from './data'
import { ratingsFor } from './penetration'
import type { GzwAmmo, GzwBarrel, GzwData, GzwWeapon } from './types'

export interface BallisticConstant {
  dragModel: DragModel
  bc: number
  massGr?: number
  source: string
}

const constants = constantsRaw as Record<string, BallisticConstant>

/** The round's own real-world constant, else its caliber's generic one. */
export function constantFor(ammo: GzwAmmo): { constant: BallisticConstant; generic: boolean } | null {
  const own = constants[ammo.id]
  if (own) return { constant: own, generic: false }
  const cal = constants[`_caliber:${ammo.caliber}`]
  return cal ? { constant: cal, generic: true } : null
}

const hasVelocity = (a: GzwAmmo) => a.muzzleVelocityMs !== null

/** Best penetration first, then faster rounds. */
export function workbenchAmmo(d: GzwData, w: GzwWeapon): GzwAmmo[] {
  const total = (a: GzwAmmo) => ratingsFor(a).ratings.reduce<number>((s, r) => s + r, 0)
  return w.ammoIds
    .map((id) => byId(d.ammo, id))
    .filter((a): a is GzwAmmo => a !== undefined && hasVelocity(a))
    .sort((a, b) => total(b) - total(a) || b.muzzleVelocityMs! - a.muzzleVelocityMs!)
}

/** Weapons that can mount a magnified scope; shotguns are penetration-only. */
export function workbenchWeapons(d: GzwData): GzwWeapon[] {
  return d.weapons.filter((w) => w.scopeIds.length > 0 && w.type !== 'Shotgun' && workbenchAmmo(d, w).length > 0)
}

/**
 * The round as it leaves this barrel. A barrel whose speed change is unknown (`null`) keeps the round's own speed.
 * Takes rounds from `workbenchAmmo`, which have a speed; a 0 m/s round would give a one-point trajectory.
 */
export function projectileFor(ammo: GzwAmmo, barrel: GzwBarrel | null): { projectile: Projectile; genericBc: boolean } {
  const c = constantFor(ammo)
  const velocityFactor = 1 + (barrel?.velocityModifierPct ?? 0) / 100
  return {
    projectile: {
      muzzleVelocityMs: (ammo.muzzleVelocityMs ?? 0) * velocityFactor,
      bc: c?.constant.bc ?? 0.15,
      dragModel: c?.constant.dragModel ?? 'G7',
    },
    genericBc: c?.generic ?? true,
  }
}

/** `readMoa` is the weapon's accuracy as the game shows it (all attachments); it replaces the barrel and weapon values. */
export function accuracyFor(w: GzwWeapon, barrel: GzwBarrel | null, ammo: GzwAmmo, readMoa: number | null = null): number | null {
  return effectiveMoa(readMoa ?? barrel?.accuracyMoa ?? w.accuracyMoa, ammo.accuracyModifierPct)
}
