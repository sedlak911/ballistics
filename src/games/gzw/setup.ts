import { useCallback, useEffect, useMemo } from 'react'
import { useSettings } from '../../settings/SettingsContext'
import { hasSetupParams, readSetup, writeSetup, type IdField, type Setup } from '../../settings/url'
import { byId, byName, gzw } from './data'
import type { GzwAmmo, GzwBarrel, GzwScope, GzwWeapon } from './types'
import { workbenchAmmo, workbenchWeapons } from './workbench'

export const WEAPONS = workbenchWeapons(gzw)
// One array per weapon, so trajectories memoised on it survive distance and movement changes.
const AMMO = new Map(WEAPONS.map((w) => [w.id, workbenchAmmo(gzw, w)]))
/** The weapon's best round: what a weapon picked by hand comes with. */
export const bestAmmoId = (weaponId: string) => AMMO.get(weaponId)?.[0]?.id

const idOf = <T extends { id: string; name: string }>(list: T[], name: string) => byName(list, name)?.id ?? list[0]?.id ?? ''

// Defaults are looked up by name, never hard-coded ids.
const DEFAULTS: Setup = {
  weaponId: idOf(WEAPONS, 'M700'),
  barrelId: byName(gzw.barrels, 'M700 Barrel - 22"')?.id ?? null,
  scopeId: idOf(gzw.scopes, 'Vudu 3.5-18x50 FFP Rifle Scope'),
  zeroM: 100,
  ammoId: idOf(gzw.ammo, '7.62x51mm FMJ (M80A1)'),
  distanceM: 100,
  movement: 'standing',
  posture: 'standing',
  crossing: 90,
  direction: 1,
  accuracyMoa: null,
  rangeSigmaPct: 10,
}

const VALID: Record<IdField, Set<string>> = {
  weaponId: new Set(WEAPONS.map((w) => w.id)),
  barrelId: new Set(gzw.barrels.map((b) => b.id)),
  scopeId: new Set(gzw.scopes.map((s) => s.id)),
  ammoId: new Set(gzw.ammo.map((a) => a.id)),
}

export interface ResolvedSetup {
  setup: Setup
  weapon: GzwWeapon
  barrels: GzwBarrel[]
  barrel: GzwBarrel | null
  scopes: GzwScope[]
  scope: GzwScope
  ammoList: GzwAmmo[]
  ammo: GzwAmmo
}

/** The game zeroes in 50 m steps, from 50 m (100 m on a long rifle) to the scope's limit. */
export function zeroRange(weapon: GzwWeapon, scope: GzwScope): { minM: number; maxM: number; stepM: number } {
  return { minM: weapon.type === 'Rifle' ? 100 : 50, maxM: Math.min(1000, scope.maxZeroM ?? 1000), stepM: 50 }
}

/** Make a setup consistent: the barrel, scope and ammo must fit the weapon, and the zero must be one the game can set. */
export function resolveSetup(raw: Setup): ResolvedSetup {
  const weapon = byId(WEAPONS, raw.weaponId) ?? WEAPONS[0]
  const barrels = weapon.barrelIds.map((id) => byId(gzw.barrels, id)!).filter(Boolean)
  const barrel = byId(barrels, raw.barrelId) ?? byId(barrels, DEFAULTS.barrelId) ?? barrels[0] ?? null
  const scopes = weapon.scopeIds.map((id) => byId(gzw.scopes, id)!).filter(Boolean)
  const scope = byId(scopes, raw.scopeId) ?? byId(scopes, DEFAULTS.scopeId) ?? scopes[0]
  const ammoList = AMMO.get(weapon.id)!
  const ammo = byId(ammoList, raw.ammoId) ?? byId(ammoList, DEFAULTS.ammoId) ?? ammoList[0]
  const zero = zeroRange(weapon, scope)
  const zeroM = Math.min(zero.maxM, Math.max(zero.minM, Math.round(raw.zeroM / zero.stepM) * zero.stepM))
  const setup: Setup = { ...raw, weaponId: weapon.id, barrelId: barrel?.id ?? null, scopeId: scope.id, ammoId: ammo.id, zeroM }
  return { setup, weapon, barrels, barrel, scopes, scope, ammoList, ammo }
}

const STORAGE_KEY = 'gb.gzw.setup'

function loadStored(): URLSearchParams {
  try {
    return new URLSearchParams(localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return new URLSearchParams()
  }
}

function store(params: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, params)
  } catch {
    // Private mode or blocked storage: the URL still carries the setup.
  }
}

/**
 * The current GZW setup from the URL, plus a setter that writes back to it. A link without setup keys
 * (a bookmark of the bare page) reopens the last setup and writes it into the link.
 */
export function useGzwSetup(): ResolvedSetup & { update: (patch: Partial<Setup>) => void } {
  const { route, navigate, display } = useSettings()
  const fromUrl = hasSetupParams(route.params)
  const resolved = useMemo(
    () => resolveSetup(readSetup(fromUrl ? route.params : loadStored(), (f, id) => VALID[f].has(id), DEFAULTS)),
    [route.params, fromUrl],
  )
  const params = writeSetup(resolved.setup, display).toString()
  useEffect(() => {
    store(params)
    if (!fromUrl) navigate({ params: new URLSearchParams(params) })
  }, [params, fromUrl, navigate])
  const update = useCallback(
    // Resolve before writing, so a new weapon does not carry the old one's ammo or parts into the link. The accuracy
    // read from the game belongs to one weapon and barrel, so another of either drops it unless the patch brings its own.
    (patch: Partial<Setup>) => {
      const cur = resolved.setup
      const otherWeapon = patch.weaponId !== undefined && patch.weaponId !== cur.weaponId
      const otherGun = otherWeapon || (patch.barrelId !== undefined && patch.barrelId !== cur.barrelId)
      // Another weapon comes with its best round, unless the patch names one (an import does).
      const best = otherWeapon && !('ammoId' in patch) ? bestAmmoId(patch.weaponId!) : undefined
      const next = { ...cur, ...(otherGun && !('accuracyMoa' in patch) ? { accuracyMoa: null } : {}), ...(best ? { ammoId: best } : {}), ...patch }
      navigate({ params: writeSetup(resolveSetup(next).setup, display) })
    },
    [resolved.setup, display, navigate],
  )
  return { ...resolved, update }
}
