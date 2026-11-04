// The route's newest hash, which the URL may not hold yet while the router's write waits; null with no router mounted.
// A module of its own, so the settings can read it without importing the router (and through it every game).
let newestHash: string | null = null

export function setNewestHash(hash: string | null): void {
  newestHash = hash
}

/** The page's address with the route's newest hash: what a shared link or a language switch should carry. */
export function routeHref(): string {
  const url = new URL(window.location.href)
  if (newestHash !== null) url.hash = newestHash
  return url.href
}
