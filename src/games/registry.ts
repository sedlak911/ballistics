import type { GameTab } from '../components/AppHeader'

export type GameId = 'real' | 'gzw' | 'wardogs'

/** Switcher order; the first one opens on a bare URL. */
export const GAMES: (GameTab & { id: GameId; url?: string })[] = [
  { id: 'real', name: 'REAL', available: true },
  { id: 'gzw', name: 'Gray Zone Warfare', short: 'GZW', available: true },
  { id: 'wardogs', name: 'WARDOGS', available: false, url: 'https://store.steampowered.com/app/1867240/WARDOGS/' },
]
