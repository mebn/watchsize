import { detect } from './detect'

export interface Processed {
  /** PNG data URL, cropped to the watch */
  src: string
  width: number
  height: number
  caseLeft: number
  caseRight: number
  caseY: number
  /** Background was removed */
  cutout: boolean
}

const MAX_SIDE = 1400
const OUT_SIDE = 1000

export async function fetchImage(url: string): Promise<Blob> {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return (await fetch(url)).blob()
  }
  try {
    const r = await fetch(url, { mode: 'cors' })
    if (r.ok) return await r.blob()
  } catch {
    // fall through to the proxy
  }
  const r = await fetch(`/api/img?url=${encodeURIComponent(url)}`)
  if (!r.ok) throw new Error('fetch failed')
  return r.blob()
}

/**
 * Detects the case edges, removes the background and crops to the watch.
 * Background removal defaults to on only when the background is plain.
 */
export async function processImage(blob: Blob, cutout?: boolean): Promise<Processed> {
  const bmp = await createImageBitmap(blob)
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * s)
  const h = Math.round(bmp.height * s)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const img = ctx.getImageData(0, 0, w, h)
  const d = detect(img)
  const removeBackground = cutout ?? d.plain

  if (removeBackground) {
    for (let i = 0; i < w * h; i++) if (!d.mask[i]) img.data[i * 4 + 3] = 0
    ctx.putImageData(img, 0, 0)
  }

  const pad = Math.round(Math.max(d.bbox.w, d.bbox.h) * 0.02)
  const bx = removeBackground ? Math.max(0, d.bbox.x - pad) : 0
  const by = removeBackground ? Math.max(0, d.bbox.y - pad) : 0
  const bw = removeBackground ? Math.min(w - bx, d.bbox.w + pad * 2) : w
  const bh = removeBackground ? Math.min(h - by, d.bbox.h + pad * 2) : h
  const o = Math.min(1, OUT_SIDE / Math.max(bw, bh))

  const out = document.createElement('canvas')
  out.width = Math.round(bw * o)
  out.height = Math.round(bh * o)
  const octx = out.getContext('2d')!
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(canvas, bx, by, bw, bh, 0, 0, out.width, out.height)

  return {
    src: out.toDataURL(removeBackground ? 'image/png' : 'image/jpeg', 0.92),
    width: out.width,
    height: out.height,
    caseLeft: (d.caseLeft - bx) * o,
    caseRight: (d.caseRight - bx) * o,
    caseY: (d.caseY - by) * o,
    cutout: removeBackground,
  }
}

/** Pulls an image out of a drop or paste event: files, or an image dragged from another tab. */
export async function blobFromTransfer(dt: DataTransfer): Promise<Blob | null> {
  const file = [...dt.files].find((f) => f.type.startsWith('image/'))
  if (file) return file
  const item = [...(dt.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
  const f = item?.getAsFile()
  if (f) return f
  const html = dt.getData('text/html')
  const src = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
  const uri = src || dt.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#')) || dt.getData('text/plain')
  if (uri && /^(https?:|data:image)/.test(uri.trim())) return fetchImage(uri.trim().replace(/&amp;/g, '&'))
  return null
}
