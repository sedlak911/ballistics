// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { createWorker, type Worker } from 'tesseract.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { byName, gzw } from '../data'
import { OCR_PARAMS, textLines } from './params'
import { parseOcrText } from './parse'
import { preprocess } from './preprocess'

// Runs the real OCR engine on the owner's screenshots, with the same preprocessing and parameters as the browser.
const fixtures = join(__dirname, 'fixtures')
let worker: Worker

beforeAll(async () => {
  worker = await createWorker('eng', 1, {
    langPath: join(process.cwd(), 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
    gzip: true,
    cacheMethod: 'none',
  })
  await worker.setParameters(OCR_PARAMS)
}, 30_000)

afterAll(async () => {
  await worker?.terminate()
})

async function ocr(file: string): Promise<string[]> {
  const p = preprocess(PNG.sync.read(readFileSync(join(fixtures, file))))
  const png = new PNG({ width: p.width, height: p.height })
  png.data = Buffer.from(p.data)
  const { data } = await worker.recognize(PNG.sync.write(png))
  return textLines(data.text)
}

describe('OCR on real screenshots', () => {
  it('reads the weapon panel', async () => {
    const f = parseOcrText(await ocr('weapon-panel.png'), { data: gzw, currentWeapon: byName(gzw.weapons, 'M700')! })
    expect(f.weapons[0]?.name).toBe('M4A1')
    expect(f.accuracyMoa).toBe(1.76)
    expect(f.barrels[0]?.name).toBe('AR-15 Barrel - 16"')
  }, 30_000)

  it('reads the ammo off the gear screen', async () => {
    const f = parseOcrText(await ocr('gear-carriers.png'), { data: gzw, currentWeapon: byName(gzw.weapons, 'M4A1')! })
    const names = f.ammo.map((a) => a.ammo.name)
    expect(names).toContain('5.56x45mm AP (M855)')
    expect(names.every((n) => n.startsWith('5.56x45mm'))).toBe(true)
  }, 30_000)
})
