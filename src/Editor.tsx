import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Icon } from './icons'
import { blobFromTransfer, fetchImage, processImage, type Processed } from './image'

export interface EditorInput {
  name: string
  diameter?: number
  blob?: Blob
  processed?: Processed
}

export interface EditorResult {
  name: string
  diameter: number
  processed: Processed
  raw?: Blob
}

type Drag = { kind: 'left' | 'right' | 'move'; startX: number; startY: number; orig: Processed }

export function Editor({
  input,
  onDone,
  onClose,
}: {
  input: EditorInput
  onDone: (r: EditorResult) => void
  onClose: () => void
}) {
  const [name, setName] = useState(input.name)
  const [diameter, setDiameter] = useState(input.diameter ? String(input.diameter) : '')
  const [raw, setRaw] = useState<Blob | undefined>(input.blob)
  const [removeBg, setRemoveBg] = useState<boolean | undefined>(input.processed?.cutout)
  const [p, setP] = useState<Processed | undefined>(input.processed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [hover, setHover] = useState(false)
  const [url, setUrl] = useState('')
  const drag = useRef<Drag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const skipFirst = useRef(!!input.processed)

  // (Re)process whenever the source image or background option changes
  useEffect(() => {
    if (!raw) return
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    let live = true
    setBusy(true)
    setError(false)
    processImage(raw, removeBg)
      .then((r) => live && setP(r))
      .catch(() => live && setError(true))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [raw, removeBg])

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData || (e.target as HTMLElement)?.tagName === 'INPUT') return
      const b = await blobFromTransfer(e.clipboardData).catch(() => null)
      if (b) takeFile(b)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const load = async (get: () => Promise<Blob | null>) => {
    setBusy(true)
    setError(false)
    try {
      const b = await get()
      if (b) takeFile(b)
      else setBusy(false)
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  const loadUrl = (u: string) => {
    const file = decodeURIComponent(new URL(u).pathname.split('/').pop() ?? '')
    if (/\.(png|jpe?g|webp|avif|gif)$/i.test(file)) setName((n) => n || file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    load(() => fetchImage(u))
  }

  const takeFile = (b: Blob) => {
    setRaw(b)
    if (b instanceof File) setName((n) => n || b.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
  }

  const toImage = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * p!.width, y: ((e.clientY - r.top) / r.height) * p!.height }
  }

  const startDrag = (kind: Drag['kind']) => (e: RPointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const pt = toImage(e)
    drag.current = { kind, startX: pt.x, startY: pt.y, orig: p! }
  }

  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d || !p) return
    const pt = toImage(e)
    const dx = pt.x - d.startX
    const o = d.orig
    if (d.kind === 'move') {
      setP({ ...p, caseLeft: o.caseLeft + dx, caseRight: o.caseRight + dx, caseY: o.caseY + pt.y - d.startY })
    } else if (d.kind === 'left') {
      setP({ ...p, caseLeft: Math.min(o.caseLeft + dx, p.caseRight - 4) })
    } else {
      setP({ ...p, caseRight: Math.max(o.caseRight + dx, p.caseLeft + 4) })
    }
  }

  const dia = parseFloat(diameter.replace(',', '.'))
  const valid = !!p && dia > 5 && dia < 80

  const submit = () => valid && onDone({ name: name.trim() || 'Watch', diameter: dia, processed: p!, raw })

  const cx = p ? (p.caseLeft + p.caseRight) / 2 : 0
  const r = p ? (p.caseRight - p.caseLeft) / 2 : 0
  const stroke = p ? Math.max(p.width, p.height) / 300 : 1

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal>
        <header className="dialog-head">
          <input
            className="title-input"
            value={name}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
          />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>

        {p ? (
          <div className="measure">
            <svg
              ref={svgRef}
              className={`measure-img ${p.cutout ? 'checker' : ''}`}
              viewBox={`0 0 ${p.width} ${p.height}`}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
            >
              <image href={p.src} width={p.width} height={p.height} />
              <rect className="dim" x={0} y={0} width={Math.max(0, p.caseLeft)} height={p.height} />
              <rect className="dim" x={p.caseRight} y={0} width={Math.max(0, p.width - p.caseRight)} height={p.height} />
              <circle
                className="case-ring"
                cx={cx}
                cy={p.caseY}
                r={r}
                strokeWidth={stroke}
                onPointerDown={startDrag('move')}
              />
              {(['left', 'right'] as const).map((k) => {
                const x = k === 'left' ? p.caseLeft : p.caseRight
                return (
                  <g key={k} className="edge" onPointerDown={startDrag(k)}>
                    <line x1={x} x2={x} y1={0} y2={p.height} strokeWidth={stroke * 1.5} />
                    <line className="hit" x1={x} x2={x} y1={0} y2={p.height} strokeWidth={stroke * 16} />
                    <circle cx={x} cy={p.caseY} r={stroke * 6} />
                  </g>
                )
              })}
            </svg>
            {busy && <div className="busy" />}
          </div>
        ) : (
          <div className="source">
            <div
              className={`drop ${hover ? 'over' : ''} ${error ? 'err' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => (e.preventDefault(), setHover(true))}
              onDragLeave={() => setHover(false)}
              onDrop={(e) => {
                e.preventDefault()
                setHover(false)
                const dt = e.dataTransfer
                load(() => blobFromTransfer(dt))
              }}
            >
              {busy ? <div className="spinner" /> : <Icon name="upload" size={26} />}
              <span>Drop, paste or browse</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) takeFile(f)
                }}
              />
            </div>
            <form
              className={`url-row ${error && url ? 'err' : ''}`}
              onSubmit={(e) => {
                e.preventDefault()
                if (/^https?:\/\//.test(url.trim())) loadUrl(url.trim())
              }}
            >
              <Icon name="link" size={16} />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={(e) => {
                  const t = e.clipboardData.getData('text').trim()
                  if (/^https?:\/\//.test(t)) {
                    e.preventDefault()
                    setUrl(t)
                    loadUrl(t)
                  }
                }}
                placeholder="Paste image link"
              />
              {url.trim() && (
                <button className="icon-btn sm" type="submit" aria-label="Load">
                  <Icon name="check" size={14} />
                </button>
              )}
            </form>
          </div>
        )}

        <footer className="dialog-foot">
          <label className="mm-field">
            <input
              inputMode="decimal"
              value={diameter}
              placeholder="00.0"
              onChange={(e) => setDiameter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoFocus={!input.diameter}
            />
            <span>mm</span>
          </label>
          {p && (
            <>
              <button
                className={`chip ${p.cutout ? 'on' : ''}`}
                onClick={() => setRemoveBg(!p.cutout)}
                disabled={!raw}
                title="Remove background"
              >
                <Icon name="image" size={16} />
              </button>
              <button className="chip" onClick={() => (setP(undefined), setRaw(undefined), setRemoveBg(undefined))} title="Other image">
                <Icon name="back" size={16} />
              </button>
            </>
          )}
          <button className="primary" disabled={!valid} onClick={submit}>
            <Icon name="check" size={18} />
          </button>
        </footer>
      </div>
    </div>
  )
}
