// Turret clicks for a correction. Every value is in the scope's unit (MRAD or MOA); no conversion happens here.

export interface Dial {
  /** Signed; + up. */
  clicks: number
  /** clicks · clickValue, in the scope's unit. */
  dialed: number
  /** What the clicks can't reach within half a click, in the scope's unit; 0 when the travel caps the dial. */
  remainder: number
  /** What the travel can't reach and the reticle must hold, in the scope's unit; 0 within the travel. */
  hold: number
}

/** correction and travelUp in the scope's unit; travelUp null = unlimited (research §8.2, §8.4). */
export function dialFor(correction: number, clickValue: number, travelUp: number | null): Dial {
  // 14.5 / 0.1 is 144.999… in floating point, hence the epsilon.
  const maxClicks = travelUp === null ? Infinity : Math.floor(travelUp / clickValue + 1e-9)
  const wanted = Math.round(correction / clickValue)
  const clicks = Math.min(wanted, maxClicks)
  const dialed = clicks * clickValue
  const rest = correction - dialed
  // A capped dial is short by at least half a click, so that is a hold; within the travel the rest is under half a click.
  // `+ 0` turns −0 into 0, which Intl would print as "−0".
  return clicks < wanted
    ? { clicks: clicks + 0, dialed: dialed + 0, remainder: 0, hold: rest + 0 }
    : { clicks: clicks + 0, dialed: dialed + 0, remainder: rest + 0, hold: 0 }
}
