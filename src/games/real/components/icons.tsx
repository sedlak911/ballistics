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

// The settings sheet's icon buttons: 20px glyphs like the header's ⓘ and ⚙ (DESIGN.md, Components → Icon buttons).

/** A share glyph: three nodes joined by two lines. */
export function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" {...line}>
      <circle cx="14.6" cy="4.6" r="2.4" />
      <circle cx="5.4" cy="10" r="2.4" />
      <circle cx="14.6" cy="15.4" r="2.4" />
      <path d="M7.5 8.8L12.5 5.8M7.5 11.2L12.5 14.2" />
    </svg>
  )
}

/** A close glyph: two crossed lines. */
export function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" {...line}>
      <path d="M4.5 4.5L15.5 15.5M15.5 4.5L4.5 15.5" />
    </svg>
  )
}
