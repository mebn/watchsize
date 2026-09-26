import { get, set } from 'idb-keyval'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Editor, type EditorInput, type EditorResult } from './Editor'
import { Icon, Mark } from './icons'
import { blobFromTransfer } from './image'
import { CSS_MM, mmPerPx, SHEET_H, SHEET_W, type Item } from './types'

const uid = () => Math.random().toString(36).slice(2, 10)

function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s == null ? initial : JSON.parse(s)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      // storage unavailable
    }
  }, [key, v])
  return [v, setV] as const
}

type Pending = EditorInput & { editId?: string; at?: { x: number; y: number } }

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [theme, setTheme] = useStored<'light' | 'dark' | null>('ws.theme', null)
  const [pxPerMm, setPxPerMm] = useStored('ws.pxPerMm', CSS_MM)
  const [trueSize, setTrueSize] = useStored('ws.trueSize', false)
  const [labels, setLabels] = useStored('ws.labels', true)
  const [calibrating, setCalibrating] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 800, h: 1000 })

  useEffect(() => {
    get<Item[]>('ws.items')
      .then((v) => v && setItems(v))
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (loaded) set('ws.items', items).catch(() => {})
  }, [items, loaded])

  useEffect(() => {
    const el = document.documentElement
    if (theme) el.dataset.theme = theme
    else delete el.dataset.theme
  }, [theme])

  useLayoutEffect(() => {
    const el = mainRef.current!
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitScale = Math.max(1, Math.min((area.w - 64) / SHEET_W, (area.h - 64) / SHEET_H))
  const scale = trueSize ? pxPerMm : fitScale

  const nextSpot = useCallback(() => {
    const n = items.length
    return { x: 40 + (n % 3) * 65, y: 55 + (Math.floor(n / 3) % 4) * 70 }
  }, [items.length])

  const place = (r: EditorResult, p: Pending) => {
    if (p.editId) {
      setItems((all) =>
        all.map((i) =>
          i.id === p.editId ? { ...i, ...r.processed, name: r.name, diameter: r.diameter, raw: r.raw } : i,
        ),
      )
    } else {
      const id = uid()
      const at = p.at ?? nextSpot()
      setItems((all) => [...all, { id, ...r.processed, name: r.name, diameter: r.diameter, raw: r.raw, ...at }])
      setSelected(id)
    }
    setPending(null)
  }

  const update = (id: string, patch: Partial<Item>) =>
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const remove = (id: string) => {
    setItems((all) => all.filter((i) => i.id !== id))
    setSelected(null)
  }
  const toFront = (id: string) =>
    setItems((all) => {
      const i = all.find((x) => x.id === id)!
      return [...all.filter((x) => x.id !== id), i]
    })
  const duplicate = (id: string) => {
    const src = items.find((i) => i.id === id)!
    const n = { ...src, id: uid(), x: src.x + 8, y: src.y + 8 }
    setItems((all) => [...all, n])
    setSelected(n.id)
  }
  const edit = (it: Item) =>
    setPending({
      name: it.name,
      diameter: it.diameter,
      blob: it.raw,
      processed: it,
      editId: it.id,
    })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || !selected) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      const it = items.find((i) => i.id === selected)
      if (!it) return
      const step = e.shiftKey ? 5 : 0.5
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      if (e.key === 'Delete' || e.key === 'Backspace') remove(selected)
      else if (e.key === 'Escape') setSelected(null)
      else if (moves[e.key]) {
        e.preventDefault()
        update(selected, { x: it.x + moves[e.key][0], y: it.y + moves[e.key][1] })
      } else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toSheet = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropHover(false)
    const at = toSheet(e.clientX, e.clientY)
    const dt = e.dataTransfer
    const blob = await blobFromTransfer(dt).catch(() => null)
    if (blob) setPending({ name: '', blob, at })
  }

  const sel = items.find((i) => i.id === selected)

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Mark />
          <span>watchsize</span>
        </div>
        <button className="new-watch" onClick={() => setPending({ name: '' })}>
          <Icon name="plus" size={16} />
          <span>New watch</span>
        </button>
        <ul className="results">
          {[...items].reverse().map((it) => (
            <li key={it.id} className={it.id === selected ? 'on' : ''} onClick={() => setSelected(it.id)} onDoubleClick={() => edit(it)}>
              <span className="dial" style={{ width: it.diameter * 0.62, height: it.diameter * 0.62 }}>
                <img
                  src={it.src}
                  alt=""
                  style={{
                    width: `${(it.width / (it.caseRight - it.caseLeft)) * 100}%`,
                    left: `${(-it.caseLeft / (it.caseRight - it.caseLeft)) * 100}%`,
                    top: `${((it.diameter / 2 - it.caseY * mmPerPx(it)) / it.diameter) * 100}%`,
                  }}
                />
              </span>
              <span className="r-text">
                <b>{it.name}</b>
              </span>
              <span className="mm">{it.diameter}</span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main">
        <div className="toolbar">
          <div className="seg">
            <button className={!trueSize ? 'on' : ''} onClick={() => setTrueSize(false)} title="Fit">
              <Icon name="fit" size={16} />
            </button>
            <button className={trueSize ? 'on' : ''} onClick={() => setTrueSize(true)} title="Actual size">
              1:1
            </button>
          </div>
          <button className={`icon-btn ${calibrating ? 'on' : ''}`} onClick={() => setCalibrating(!calibrating)} title="Calibrate screen">
            <Icon name="ruler" />
          </button>
          <button className={`icon-btn ${labels ? 'on' : ''}`} onClick={() => setLabels(!labels)} title="Labels">
            <Icon name="tag" />
          </button>
          <button className="icon-btn" onClick={() => window.print()} title="Print A4">
            <Icon name="printer" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
              setTheme(dark ? 'light' : 'dark')
            }}
            title="Theme"
          >
            <Icon name="sun" className="only-dark" />
            <Icon name="moon" className="only-light" />
          </button>
        </div>

        {calibrating && <Calibrate value={pxPerMm} onChange={setPxPerMm} onClose={() => setCalibrating(false)} />}

        <div
          ref={mainRef}
          className="scroller"
          onPointerDown={(e) => (e.target === e.currentTarget || e.target === e.currentTarget.firstChild) && setSelected(null)}
        >
        <div className="stage-wrap">
          <div
            ref={stageRef}
            className={`stage ${dropHover ? 'over' : ''}`}
            style={{ width: SHEET_W * scale, height: SHEET_H * scale }}
            onDragOver={(e) => {
              e.preventDefault()
              setDropHover(true)
            }}
            onDragLeave={() => setDropHover(false)}
            onDrop={onDrop}
          >
            <div
              className="sheet"
              style={{ transform: `scale(${scale / CSS_MM})` }}
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            >
              {items.map((it) => (
                <Watch
                  key={it.id}
                  item={it}
                  scale={scale}
                  selected={it.id === selected}
                  labels={labels}
                  onSelect={() => setSelected(it.id)}
                  onMove={(x, y) => update(it.id, { x, y })}
                  onEdit={() => edit(it)}
                />
              ))}
              <div className="scale-bar">
                <i />
                <span>50 mm</span>
              </div>
            </div>
            {sel && (
              <div className="float" style={floatPos(sel, scale)} onPointerDown={(e) => e.stopPropagation()}>
                <button onClick={() => update(sel.id, { ghost: !sel.ghost })} className={sel.ghost ? 'on' : ''} title="Transparent">
                  <Icon name="ghost" size={16} />
                </button>
                <button onClick={() => toFront(sel.id)} title="Bring to front">
                  <Icon name="front" size={16} />
                </button>
                <button onClick={() => edit(sel)} title="Adjust">
                  <Icon name="sliders" size={16} />
                </button>
                <button onClick={() => duplicate(sel.id)} title="Duplicate">
                  <Icon name="copy" size={16} />
                </button>
                <button onClick={() => remove(sel.id)} title="Remove">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </main>

      {pending && <Editor input={pending} onClose={() => setPending(null)} onDone={(r) => place(r, pending)} />}
    </div>
  )
}

function floatPos(it: Item, scale: number) {
  const k = mmPerPx(it)
  const top = (it.y - it.caseY * k) * scale - 48
  return { left: it.x * scale, top: Math.max(8, top) }
}

function Watch({
  item,
  scale,
  selected,
  labels,
  onSelect,
  onMove,
  onEdit,
}: {
  item: Item
  scale: number
  selected: boolean
  labels: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onEdit: () => void
}) {
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const k = mmPerPx(item)
  const w = item.width * k
  const h = item.height * k
  const cx = ((item.caseLeft + item.caseRight) / 2) * k
  const cy = item.caseY * k
  const d = item.diameter

  return (
    <div
      className={`watch ${selected ? 'sel' : ''} ${item.ghost ? 'ghost' : ''}`}
      style={{ left: `${item.x - cx}mm`, top: `${item.y - cy}mm`, width: `${w}mm`, height: `${h}mm` }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { px: e.clientX, py: e.clientY, x: item.x, y: item.y }
        onSelect()
      }}
      onPointerMove={(e) => {
        const g = drag.current
        if (!g) return
        onMove(g.x + (e.clientX - g.px) / scale, g.y + (e.clientY - g.py) / scale)
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={onEdit}
    >
      <img src={item.src} alt={item.name} draggable={false} />
      <div
        className="ring"
        style={{ left: `${cx - d / 2}mm`, top: `${cy - d / 2}mm`, width: `${d}mm`, height: `${d}mm` }}
      />
      {labels && (
        <div className="label" style={{ top: `${h + 2}mm` }}>
          <span className="n">{item.name}</span>
          <span className="d">{d} mm</span>
        </div>
      )}
    </div>
  )
}

const CARD_W = 85.6
const CARD_H = 53.98

function Calibrate({ value, onChange, onClose }: { value: number; onChange: (v: number) => void; onClose: () => void }) {
  return (
    <div className="calibrate">
      <div className="card" style={{ width: CARD_W * value, height: CARD_H * value }}>
        <i className="chip-shape" />
        <span className="mm">85.60 × 53.98</span>
      </div>
      <div className="cal-row">
        <button className="icon-btn" onClick={() => onChange(+(value - 0.01).toFixed(3))}>
          <Icon name="minus" size={14} />
        </button>
        <input
          type="range"
          min={2}
          max={8}
          step={0.005}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <button className="icon-btn" onClick={() => onChange(+(value + 0.01).toFixed(3))}>
          <Icon name="plus" size={14} />
        </button>
        <button className="icon-btn" onClick={() => onChange(CSS_MM)} title="Reset">
          <Icon name="reset" size={14} />
        </button>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="check" size={16} />
        </button>
      </div>
    </div>
  )
}
