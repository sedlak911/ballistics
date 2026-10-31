import { useMemo } from 'react'

const W = 1600
const H = 1000
// Two hills of contour lines, as on gzwloadout.com: centre x, centre y, phase.
const HILLS = [
  [1180, 260, 0],
  [380, 820, 3],
] as const

/** Wobbly topographic contour lines behind the page, white at a few percent. Decoration only. */
export function Backdrop() {
  const d = useMemo(() => {
    let out = ''
    for (const [cx, cy, k0] of HILLS) {
      for (let k = 1; k <= 13; k++) {
        const r = 40 + k * 46
        let p = ''
        for (let a = 0; a <= 64; a++) {
          const t = (a / 64) * Math.PI * 2
          const rr = r * (1 + 0.09 * Math.sin(3 * t + k * 0.5 + k0) + 0.05 * Math.sin(5 * t - k * 0.3))
          p += `${a ? 'L' : 'M'}${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * 0.72 * Math.sin(t)).toFixed(1)}`
        }
        out += `${p}Z`
      }
    }
    return out
  }, [])
  return (
    <svg className="topo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d={d} fill="none" stroke="white" strokeOpacity={0.045} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
