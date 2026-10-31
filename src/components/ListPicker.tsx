import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface PickerItem {
  id: string
  label: string
  /** A figure shown right-aligned, e.g. accuracy or magnification. */
  meta?: string
  tag?: string
  /** The tag says what is unknown (`--muted`), e.g. "MV unknown", rather than a property (FFP). */
  tagMuted?: boolean
  /** Shown at the row's right end, e.g. a small chart. */
  after?: ReactNode
}

const ROW_PX = 32
const FILTER_FROM = 11

/**
 * A visible list to choose one item from, in place of a dropdown. Long lists get a filter field and scroll inside
 * a few rows; the chosen row carries the accent bar.
 */
export function ListPicker({ label, items, value, onChange, filterLabel, noMatch, maxRows = 6 }: {
  label: string
  items: PickerItem[]
  value: string | null
  onChange: (id: string) => void
  filterLabel: string
  noMatch: string
  maxRows?: number
}) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter((i) => [i.label, i.meta, i.tag].some((s) => s?.toLowerCase().includes(q))) : items

  // Bring the chosen row into view when the list opens scrolled; only the list scrolls, the page stays put.
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (list && row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2
  }, [])

  return (
    <div className="picker">
      {items.length >= FILTER_FROM && (
        <input type="search" className="picker-filter" aria-label={filterLabel} placeholder={filterLabel} value={query}
          onChange={(e) => setQuery(e.target.value)} />
      )}
      <div ref={listRef} className="rows" role="group" aria-label={label} style={{ maxHeight: maxRows * ROW_PX }}>
        {shown.map((i) => (
          <button key={i.id} type="button" className="row" aria-pressed={i.id === value} onClick={() => onChange(i.id)}>
            <span className="row-label">{i.label}</span>
            {/* The tag before the figure, so figures end on one right edge whether a row has a tag or not. */}
            {i.tag && <span className={i.tagMuted ? 'tag muted' : 'tag'}>{i.tag}</span>}
            {i.meta && <span className="num row-meta">{i.meta}</span>}
            {i.after && <span className="row-after">{i.after}</span>}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="picker-none">{noMatch}</p>}
    </div>
  )
}
