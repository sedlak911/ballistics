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

/** The wind zones: a stretch cut into parts by two inner ticks between its end posts. */
export function ZonesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...line}>
      <path d="M2 12h20M2 8v8M8.7 9.5v5M15.3 9.5v5M22 8v8" />
    </svg>
  )
}

/** A help glyph: a question mark in a ring. */
export function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" {...line}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.9 8a2.2 2.2 0 1 1 3.4 1.8c-.8.5-1.3 1-1.3 2M10 14.1v.1" />
    </svg>
  )
}

// The aiming styles: each icon switches to the other way of measuring.

/** A phone with an arrow from its top edge: aim by the top edge, the simple way. */
export function PhoneEdgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" {...line}>
      <rect x="6" y="8" width="8" height="10.5" rx="1.2" />
      <path d="M10 6V1.8M7.7 4.1L10 1.8L12.3 4.1" />
    </svg>
  )
}

/** A lens seen from the front: aim through the camera. */
export function LensIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" {...line}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="3.5" />
    </svg>
  )
}

/** An open book: the guide's button in ⓘ. */
export function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" {...line} strokeWidth={1.4}>
      <path d="M3 4h6c1.5 0 1 1 1 2v11c0-1-1-2-2-2H3zM17 4h-6c-1.5 0-1 1-1 2v11c0-1 1-2 2-2h5z" />
    </svg>
  )
}
