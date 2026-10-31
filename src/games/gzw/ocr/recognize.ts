import type { Worker } from 'tesseract.js'
import { OCR_PARAMS, textLines } from './params'
import { preprocess } from './preprocess'

let worker: Promise<Worker> | null = null
let onProgress: ((p: number) => void) | undefined

// The engine, its core and the language data come from ./ocr/ on this site (copied there at build time), never a CDN.
function getWorker(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker } = await import('tesseract.js')
    const base = new URL('./ocr/', document.baseURI).href
    const w = await createWorker('eng', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      gzip: true,
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress)
      },
    })
    await w.setParameters(OCR_PARAMS)
    return w
  })().catch((e: unknown) => {
    worker = null
    throw e
  })
  return worker
}

/** OCR'd lines of a screenshot. Large screenshots already have big enough text and are not scaled up. */
export async function recognize(image: Blob, progress?: (p: number) => void): Promise<string[]> {
  const bitmap = await createImageBitmap(image)
  const src = document.createElement('canvas')
  src.width = bitmap.width
  src.height = bitmap.height
  const ctx = src.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const p = preprocess(ctx.getImageData(0, 0, src.width, src.height), bitmap.width > 2200 ? 1 : 2)
  const out = document.createElement('canvas')
  out.width = p.width
  out.height = p.height
  out.getContext('2d')!.putImageData(new ImageData(p.data, p.width, p.height), 0, 0)

  onProgress = progress
  const { data } = await (await getWorker()).recognize(out)
  return textLines(data.text)
}
