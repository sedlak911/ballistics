import { NIJ_CLASSES, type PenRating } from '../types'
import './gzw.css'

/** Eight segments, I … III++, coloured by penetration rating; `highlight` outlines one class. */
export function PenStrip({ ratings, highlight, disagree, labels, unknown, size = 'small' }: {
  ratings: PenRating[]
  /** No source rates this round: draw empty segments instead of "pointless". */
  unknown?: boolean
  highlight?: number
  disagree?: boolean[]
  labels?: boolean
  size?: 'small' | 'large'
}) {
  const segClass = (r: PenRating, i: number) =>
    `${unknown ? 'pen-unknown' : `pen-${r}`}${i === highlight ? ' sel' : ''}${disagree?.[i] ? ' disagree' : ''}`
  return (
    <div className={`pen-strip ${size}`}>
      <div className="segs">
        {ratings.map((r, i) => <i key={NIJ_CLASSES[i]} className={segClass(r, i)} />)}
      </div>
      {labels && (
        <div className="labels">
          {NIJ_CLASSES.map((c, i) => <span key={c} className={i === highlight ? 'sel' : undefined}>{c}</span>)}
        </div>
      )}
    </div>
  )
}
