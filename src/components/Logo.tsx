/** The app's mark: a square reticle in the accent. The header and the what's-new page both lead with it. */
export function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="var(--accent)" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="1" width="32" height="32" />
      <circle cx="17" cy="17" r="9" />
      <path d="M17 4v8M17 22v8M4 17h8M22 17h8" />
      <circle cx="17" cy="17" r="1.6" fill="var(--accent)" stroke="none" />
    </svg>
  )
}
