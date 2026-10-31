import type { Setup } from '../../../settings/url'
import type { ImportSelection } from '../components/ImportDialog'
import { byId, gzw } from '../data'
import { WEAPONS } from '../setup'
import type { GzwAmmo, GzwBarrel, GzwWeapon } from '../types'
import { projectileFor, workbenchAmmo } from '../workbench'

export const onBench = (w: GzwWeapon) => WEAPONS.some((x) => x.id === w.id)

/**
 * What an accepted import changes in the setup: weapon, parts, accuracy and a round.
 * A weapon the app can't show changes nothing; its parts and accuracy would describe another gun.
 */
export function applyImport(s: ImportSelection, ctx: { currentWeapon: GzwWeapon }): { setup: Partial<Setup> } {
  const setup: Partial<Setup> = {}
  const shown = s.weapon !== null && onBench(s.weapon)
  const forBench = s.weapon === null || shown
  if (shown) setup.weaponId = s.weapon!.id
  if (s.barrel && forBench) setup.barrelId = s.barrel.id
  if (s.scope && forBench) setup.scopeId = s.scope.id
  if (s.accuracyMoa !== null && forBench) setup.accuracyMoa = s.accuracyMoa
  if (s.ammo && (shown ? s.weapon! : ctx.currentWeapon).ammoIds.includes(s.ammo.id)) setup.ammoId = s.ammo.id
  return { setup }
}

/**
 * Of the weapons the app can show, the one whose bullet leaves the muzzle fastest: each with its best round found on
 * the screen (else its best round) through its barrel found there (else its first). Ties go to the first on screen.
 */
export function fastestWeapon(weapons: GzwWeapon[], ctx: { barrels: GzwBarrel[]; ammo: GzwAmmo[] }): GzwWeapon | null {
  let fastest: GzwWeapon | null = null
  let fastestMs = -Infinity
  for (const w of weapons.filter(onBench)) {
    const rounds = workbenchAmmo(gzw, w)
    const round = rounds.find((a) => ctx.ammo.some((f) => f.id === a.id)) ?? rounds[0]
    const barrel = ctx.barrels.find((b) => w.barrelIds.includes(b.id)) ?? byId(gzw.barrels, w.barrelIds[0]) ?? null
    const ms = projectileFor(round, barrel).projectile.muzzleVelocityMs
    if (ms > fastestMs) {
      fastest = w
      fastestMs = ms
    }
  }
  return fastest
}
