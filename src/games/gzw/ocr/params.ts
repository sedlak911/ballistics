import type { WorkerParams } from 'tesseract.js'

// Shared by the browser and the Node test, so both read screenshots the same way. Type-only import: the engine
// itself is loaded lazily.
export const OCR_PARAMS: Partial<WorkerParams> = {
  // Sparse text: inventory labels are scattered words, not paragraphs.
  tessedit_pageseg_mode: '11' as WorkerParams['tessedit_pageseg_mode'],
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-"/% ',
}

export function textLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}
