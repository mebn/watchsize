export interface Pixels {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

export interface Detection {
  /** Foreground mask, 1 = watch */
  mask: Uint8Array
  bbox: { x: number; y: number; w: number; h: number }
  /** Horizontal case edges in source pixels (crown excluded) */
  caseLeft: number
  caseRight: number
  /** Vertical center of the case row, in source pixels */
  caseY: number
  /** True when the background is plain enough to cut out reliably */
  plain: boolean
}

const TOLERANCE = 34

/**
 * Separates the watch from a plain product-photo background by flood filling
 * from the image border, then keeps the largest connected blob.
 */
export function segment(px: Pixels): { mask: Uint8Array; plain: boolean } {
  const { data, width: w, height: h } = px
  const n = w * h
  const bg = new Uint8Array(n)

  let transparent = 0
  for (let i = 0; i < n; i += 97) if (data[i * 4 + 3] < 20) transparent++
  const useAlpha = transparent > n / 97 / 20

  // Reference background colour: median of border pixels
  const border: number[][] = []
  for (let x = 0; x < w; x += 2) border.push(rgb(data, x), rgb(data, (h - 1) * w + x))
  for (let y = 0; y < h; y += 2) border.push(rgb(data, y * w), rgb(data, y * w + w - 1))
  const ref = [0, 1, 2].map((c) => median(border.map((p) => p[c])))
  const near = border.filter((p) => Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]) < TOLERANCE).length

  const isBg = (i: number) => {
    const a = data[i * 4 + 3]
    if (a < 20) return true
    if (useAlpha) return false
    const dr = data[i * 4] - ref[0]
    const dg = data[i * 4 + 1] - ref[1]
    const db = data[i * 4 + 2] - ref[2]
    return Math.sqrt(dr * dr + dg * dg + db * db) < TOLERANCE
  }

  const stack = new Int32Array(n)
  let sp = 0
  const push = (i: number) => {
    if (!bg[i] && isBg(i)) {
      bg[i] = 1
      stack[sp++] = i
    }
  }
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x)
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1)
  while (sp) {
    const i = stack[--sp]
    const x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < n - w) push(i + w)
  }

  // Soft drop shadows: keep growing the background through grey pixels that
  // change only gradually, which stops at the sharp edge of the watch itself.
  if (!useAlpha) {
    const lum = (i: number) => (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
    const grey = (i: number) => {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
      return Math.max(r, g, b) - Math.min(r, g, b) < 14 && lum(i) > 110
    }
    for (let i = 0; i < n; i++) if (bg[i]) stack[sp++] = i
    const soft = (from: number, to: number) => {
      if (!bg[to] && grey(to) && Math.abs(lum(to) - lum(from)) < 2.5) {
        bg[to] = 1
        stack[sp++] = to
      }
    }
    while (sp) {
      const i = stack[--sp]
      const x = i % w
      if (x > 0) soft(i, i - 1)
      if (x < w - 1) soft(i, i + 1)
      if (i >= w) soft(i, i - w)
      if (i < n - w) soft(i, i + w)
    }
  }

  // Largest connected foreground component
  const label = new Int32Array(n)
  let best = 0
  let bestSize = 0
  let next = 1
  for (let s = 0; s < n; s++) {
    if (bg[s] || label[s]) continue
    let size = 0
    sp = 0
    stack[sp++] = s
    label[s] = next
    while (sp) {
      const i = stack[--sp]
      size++
      const x = i % w
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
      for (const j of nb) {
        if (j >= 0 && j < n && !bg[j] && !label[j]) {
          label[j] = next
          stack[sp++] = j
        }
      }
    }
    if (size > bestSize) (bestSize = size), (best = next)
    next++
  }

  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (label[i] === best && best) mask[i] = 1
  // Product shots sit on white; dark backgrounds tend to swallow dark dials
  const light = ref[0] * 0.299 + ref[1] * 0.587 + ref[2] * 0.114 > 190
  const plain = (useAlpha || (light && near / border.length > 0.85)) && bestSize > n * 0.03 && bestSize < n * 0.95
  return { mask, plain }
}

/**
 * Finds the case width. Assumes a front view with the strap running vertically:
 * the strap gives the symmetry axis, and the case half width is taken from the
 * side without the crown (the shorter one).
 */
export function detect(px: Pixels): Detection {
  const { width: w, height: h } = px
  const { mask, plain } = segment(px)

  const left = new Int32Array(h).fill(-1)
  const right = new Int32Array(h).fill(-1)
  let minX = w, maxX = -1, minY = h, maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (left[y] < 0) left[y] = x
        right[y] = x
      }
    }
    if (left[y] >= 0) {
      minX = Math.min(minX, left[y])
      maxX = Math.max(maxX, right[y])
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }

  if (!plain || maxX < 0) {
    const d = Math.min(w, h) * 0.5
    return {
      mask,
      bbox: { x: 0, y: 0, w, h },
      caseLeft: (w - d) / 2,
      caseRight: (w + d) / 2,
      caseY: h / 2,
      plain: false,
    }
  }

  const rows: number[] = []
  for (let y = minY; y <= maxY; y++) if (left[y] >= 0) rows.push(y)
  const widths = rows.map((y) => right[y] - left[y])
  const maxW = Math.max(...widths)

  // Symmetry axis from the narrower rows (strap and lugs)
  const narrow = rows.filter((_, i) => widths[i] < maxW * 0.8)
  const axisRows = narrow.length > 10 ? narrow : rows
  const cx = median(axisRows.map((y) => (left[y] + right[y]) / 2))

  // Robust extremes: ignore the few outermost rows to skip stray pixels
  const lefts = rows.map((y) => left[y]).sort((a, b) => a - b)
  const rights = rows.map((y) => right[y]).sort((a, b) => b - a)
  const k = Math.min(3, lefts.length - 1)
  const leftHalf = cx - lefts[k]
  const rightHalf = rights[k] - cx
  const half = Math.min(leftHalf, rightHalf)

  // Row where the case is widest on the crown free side
  const wide = rows.filter((y) =>
    leftHalf <= rightHalf ? cx - left[y] > half * 0.97 : right[y] - cx > half * 0.97,
  )
  const caseY = wide.length ? median(wide) : (minY + maxY) / 2

  return {
    mask,
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    caseLeft: cx - half,
    caseRight: cx + half,
    caseY,
    plain,
  }
}

function rgb(d: Pixels['data'], i: number) {
  return [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]
}

function median(a: number[]) {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}
