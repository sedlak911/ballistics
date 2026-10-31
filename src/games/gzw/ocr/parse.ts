import type { GzwAmmo, GzwBarrel, GzwData, GzwScope, GzwWeapon } from '../types'

export interface OcrFindings {
  /** Every weapon named on the screen, in reading order: an inventory can hold several. */
  weapons: GzwWeapon[]
  barrels: GzwBarrel[]
  scopes: GzwScope[]
  accuracyMoa: number | null
  /** Stacks counts labels, not rounds: the gear screen's counts don't survive OCR. */
  ammo: { ammo: GzwAmmo; stacks: number }[]
  ambiguous: { label: string; candidates: GzwAmmo[] }[]
  unknown: string[]
}

// Letters tesseract confuses with digits in the game's font, folded the same way on both sides of a comparison.
const CONFUSED: Record<string, string> = { O: '0', Q: '0', I: '1', L: '1', J: '1', S: '5', Z: '2', B: '8' }

/** Uppercase alphanumerics with look-alike letters folded to digits: 'AR-15 16"' and 'ARIS 16' both give 'AR1516'. */
export function foldLabel(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[OQILJSZB]/g, (c) => CONFUSED[c])
}

const isTruncated = (raw: string) => /(\.\.|…)\s*$/.test(raw)
const looksLikeItem = (raw: string) => /[A-Za-z]/.test(raw) && /\d/.test(raw)

/** 3 exact, 2 the label is the start of the candidate, 1 the same with one wrong character, 0 no match. */
function matchLevel(label: string, truncated: boolean, candidate: string): number {
  if (!truncated && label === candidate) return 3
  if (label.length >= 3 && candidate.startsWith(label)) return 2
  if (label.length >= 4 && label.length <= candidate.length) {
    let diff = 0
    for (let i = 0; i < label.length; i++) if (label[i] !== candidate[i]) diff++
    if (diff <= 1) return 1
  }
  return 0
}

function caliberShort(caliber: string): string {
  return caliber.match(/^\.?\d+(?:\.\d+)?/)?.[0] ?? caliber
}

/** The labels the game's inventory might print for a round: "M855 5.56", "M855", or "FMJ 5.56" without a designation. */
function ammoLabels(a: GzwAmmo): string[] {
  const rest = a.name.startsWith(a.caliber) ? a.name.slice(a.caliber.length).trim() : a.name
  const designation = rest.match(/\(([^)]+)\)/)?.[1]
  const cal = caliberShort(a.caliber)
  if (designation) return [`${designation} ${cal}`, designation].map(foldLabel)
  return [`${rest} ${cal}`].map(foldLabel)
}

function best<T>(items: T[], labelsOf: (x: T) => string[], label: string, truncated: boolean): { level: number; matches: T[] } {
  let level = 0
  let matches: T[] = []
  for (const item of items) {
    const l = Math.max(...labelsOf(item).map((c) => matchLevel(label, truncated, c)))
    if (l > level) {
      level = l
      matches = [item]
    } else if (l === level && l > 0) matches.push(item)
  }
  return { level, matches }
}

/** Turns OCR'd lines from a GZW weapon panel or gear screen into data items. Unsure matches are left for the owner. */
export function parseOcrText(lines: string[], ctx: { data: GzwData; currentWeapon: GzwWeapon }): OcrFindings {
  const { data } = ctx
  const weapons: GzwWeapon[] = []
  let accuracyMoa: number | null = null
  const ammoLines: { raw: string; candidates: GzwAmmo[] }[] = []
  const barrelLines: { raw: string; label: string; truncated: boolean }[] = []
  const unknown = new Set<string>()

  for (const line of lines) {
    const raw = line.trim()
    const acc = raw.match(/(\d+[.,]\d+)\s*M[O0]A/i)
    if (acc) {
      const v = Number(acc[1].replace(',', '.'))
      if (accuracyMoa === null && v >= 0.3 && v <= 15) accuracyMoa = v
      continue
    }
    if (!/[A-Za-z]/.test(raw)) continue
    const label = foldLabel(raw)
    if (label.length < 3) continue
    const truncated = isTruncated(raw)

    // The panel title is the bare name, or the name followed by the caliber ("M4A1 5.56x45mm").
    const w = data.weapons.find(
      (x) => foldLabel(x.name) === label || (foldLabel(raw.split(/\s+/)[0]) === foldLabel(x.name) && /\d+x\d+/.test(raw)),
    )
    if (w) {
      if (!weapons.includes(w)) weapons.push(w)
      continue
    }
    const a = best(data.ammo, ammoLabels, label, truncated)
    if (a.level > 0) {
      ammoLines.push({ raw, candidates: a.matches })
      continue
    }
    barrelLines.push({ raw, label, truncated })
  }

  // Barrels and scopes need the whole label, so a magazine called "AR15" never reads as an AR-15 barrel. A label
  // several items share is settled by what fits a weapon on the screen.
  const withWeapons = <T extends { id: string }>(items: T[], ids: string[]) =>
    items.some((x) => ids.includes(x.id)) ? items.filter((x) => ids.includes(x.id)) : items
  const barrelIds = weapons.flatMap((w) => w.barrelIds)
  const scopeIds = weapons.flatMap((w) => w.scopeIds)
  const barrels: GzwBarrel[] = []
  const scopes: GzwScope[] = []
  for (const { raw, label, truncated } of barrelLines) {
    const barrelMatch = withWeapons(data.barrels, barrelIds).filter((b) => {
      const c = foldLabel(b.name.replace(/\s*Barrel\s*-\s*/, ' '))
      return c === label || (truncated && c.startsWith(label) && label.length >= c.length - 1)
    })
    if (barrelMatch.length === 1) {
      if (!barrels.includes(barrelMatch[0])) barrels.push(barrelMatch[0])
      continue
    }
    const scopeMatch = withWeapons(data.scopes, scopeIds).filter((s) => {
      const first = foldLabel(s.name.split(/\s+/)[0])
      return (first.length >= 3 && first === label) || (label.length >= 5 && foldLabel(s.name).startsWith(label))
    })
    if (scopeMatch.length === 1) {
      if (!scopes.includes(scopeMatch[0])) scopes.push(scopeMatch[0])
      continue
    }
    if (looksLikeItem(raw)) unknown.add(raw.replace(/[.…\s]+$/, ''))
  }

  // Settle ties: the ammo of the weapons on the screen (or the current one) first, then a round this screenshot
  // already named unambiguously.
  const ammoIds = (weapons.length > 0 ? weapons : [ctx.currentWeapon]).flatMap((w) => w.ammoIds)
  const narrowed = ammoLines.map((l) => ({ ...l, candidates: withWeapons(l.candidates, ammoIds) }))
  const sure = new Set(narrowed.filter((l) => l.candidates.length === 1).map((l) => l.candidates[0].id))
  const counts = new Map<string, { ammo: GzwAmmo; stacks: number }>()
  const ambiguous = new Map<string, { label: string; candidates: GzwAmmo[] }>()
  for (const l of narrowed) {
    const known = l.candidates.filter((c) => sure.has(c.id))
    const pick = l.candidates.length === 1 ? l.candidates[0] : known.length === 1 ? known[0] : null
    if (pick) {
      const c = counts.get(pick.id) ?? { ammo: pick, stacks: 0 }
      c.stacks++
      counts.set(pick.id, c)
    } else {
      ambiguous.set(foldLabel(l.raw), { label: l.raw, candidates: l.candidates })
    }
  }

  return {
    weapons,
    barrels,
    scopes,
    accuracyMoa,
    ammo: [...counts.values()].sort((a, b) => b.stacks - a.stacks),
    ambiguous: [...ambiguous.values()],
    unknown: [...unknown].slice(0, 12),
  }
}
