export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

/**
 * GZW's UI text is light grey over textured, coloured backgrounds. Keep only light, low-saturation pixels, scale
 * up with bilinear sampling and return black text on white: what tesseract reads best (tuned on real screenshots).
 */
export function preprocess(img: Pixels, scale = 2, threshold = 170): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const { width: w, height: h, data } = img
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    lum[i] = saturation < 60 ? 0.299 * r + 0.587 * g + 0.114 * b : 0
  }
  const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]

  const W = w * scale
  const H = h * scale
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / scale - 0.5
    const y0 = Math.floor(fy)
    const dy = fy - y0
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / scale - 0.5
      const x0 = Math.floor(fx)
      const dx = fx - x0
      const l =
        at(x0, y0) * (1 - dx) * (1 - dy) + at(x0 + 1, y0) * dx * (1 - dy) + at(x0, y0 + 1) * (1 - dx) * dy + at(x0 + 1, y0 + 1) * dx * dy
      const v = l > threshold ? 0 : 255
      const o = (y * W + x) * 4
      out[o] = out[o + 1] = out[o + 2] = v
      out[o + 3] = 255
    }
  }
  return { width: W, height: H, data: out }
}
