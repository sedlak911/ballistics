/** An on/off switch: a 30 × 16 track in a 44 px button. `describedBy` disables it and names the reason's element. */
export function Switch({ on, label, onChange, describedBy }: { on: boolean; label: string; onChange: (on: boolean) => void; describedBy?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" disabled={describedBy !== undefined}
      aria-describedby={describedBy} onClick={() => onChange(!on)}>
      <span aria-hidden="true" />
    </button>
  )
}
