// The root page only picks a language and goes there: an old link's l=, then the stored one, then the browser's.
import { DISPLAY_KEY, redirectTarget } from './lang'

let stored: unknown
try {
  stored = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? 'null')
} catch {
  // Missing, corrupt or blocked storage: the link and the browser decide.
}
const lang = typeof stored === 'object' && stored !== null ? (stored as { lang?: unknown }).lang : undefined
location.replace(redirectTarget(location.href, lang, navigator.language))
