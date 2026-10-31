import type { DragTable } from '../drag'

/**
 * McCoy, BRL-MR-3810 (1990), Table 2: Ball M33, measured C_D vs Mach (spark range, yaw 1.6-3.5 deg), sorted by Mach.
 * The copy the engine's validation flies; REAL's P9 preset keeps its own, and a test checks the two agree.
 */
export const M33_CD: DragTable = [
  [0.551, 0.1324], [0.606, 0.123], [0.888, 0.1372], [0.918, 0.1505], [0.989, 0.3215], [1.003, 0.3461],
  [1.041, 0.3569], [1.158, 0.3757], [1.222, 0.3725], [1.475, 0.3637], [1.516, 0.3489], [1.953, 0.341],
  [1.972, 0.3171], [2.57, 0.2923], [2.589, 0.2971], [2.653, 0.2813],
]
