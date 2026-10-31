// Copies the OCR engine into public/ocr/ so the site serves it itself: no CDN at runtime.
// Runs before dev and build; the copies are not committed (see .gitignore).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'ocr')

// createWorker('eng', 1) is LSTM-only; the loader picks one of these by device support.
const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
]

mkdirSync(out, { recursive: true })
for (const [from, to] of files) copyFileSync(join(nm, from), join(out, to))
console.log(`OCR assets copied to public/ocr/ (${files.length} files)`)
