// REAL's three setup icons (spec §1): 14px tall line icons in the text colour around them, hidden from assistive
// technology since a word always goes with them. The settings sheet's section headers use them, and the tags.

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true } as const

/** A rifle side on: stock, barrel, grip and the scope on top. */
export function RifleIcon() {
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" {...line}>
      <path d="M1 10.5L5.1 7.5H23.1M5.1 7.5V10.5H1V9M14.6 7.5V9.5H7.7L6.4 12" />
      <rect x="8.1" y="3.5" width="6" height="2.2" />
    </svg>
  )
}

/** A cartridge side on: case, shoulder, neck and the bullet. */
export function CartridgeIcon() {
  return (
    <svg width="22" height="14" viewBox="1 0 22 14" {...line}>
      <path d="M2 4H14L16.5 5.5V8.5L14 10H2ZM4 4V10M16.5 5.5H18.5Q23 7 18.5 8.5H16.5" />
    </svg>
  )
}

/** A reticle: a circle and its four posts. */
export function ReticleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" {...line}>
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 1.5V5M7 9V12.5M1.5 7H5M9 7H12.5" />
    </svg>
  )
}

/** A share glyph: three nodes joined by two lines. */
export function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...line}>
      <circle cx="12" cy="3.5" r="2" />
      <circle cx="4" cy="8" r="2" />
      <circle cx="12" cy="12.5" r="2" />
      <path d="M5.8 7L10.2 4.5M5.8 9L10.2 11.5" />
    </svg>
  )
}
