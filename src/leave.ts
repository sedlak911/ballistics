/** Loads another page, as a link would: the one seam tests mock, since jsdom can't navigate between documents. */
export const leave = (href: string): void => window.location.assign(href)

/**
 * Loads this page afresh at `href`, a hash of its own included (a hash change alone wouldn't reload), so nothing kept in
 * memory survives: the reset's way out, mocked in tests like `leave`. `w` is for the tests.
 * The reload always happens: a browser past its history-write limit (WebKit's 100 in 10 s, which a ruler flick nears)
 * refuses the address, and the page then reloads at its old one, which the next start bares (reset.ts applyPendingReset).
 */
export const restart = (href: string, w: Pick<Window, 'history' | 'location'> = window): void => {
  try {
    w.history.replaceState(null, '', href)
  } catch {
    // Refused: reload anyway.
  }
  w.location.reload()
}
