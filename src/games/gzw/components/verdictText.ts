import type { T } from '../../../i18n'
import type { VerdictResult } from '../verdict'

// A narrow no-break space: the figure and its % never split, and the gap stays tight in mono.
export const pct = (p: number) => `${Math.round(p * 100)} %`

/** The verdict in words: shoot, risky (and where it stops being), close in to where, or no good shot. */
export function verdictLine(result: VerdictResult, t: T, formatDistance: (m: number) => string): string {
  return result.verdict === 'shoot' ? t('v.shoot')
    : result.verdict === 'risky' ? (result.closeInM === null ? t('v.risky') : t('v.riskyAt', { d: formatDistance(result.closeInM) }))
      : result.verdict === 'closeIn' ? t('v.closeIn', { d: formatDistance(result.closeInM!) })
        : t('v.noGood')
}
