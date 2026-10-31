import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../../../settings/SettingsContext'
import { gzw } from '../data'
import { parseOcrText, type OcrFindings } from '../ocr/parse'
import type { GzwWeapon } from '../types'
import { ImportDialog, type ImportSelection } from './ImportDialog'
import './import.css'

type State = { kind: 'idle' } | { kind: 'reading'; progress: number } | { kind: 'error' } | { kind: 'noImage' } | { kind: 'done'; findings: OcrFindings }

/**
 * "Import from clipboard": the button, Ctrl+V anywhere on the page, or a drop on the button; the help is in its title.
 * Without the Clipboard API the button opens a file picker. The OCR engine loads on first use.
 * The status line shows only while reading or after a failure.
 */
export function ImportControl({ currentWeapon, onApply }: {
  currentWeapon: GzwWeapon
  onApply: (s: ImportSelection) => void
}) {
  const { t } = useSettings()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const read = useCallback(
    async (image: Blob) => {
      setState({ kind: 'reading', progress: 0 })
      try {
        const { recognize } = await import('../ocr/recognize')
        const lines = await recognize(image, (p) => setState({ kind: 'reading', progress: p }))
        setState({ kind: 'done', findings: parseOcrText(lines, { data: gzw, currentWeapon }) })
      } catch {
        setState({ kind: 'error' })
      }
    },
    [currentWeapon],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (file) {
        e.preventDefault()
        void read(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [read])

  const close = useCallback(() => setState({ kind: 'idle' }), [])

  const fromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      fileRef.current?.click()
      return
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((ty) => ty.startsWith('image/'))
        if (type) return void read(await item.getType(type))
      }
    } catch {
      // Denied or unreadable: the same answer as a clipboard without an image.
    }
    setState({ kind: 'noImage' })
  }

  return (
    <div className={`import${drag ? ' drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
        if (file) void read(file)
      }}>
      <button type="button" disabled={state.kind === 'reading'} title={t('imp.hint')} onClick={() => void fromClipboard()}>{t('imp.button')}</button>
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="import-file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f) }} />
      <div role="status">
        {state.kind === 'reading' ? t('imp.reading', { p: Math.round(state.progress * 100) })
          : state.kind === 'error' ? <span className="err">{t('imp.error')}</span>
            : state.kind === 'noImage' && <span className="err">{t('imp.noImage')}</span>}
      </div>
      {state.kind === 'done' && (
        <ImportDialog findings={state.findings} currentWeapon={currentWeapon} onClose={close} onApply={(s) => { onApply(s); close() }} />
      )}
    </div>
  )
}
