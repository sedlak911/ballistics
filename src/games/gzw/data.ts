import raw from './data/gzw-data.json'
import type { GzwData } from './types'

export const gzw = raw as GzwData

export function byId<T extends { id: string }>(list: T[], id: string | null | undefined): T | undefined {
  return id == null ? undefined : list.find((x) => x.id === id)
}

export function byName<T extends { name: string }>(list: T[], name: string): T | undefined {
  return list.find((x) => x.name === name)
}

/** Short display name for an ammo inside its caliber, e.g. "7.62x51mm FMJ (M80A1)" → "M80A1". */
export function shortAmmo(a: { name: string; caliber: string }): string {
  const rest = a.name.startsWith(a.caliber) ? a.name.slice(a.caliber.length).trim() : a.name.replace(/^\S+\s/, '')
  const paren = rest.match(/\(([^)]+)\)/)
  return paren ? paren[1] : rest || a.name
}
