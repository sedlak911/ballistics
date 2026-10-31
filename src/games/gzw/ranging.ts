import type { Posture } from '../../settings/url'

/**
 * What the height reading measures: the whole figure, in metres. Prone is measured across, head to boots.
 * Estimates: the game publishes no character dimensions.
 */
export const FIGURE_SIZE_M: Record<Posture, number> = { standing: 1.8, kneeling: 1.2, prone: 1.8 }

/** The distances the app works with, in metres. */
export const DISTANCE_M = { min: 50, max: 1000 } as const
