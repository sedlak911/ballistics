import { useEffect, useRef, type RefObject } from 'react'

const LINE_PX = 16

/**
 * The wheel (or a trackpad's two-finger scroll) over `ref` as whole steps: one per `pxPerStep` of travel, wheel up
 * = positive. Travel accumulates, so a trackpad's small deltas add up and a mouse notch of 100 px is 10 steps.
 * Ctrl or ⌘ + wheel stays the browser's zoom; everywhere else, and over `ref` while not `enabled`, the page scrolls as
 * usual.
 */
export function useWheelSteps(
  ref: RefObject<HTMLElement | null>,
  onSteps: (steps: number) => void,
  { enabled = true, pxPerStep = 10 }: { enabled?: boolean; pxPerStep?: number } = {},
) {
  const callback = useRef(onSteps)
  useEffect(() => {
    callback.current = onSteps
  })
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let travel = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      // A mouse wheel with Shift scrolls sideways: take that travel too.
      const delta = e.deltaY || (e.shiftKey ? e.deltaX : 0)
      if (!delta) return
      e.preventDefault()
      travel -= e.deltaMode === 1 ? delta * LINE_PX : e.deltaMode === 2 ? delta * window.innerHeight : delta
      const steps = Math.trunc(travel / pxPerStep)
      if (steps === 0) return
      travel -= steps * pxPerStep
      callback.current(steps)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, enabled, pxPerStep])
}
