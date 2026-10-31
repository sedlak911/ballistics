import { useId, useRef } from 'react'
import { angleOfOffset, type AngleUnit } from '../engine/units'
import { aimMark, type Box, C, discGeometry, LENS_R, MONO_ADVANCE, reticleLabels, reticleTicks, SCOPE_SIZE, spreadEllipses, targetHeightPx } from './scopeGeometry'
import { useRenderedWidth } from './useRenderedWidth'

export interface ScopeViewProps {
  distanceM: number
  /** Angle units; positive = hold over. */
  holdover: number
  /** Angle units, ≥ 0. */
  lead: number
  direction: 1 | -1
  /** Running for a target that moves faster than a walk; kneeling and prone targets stay still. */
  pose: Pose
  unit: AngleUnit
  /** 1σ spread of shots at the target in angle units, per axis; null hides the ellipses. */
  spread: { x: number; y: number } | null
  /** Which part of the target the aim mark sits on. */
  aimAt: 'head' | 'chest'
  /** Words for the plates, in sentence case; the scope upper-cases them. */
  labels: { hold: string; lead: string }
  /** The legend under the lens: aim mark, 68 % and 95 % ellipses. Left out when absent. */
  legend?: { aim: string; r68: string; r95: string }
  caption: string
  /** Shown in the lens when the aim point is outside the view and the mark is pulled in to its edge. */
  offViewLabel: string
  /**
   * A round plate on a post instead of the soldier, at true angular size: the aim mark sits on its centre, there is
   * no size bracket and no aim anchor (`pose` and `aimAt` are not read), and `lead` with `direction` is the windage
   * hold (the mark is `lead` to the side the wind pushes toward, `direction` 1 = right).
   */
  target?: { kind: 'disc'; diameterM: number }
}

const R = LENS_R
const ACCENT = 'var(--accent)'
const INK = 'var(--target)'
const BRACKET = 'var(--fg-strong)'
/** The light rim that keeps the silhouette apart from the reticle and the ground: 1 rendered px at this opacity. */
const OUTLINE = 'var(--fg)'
const OUTLINE_OPACITY = 0.4

/**
 * Text in the lens, in rendered px: the size it had at a 440 px scope, kept within these bounds whatever the scope's
 * size (DESIGN.md, Type: the smallest text is 10px), then turned back into viewBox units.
 */
const PLATE_PX = { at440: 10.5, min: 10, max: 13 }
const NUMBER_PX = { at440: 9, min: 10, max: 11 }
const OFF_VIEW_PX = { at440: 11, min: 10, max: 13 }
const textSize = (t: { at440: number; min: number; max: number }, scale: number) =>
  Math.min(t.max, Math.max(t.min, t.at440 * scale)) / scale

export type Pose = 'standing' | 'running' | 'kneeling' | 'prone'

type Pt = readonly [number, number]
/** A stroked line with round caps, a filled outline, or a head with its helmet. */
type Part = { limb: readonly Pt[]; w: number } | { shape: readonly Pt[] } | { head: Pt; r: number }

// The soldier in units where 100 = 1.8 m standing, facing +x, the ground at y = 96 (boot soles reach 99.5).
const FIGURE: Record<Pose, readonly Part[]> = {
  // Rifle at low ready.
  standing: [
    { limb: [[-3, 52], [-4, 74], [-4, 96]], w: 7 },
    { limb: [[4, 52], [5, 74], [5, 96]], w: 7.5 },
    { shape: [[-2, 15], [10, 14], [9, 30], [6, 53], [-7, 53], [-6, 32]] },
    { shape: [[-14, 17], [-3, 15], [-4, 43], [-13, 44]] },
    { limb: [[-2, 20], [2, 34], [10, 39]], w: 5 },
    { limb: [[8, 18], [13, 31], [18, 38]], w: 5 },
    { limb: [[-4, 30], [28, 50]], w: 2.6 },
    { head: [4, 7], r: 6.3 },
  ],
  // Leaning into the run: the front knee up ahead of the hip, the back leg pushing off the ground, rifle forward.
  running: [
    { limb: [[-3, 50], [-9, 72], [-19, 94], [-14, 96]], w: 7 },
    { limb: [[2, 50], [19, 60], [15, 79], [20, 81]], w: 7.5 },
    { shape: [[3, 16], [15, 17], [11, 33], [6, 52], [-6, 51], [-3, 33]] },
    { shape: [[-9, 19], [3, 16], [-1, 42], [-11, 41]] },
    { limb: [[-1, 38], [33, 29]], w: 2.6 },
    { limb: [[6, 20], [4, 33], [9, 36]], w: 5 },
    { limb: [[13, 20], [19, 30], [23, 31]], w: 5 },
    { head: [10, 9], r: 6.3 },
  ],
  // On the left knee, the right foot planted ahead, rifle shouldered: 1.2 m from boot to helmet, as the reading counts.
  kneeling: [
    { limb: [[-2.5, 79], [-5.5, 93.5], [-20, 94.5]], w: 6.4 },
    { limb: [[3.5, 79], [15.5, 77], [15.5, 94.5], [20, 95.5]], w: 6.8 },
    { shape: [[-1, 46], [10, 45.5], [9, 60], [6.5, 81], [-5.5, 81], [-4.5, 61.5]] },
    { shape: [[-12, 48], [-2, 46], [-2.5, 71.5], [-11, 72.5]] },
    { limb: [[-2, 53.5], [30, 50.5]], w: 2.4 },
    { limb: [[1, 50.5], [5.5, 60], [12.5, 54.5]], w: 4.55 },
    { limb: [[8, 50], [15.5, 57], [22, 52.5]], w: 4.55 },
    { head: [4.5, 39], r: 5.75 },
  ],
  // Lying side-on behind the rifle, head raised toward the way it faces: 1.8 m from boot to head, the trunk about
  // 0.19 m tall, 0.45 m high at the helmet (the hit model's prone chest is 0.40 × 0.18 m).
  prone: [
    { limb: [[-6, 92], [-30, 92.5], [-50, 92.5]], w: 7 },
    { limb: [[-6, 88.5], [-28, 89], [-47, 89.5]], w: 7 },
    { shape: [[-8, 87], [12, 85.5], [32, 85], [36, 95.5], [-8, 96]] },
    { shape: [[0, 79], [22, 78], [23, 86], [0, 87]] },
    { limb: [[33.5, 86.5], [38, 81.5]], w: 7.5 },
    { limb: [[30, 85.5], [72, 84]], w: 2.6 },
    { limb: [[31, 88], [40, 94], [50, 86]], w: 5 },
    { limb: [[62, 84.5], [64, 94]], w: 2 },
    { head: [40.5, 78.5], r: 6.3 },
  ],
}

// Aim points per pose, in the same units: the head's centre, and the middle of the hit model's chest zone.
const ANCHOR = {
  standing: { head: [4, 7], chest: [2, 30] },
  running: { head: [10, 9], chest: [5, 31] },
  kneeling: { head: [4.5, 39], chest: [2, 59] },
  prone: { head: [40.5, 78.5], chest: [21, 90.5] },
} as const

/** The helmet over a head of radius 6.3 centred on 0 0; its crown peaks 7.5 above the centre. */
const HELMET: readonly Pt[] = [[-7, -4], [0, -11], [8, -4], [9, -1], [-8, -1]]

/** Each part's bounding box in figure units, caps and helmet included: where hash numbers would sit on ink. */
function partBoxes(parts: readonly Part[]): Box[] {
  return parts.map((p) => {
    if ('head' in p) {
      const [x, y] = p.head
      const k = p.r / 6.3
      return { x0: x - 8 * k, y0: y - 7.5 * k, x1: x + 9 * k, y1: y + p.r }
    }
    const pts = 'limb' in p ? p.limb : p.shape
    const half = 'limb' in p ? p.w / 2 : 0
    const xs = pts.map(([x]) => x)
    const ys = pts.map(([, y]) => y)
    return { x0: Math.min(...xs) - half, y0: Math.min(...ys) - half, x1: Math.max(...xs) + half, y1: Math.max(...ys) + half }
  })
}
const PART_BOXES = Object.fromEntries(Object.entries(FIGURE).map(([pose, parts]) => [pose, partBoxes(parts)])) as Record<Pose, Box[]>
/** What the whole drawing covers. */
const EXTENT = Object.fromEntries(Object.entries(PART_BOXES).map(([pose, boxes]) => [pose, {
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
}])) as Record<Pose, Box>

// What the size bracket spans: the figure from helmet top to boot sole (boot to head across for prone), the extent
// the height reading counts as `metres` (1.2 m kneeling, 1.8 m otherwise), which the plate gives in the reticle unit.
const SPAN: Record<Pose, { axis: 'x' | 'y'; from: number; to: number; metres: number }> = {
  standing: { axis: 'y', from: -0.5, to: 99.5, metres: 1.8 },
  running: { axis: 'y', from: 1.5, to: 99.5, metres: 1.8 },
  kneeling: { axis: 'y', from: 32.2, to: 98.9, metres: 1.2 },
  prone: { axis: 'x', from: -53.5, to: 46.8, metres: 1.8 },
}

/**
 * The soldier in one colour. `grow` widens every part by that much on each side (viewBox px), for the rim drawn
 * under the ink.
 */
function Soldier({ u, pose, color, grow = 0 }: { u: number; pose: Pose; color: string; grow?: number }) {
  const P = ([x, y]: Pt) => `${(x * u).toFixed(2)} ${(y * u).toFixed(2)}`
  const rim = grow > 0 ? { stroke: color, strokeWidth: 2 * grow, strokeLinejoin: 'round' as const } : {}
  return (
    <g>
      {FIGURE[pose].map((p, i) => {
        if ('limb' in p) {
          return <path key={i} d={`M${p.limb.map(P).join(' L')}`} fill="none" stroke={color} strokeWidth={p.w * u + 2 * grow}
            strokeLinecap="round" strokeLinejoin="round" />
        }
        if ('shape' in p) return <path key={i} d={`M${p.shape.map(P).join(' L')}Z`} fill={color} {...rim} />
        const [hx, hy] = p.head
        const k = p.r / 6.3
        const [a, q, b, c, d] = HELMET.map(([x, y]) => P([hx + x * k, hy + y * k]))
        return (
          <g key={i}>
            <circle cx={hx * u} cy={hy * u} r={p.r * u + grow} fill={color} />
            <path d={`M${a} Q${q} ${b} L${c} L${d}Z`} fill={color} {...rim} />
          </g>
        )
      })}
    </g>
  )
}

/** A jungle tree line along the horizon at y = 0, in scene units. */
function treeLine(): string {
  let d = 'M-20 0'
  for (let x = -20; x <= 460; x += 5) {
    const h = 5 + 3 * Math.sin(x * 0.21) + 2.5 * Math.sin(x * 0.53 + 1) + 1.5 * Math.sin(x * 1.3)
    d += ` L${x} ${(-29 - h + 6 * Math.sin(x / 70)).toFixed(1)}`
  }
  return `${d} L460 7 L-20 7Z`
}
const TREES = treeLine()

type Anchor = 'start' | 'middle' | 'end'
/** A plate's left edge or middle or right edge at `x`, centred on `cy`. */
type PlateAt = { x: number; cy: number; anchor: Anchor }

/** A plate's size for a label in `fs` viewBox px: as wide as the label plus padding, 1.5 lines tall. */
function plateSize(text: string, fs: number) {
  return { w: text.length * MONO_ADVANCE * fs + 1.15 * fs, h: 1.52 * fs }
}

function plateBox({ x, cy, anchor }: PlateAt, text: string, fs: number): Box {
  const { w, h } = plateSize(text, fs)
  const x0 = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2
  return { x0, y0: cy - h / 2, x1: x0 + w, y1: cy + h / 2 }
}

function Plate({ at, text, fs, color = ACCENT }: { at: PlateAt; text: string; fs: number; color?: string }) {
  const b = plateBox(at, text, fs)
  return (
    <g>
      <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="black" fillOpacity={0.78} />
      <text x={(b.x0 + b.x1) / 2} y={at.cy + 0.36 * fs} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={fs} fill={color}>{text}</text>
    </g>
  )
}

/** A plate moved, if it has to be, until all of it is inside the lens: along its bracket first, then sideways. */
function plateInLens(p: PlateAt, text: string, fs: number): PlateAt {
  const { w, h } = plateSize(text, fs)
  const r = R - 8
  const maxDx = Math.sqrt(r ** 2 - 20 ** 2)
  const x0 = Math.min(C + maxDx - w, Math.max(C - maxDx, p.anchor === 'end' ? p.x - w : p.anchor === 'start' ? p.x : p.x - w / 2))
  const half = Math.sqrt(r ** 2 - Math.max(Math.abs(x0 - C), Math.abs(x0 + w - C)) ** 2)
  return { x: x0, cy: Math.min(C + half - h / 2, Math.max(C - half + h / 2, p.cy)), anchor: 'start' }
}

/** The caption's legend keys, drawn like the marks in the lens. */
function LegendKey({ kind }: { kind: 'aim' | 'r68' | 'r95' }) {
  if (kind === 'aim') {
    return (
      <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden="true">
        <g stroke={ACCENT} strokeWidth={1.4} fill="none">
          <circle cx={7} cy={7} r={3.6} />
          <path d="M7 0.5V3.4M7 10.6V13.5M0.5 7H3.4M10.6 7H13.5" />
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 18 10" width={18} height={10} aria-hidden="true">
      {kind === 'r68'
        ? <ellipse cx={9} cy={5} rx={8} ry={4} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke={ACCENT} strokeOpacity={0.6} strokeDasharray="3 2" />
        : <ellipse cx={9} cy={5} rx={8} ry={4} fill="none" stroke={ACCENT} strokeOpacity={0.5} strokeDasharray="3 3" />}
    </svg>
  )
}

/**
 * The hero: which point of the reticle goes on the target, and why the shot is hard. Drawn bottom to top as in
 * DESIGN.md: scene, spread, target, optics, reticle, aim marks, lens; the caption sits under it in HTML. The scene and
 * target are anchored to the aim mark, so the crosshair centre sits above and ahead of the target. Text in the lens
 * keeps its rendered size within bounds as the scope grows or shrinks.
 */
export function ScopeView({ distanceM, holdover, lead, direction, pose, unit, spread, aimAt, labels, legend, caption, offViewLabel, target }: ScopeViewProps) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${name}-${uid}`
  const svgRef = useRef<SVGSVGElement>(null)
  // Rendered px per viewBox px; 1 until measured (and in tests).
  const rendered = useRenderedWidth(svgRef)
  const scale = rendered ? rendered / SCOPE_SIZE : 1
  const plateFs = textSize(PLATE_PX, scale)
  const numberFs = textSize(NUMBER_PX, scale)
  const mark = aimMark(holdover, lead, direction, unit)

  // The beyond-the-view plate fits its label and sits as high as the lens lets a plate that wide.
  const offViewMaxW = 2 * (R - 8) - 40
  const offViewPad = 24 / 11
  const offViewFs = Math.min(textSize(OFF_VIEW_PX, scale), offViewMaxW / (offViewLabel.length * MONO_ADVANCE + offViewPad))
  const offViewW = offViewFs * (offViewLabel.length * MONO_ADVANCE + offViewPad)
  const offViewH = offViewFs * offViewPad
  const offView = { w: offViewW, h: offViewH, y: Math.ceil(C - Math.sqrt((R - 8) ** 2 - (offViewW / 2) ** 2)) }

  const disc = target ? discGeometry(distanceM, target.diameterM) : null
  const heightPx = disc ? disc.diameterPx + disc.postPx : targetHeightPx(distanceM)
  const u = heightPx / 100
  // Around a mark pulled in to the edge the spread would be drawn at the wrong place, so it goes with the plates.
  const ellipses = mark.clamped ? null : spreadEllipses(spread, unit)

  // The world is anchored to the target: the aim zone on the mark, the ground under its feet, the tree line behind.
  const [axU, ayU] = ANCHOR[pose][aimAt]
  const feetY = disc ? mark.y + disc.diameterPx / 2 + disc.postPx : mark.y + (96 - ayU) * u
  const horizon = feetY - (0.3 * heightPx + 60)
  const sxU = (x: number) => mark.x + direction * (x - axU) * u
  const syU = (y: number) => mark.y + (y - ayU) * u
  // A box in figure units, placed in the lens (mirrored when the target moves left).
  const place = (b: Box): Box => ({
    x0: Math.min(sxU(b.x0), sxU(b.x1)), x1: Math.max(sxU(b.x0), sxU(b.x1)), y0: syU(b.y0), y1: syU(b.y1),
  })
  const figureBox = disc
    ? { x0: mark.x - disc.diameterPx / 2, x1: mark.x + disc.diameterPx / 2, y0: mark.y - disc.diameterPx / 2, y1: feetY }
    : place(EXTENT[pose])

  const showLead = lead > 0.05
  const showHold = Math.abs(holdover) > 0.05
  const holdText = `${labels.hold.toLocaleUpperCase()} ${holdover < 0 ? '↓' : '↑'}${Math.abs(holdover).toFixed(1)}`
  const leadText = `${labels.lead.toLocaleUpperCase()} ${lead.toFixed(1)}`
  const plateH = plateSize('', plateFs).h
  // Plates go on the far side of each axis from the mark, so they never cover it; a prone body lies along the
  // horizontal axis behind its head, so its hold plate goes the way it faces.
  const holdRight = mark.x < C || (mark.x === C && pose === 'prone' && direction === 1)
  const holdPlate: PlateAt = { x: holdRight ? C + 14 : C - 14, cy: mark.y, anchor: holdRight ? 'start' : 'end' }
  const leadPlate: PlateAt = { x: mark.x, cy: mark.y > C ? C - 13 - plateH / 2 : C + 11 + plateH / 2, anchor: 'middle' }

  // The size bracket: beside the figure on the side toward the vertical axis, so it stays in the lens, its figure at
  // the feet end, well below the hold plate; under a prone figure. White, not accent: it measures, it does not aim.
  const span = SPAN[pose]
  const spanText = `${angleOfOffset(span.metres, distanceM, unit).toFixed(1)} ${unit.toUpperCase()}`
  const bracket = span.axis === 'y'
    ? (() => {
        const left = mark.x > C
        const x = left ? figureBox.x0 - 8 : figureBox.x1 + 8
        const [y1, y2] = [syU(span.from), syU(span.to)]
        const plate: PlateAt = { x: left ? x - 6 : x + 6, cy: y2, anchor: left ? 'end' : 'start' }
        return { d: `M${x - 3} ${y1}H${x + 3}M${x} ${y1}V${y2}M${x - 3} ${y2}H${x + 3}`, plate }
      })()
    : (() => {
        const y = figureBox.y1 + 8
        const [x1, x2] = [sxU(span.from), sxU(span.to)]
        const plate: PlateAt = { x: (x1 + x2) / 2, cy: y + 6 + plateH / 2, anchor: 'middle' }
        return { d: `M${x1} ${y - 3}V${y + 3}M${x1} ${y}H${x2}M${x2} ${y - 3}V${y + 3}`, plate }
      })()
  const bracketPlate = plateInLens(bracket.plate, spanText, plateFs)

  // Hash numbers stay off the figure's parts (ink on ink cannot be read) and off every plate.
  const avoid: Box[] = [
    ...(disc ? [figureBox] : PART_BOXES[pose].map(place)),
    ...(mark.clamped ? [] : [
      { x0: mark.x - 15, y0: mark.y - 15, x1: mark.x + 15, y1: mark.y + 15 },
      ...(disc ? [] : [plateBox(bracketPlate, spanText, plateFs)]),
      ...(showLead ? [plateBox(leadPlate, leadText, plateFs)] : []),
      ...(showHold ? [plateBox(holdPlate, holdText, plateFs)] : []),
    ]),
  ]
  const ticks = reticleTicks(unit)
  const numbers = reticleLabels(unit, avoid, numberFs)
  const sx = Math.sign(mark.x - C)
  const sy = Math.sign(mark.y - C)

  return (
    <figure className="scope">
      <svg ref={svgRef} className="scope-view" viewBox={`0 0 ${SCOPE_SIZE} ${SCOPE_SIZE}`} role="img" aria-label={caption}>
        <defs>
          <clipPath id={id('lens')}><circle cx={C} cy={C} r={R} /></clipPath>
          <linearGradient id={id('sky')} gradientUnits="userSpaceOnUse" x1="0" y1={horizon - 240} x2="0" y2={horizon - 30}>
            <stop offset="0" stopColor="var(--scene-sky-1)" /><stop offset="1" stopColor="var(--scene-sky-2)" />
          </linearGradient>
          <linearGradient id={id('haze')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0" /><stop offset=".55" stopColor="white" stopOpacity=".14" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id('ground')} gradientUnits="userSpaceOnUse" x1="0" y1={horizon - 5} x2="0" y2={horizon + 60}>
            <stop offset="0" stopColor="var(--scene-hill)" /><stop offset="1" stopColor="var(--scene-ground)" />
          </linearGradient>
          <radialGradient id={id('vig')} cx=".5" cy=".5" r=".5">
            <stop offset=".7" stopColor="black" stopOpacity="0" /><stop offset="1" stopColor="black" stopOpacity=".82" />
          </radialGradient>
          <radialGradient id={id('glass')} cx=".3" cy=".2" r=".5">
            <stop offset="0" stopColor="white" stopOpacity=".09" /><stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g clipPath={`url(#${id('lens')})`}>
          {/* 1. Scene */}
          <rect width={SCOPE_SIZE} height={SCOPE_SIZE} fill={`url(#${id('sky')})`} />
          <g transform={`translate(0 ${horizon.toFixed(1)})`}>
            <path d="M-20 -33 C60 -49 100 -55 150 -43 S230 -63 290 -49 S380 -57 460 -45 V40 H-20Z" fill="var(--scene-hill)" opacity={0.38} />
            <path d={TREES} fill="var(--scene-hill)" opacity={0.85} />
            <rect x={-20} y={-47} width={480} height={56} fill={`url(#${id('haze')})`} />
          </g>
          <path d={`M-20 ${horizon + 3} Q120 ${horizon - 5} 220 ${horizon} T460 ${horizon - 2} V${SCOPE_SIZE + 2000} H-20Z`} fill={`url(#${id('ground')})`} />
          <g fill="none" stroke="black" strokeOpacity={0.06}>
            {[0, 1, 2, 3].map((i) => {
              const y = horizon + 29 + i * i * 14
              return <path key={i} d={`M0 ${y} Q220 ${y - 7} 440 ${y - 2}`} />
            })}
          </g>

          {/* 2. Spread, centred on the aim point */}
          {ellipses && (
            <g data-testid="spread">
              <ellipse cx={mark.x} cy={mark.y} rx={ellipses.r95.rx} ry={ellipses.r95.ry} fill="none" stroke={ACCENT} strokeOpacity={0.38} strokeDasharray="3 3" />
              <ellipse cx={mark.x} cy={mark.y} rx={ellipses.r68.rx} ry={ellipses.r68.ry}
                fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke={ACCENT} strokeOpacity={0.6} strokeDasharray="3 2" />
            </g>
          )}

          {/* 3. Target at true angular size, its aim zone on the mark, running the way it moves; a light rim under the ink */}
          {disc ? (
            <g data-testid="disc" data-diameter-px={disc.diameterPx.toFixed(2)}>
              <g className="figure-rim" opacity={OUTLINE_OPACITY} fill={OUTLINE}>
                <rect x={mark.x - disc.postW / 2 - 1 / scale} y={mark.y} width={disc.postW + 2 / scale} height={feetY - mark.y + 1 / scale} />
                <circle cx={mark.x} cy={mark.y} r={disc.diameterPx / 2 + 1 / scale} />
              </g>
              <rect x={mark.x - disc.postW / 2} y={mark.y} width={disc.postW} height={feetY - mark.y} fill={INK} />
              <circle cx={mark.x} cy={mark.y} r={disc.diameterPx / 2} fill={INK} />
            </g>
          ) : (
            <g transform={`translate(${mark.x.toFixed(1)} ${mark.y.toFixed(1)}) scale(${direction} 1) translate(${(-axU * u).toFixed(1)} ${(-ayU * u).toFixed(1)})`}>
              <g data-pose={pose}>
                <g className="figure-rim" opacity={OUTLINE_OPACITY}><Soldier u={u} pose={pose} color={OUTLINE} grow={1 / scale} /></g>
                <Soldier u={u} pose={pose} color={INK} />
              </g>
            </g>
          )}

          {!mark.clamped && !disc && (
            <g data-testid="size-bracket" data-axis={span.axis}>
              <path d={bracket.d} stroke={BRACKET} strokeWidth={1} fill="none" />
              <Plate at={bracketPlate} text={spanText} fs={plateFs} color={BRACKET} />
            </g>
          )}

          {/* 4. Optics */}
          <rect width={SCOPE_SIZE} height={SCOPE_SIZE} fill={`url(#${id('vig')})`} />
          <rect width={SCOPE_SIZE} height={SCOPE_SIZE} fill={`url(#${id('glass')})`} />

          {/* 5. Reticle */}
          <g stroke="var(--reticle)" strokeWidth={1.1}>
            <path d={`M${C - R} ${C}H${C + R}M${C} ${C - R}V${C + R}`} />
            <path d={`M${C - R} ${C}H${C - 125}M${C + 125} ${C}H${C + R}M${C} ${C - R}V${C - 125}M${C} ${C + 125}V${C + R}`} strokeWidth={5} />
            {ticks.map(({ offsetPx: o, major }) => {
              const l = major ? 6 : 3
              return (
                <path key={o} d={`M${C + o} ${C - l}V${C + l}M${C - o} ${C - l}V${C + l}M${C - l} ${C + o}H${C + l}M${C - l} ${C - o}H${C + l}`} />
              )
            })}
          </g>
          <g className="reticle-numbers" fontFamily="var(--font-mono)" fontSize={numberFs} fill="var(--reticle)">
            {numbers.map((n) => (
              <text key={`${n.x}-${n.y}`} x={n.x} y={n.y} textAnchor={n.y < C ? 'middle' : 'start'}>{n.text}</text>
            ))}
          </g>

          {/* 6. Aim marks: the only colour in the lens */}
          {!mark.clamped && (
            <g>
              {showLead && <path d={`M${mark.x} ${C - 10}V${C + 10}`} stroke={ACCENT} strokeWidth={2.2} />}
              {showHold && <path d={`M${C - 10} ${mark.y}H${C + 10}`} stroke={ACCENT} strokeWidth={2.2} />}
              <path stroke={ACCENT} strokeOpacity={0.7} strokeDasharray="1.5 3" fill="none"
                d={`${showLead && Math.abs(mark.y - C) > 20 ? `M${mark.x} ${C + sy * 7}V${mark.y - sy * 13}` : ''}${showHold && Math.abs(mark.x - C) > 20 ? `M${C + sx * 7} ${mark.y}H${mark.x - sx * 13}` : ''}`} />
              {showLead && <Plate at={leadPlate} text={leadText} fs={plateFs} />}
              {showHold && <Plate at={holdPlate} text={holdText} fs={plateFs} />}
            </g>
          )}
          <g stroke={ACCENT} strokeWidth={2} fill="none" strokeDasharray={mark.clamped ? '4 3' : undefined}>
            <circle cx={mark.x} cy={mark.y} r={8.5} />
            <path d={`M${mark.x} ${mark.y - 8.5}V${mark.y - 13}M${mark.x} ${mark.y + 8.5}V${mark.y + 13}M${mark.x - 8.5} ${mark.y}H${mark.x - 13}M${mark.x + 8.5} ${mark.y}H${mark.x + 13}`} />
          </g>
          {mark.clamped && (
            <g className="off-view">
              <rect x={C - offView.w / 2} y={offView.y} width={offView.w} height={offView.h} fill="black" fillOpacity={0.85} stroke={ACCENT} />
              <text x={C} y={offView.y + offView.h / 2 + 0.36 * offViewFs} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={offViewFs} fill={ACCENT}>{offViewLabel}</text>
            </g>
          )}
        </g>

        {/* 7. Lens */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="black" strokeWidth={12} />
        <circle cx={C} cy={C} r={R + 8} fill="none" stroke="var(--border-strong)" />
      </svg>

      {/* 8. Caption: the legend, then zoom, focal plane and unit */}
      <figcaption className="scope-caption">
        {legend && (['aim', 'r68', 'r95'] as const).map((k) => (
          <span key={k} className="scope-key"><LegendKey kind={k} />{legend[k]}</span>
        ))}
        <span>{caption}</span>
      </figcaption>
    </figure>
  )
}
