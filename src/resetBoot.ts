// main.tsx's first import: a reset asked for before the reload clears what the page wrote while it unloaded, before any
// other module evaluates or reads storage.
import { applyPendingReset } from './reset'

applyPendingReset()
