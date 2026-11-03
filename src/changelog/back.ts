// The game the what's-new page was opened from: ⓘ's link carries it as the hash (changelog/#gzw). The registry holds
// only the switcher's list, with no game code behind it, so the page stays light.
import { GAMES, type GameId } from '../games/registry'

/** A known game id from the hash, else null: '#gzw' is 'gzw'; '', '#nope' and '#/gzw/workbench' are null. */
export function gameFromHash(hash: string): GameId | null {
  const id = hash.replace(/^#/, '')
  return GAMES.find((g) => g.id === id)?.id ?? null
}

/** Where the way back leads: that game's workbench in the same language, or the app's own start. */
export function backHref(game: GameId | null): string {
  return game ? `../#/${game}/workbench` : '../'
}
