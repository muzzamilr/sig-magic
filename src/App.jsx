// PROTOTYPE — throwaway code answering one question:
// "How do we scale a fullscreen-drawn signature down into a 400x200 box?"
//
// Answer implemented here: record strokes as VECTOR POINTS (arrays of {x,y}
// in viewport CSS pixels) while the user draws on a fullscreen transparent
// canvas. To render the preview, compute the bounding box of the ink,
// scale = min(targetW/bboxW, targetH/bboxH), center it, and REDRAW the
// strokes into the small canvas. No bitmap resampling → no blur, aspect
// ratio preserved, window size irrelevant, re-renderable at any resolution
// for download. A "naive" mode (squash the whole viewport into the box) is
// included as a toggle so the difference is visible.

import { useEffect, useRef, useState } from 'react'

const BOX_W = 400
const BOX_H = 200
const BOX_PAD = 16 // breathing room inside the preview box
const INK_WIDTH = 2.5 // stroke width while drawing fullscreen, CSS px

// ---------- scaling core (the interesting part) ----------

function getInkBBox(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) }
}

// Maps viewport-space stroke points into a w×h target.
// mode 'fit'   → uniform scale of the ink bounding box, centered (recommended)
// mode 'naive' → non-uniform squash of the whole viewport (for comparison)
function computeTransform(strokes, w, h, pad, mode, viewport) {
  if (mode === 'naive') {
    return { sx: w / viewport.w, sy: h / viewport.h, ox: 0, oy: 0 }
  }
  const b = getInkBBox(strokes)
  const s = Math.min((w - 2 * pad) / b.width, (h - 2 * pad) / b.height)
  return {
    sx: s,
    sy: s,
    ox: (w - b.width * s) / 2 - b.minX * s,
    oy: (h - b.height * s) / 2 - b.minY * s,
  }
}

// Redraws strokes onto a canvas of CSS size w×h, backed at `dpr` resolution.
function renderStrokes(canvas, strokes, w, h, mode, viewport, { dpr = window.devicePixelRatio || 1, background = null } = {}) {
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
  }
  if (!strokes.length) return
  const t = computeTransform(strokes, w, h, BOX_PAD, mode, viewport)
  // scale the pen width with the ink, but keep it visible and not cartoonish
  ctx.lineWidth = Math.min(Math.max(INK_WIDTH * Math.min(t.sx, t.sy), 1.2), 4)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1a1f36'
  for (const stroke of strokes) drawStroke(ctx, stroke, (p) => ({ x: p.x * t.sx + t.ox, y: p.y * t.sy + t.oy }))
}

// Smooth polyline: quadratic curves through midpoints.
function drawStroke(ctx, stroke, map) {
  const pts = stroke.map(map)
  ctx.beginPath()
  if (pts.length < 3) {
    const p = pts[0]
    ctx.moveTo(p.x, p.y)
    ctx.lineTo((pts[1] ?? p).x, (pts[1] ?? p).y + (pts.length === 1 ? 0.01 : 0))
  } else {
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
  }
  ctx.stroke()
}

// ---------- fullscreen capture overlay ----------

function CaptureOverlay({ initialStrokes, onDone, onCancel }) {
  const canvasRef = useRef(null)
  const strokesRef = useRef(initialStrokes.map((s) => [...s]))
  const liveStroke = useRef(null)
  const [hasInk, setHasInk] = useState(initialStrokes.length > 0)

  const redraw = () => {
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.lineWidth = INK_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1f36'
    for (const s of strokesRef.current) drawStroke(ctx, s, (p) => p)
  }

  useEffect(() => {
    redraw()
    window.addEventListener('resize', redraw)
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', redraw)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    liveStroke.current = [{ x: e.clientX, y: e.clientY }]
    strokesRef.current.push(liveStroke.current)
    setHasInk(true)
    redraw()
  }
  const onPointerMove = (e) => {
    if (!liveStroke.current) return
    liveStroke.current.push({ x: e.clientX, y: e.clientY })
    redraw()
  }
  const onPointerUp = () => {
    liveStroke.current = null
  }
  const clear = () => {
    strokesRef.current = []
    setHasInk(false)
    redraw()
  }

  return (
    <div className="capture-overlay">
      <canvas
        ref={canvasRef}
        className="capture-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="capture-hint">Sign anywhere on the screen with your mouse</div>
      <div className="capture-toolbar">
        <button onClick={clear}>Clear</button>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!hasInk} onClick={() => onDone(strokesRef.current)}>
          Done
        </button>
      </div>
    </div>
  )
}

// ---------- signature modal ----------

function SignatureModal({ onClose }) {
  const previewRef = useRef(null)
  const [strokes, setStrokes] = useState([])
  const [capturing, setCapturing] = useState(false)
  const [mode, setMode] = useState('fit')
  // viewport size at capture time — needed by naive mode, and so the render
  // is stable even if the window is resized afterwards
  const viewportRef = useRef({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    if (previewRef.current) {
      renderStrokes(previewRef.current, strokes, BOX_W, BOX_H, mode, viewportRef.current)
    }
  }, [strokes, mode, capturing])

  const download = () => {
    const off = document.createElement('canvas')
    renderStrokes(off, strokes, BOX_W, BOX_H, mode, viewportRef.current, { dpr: 2, background: '#ffffff' })
    off.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'signature.png'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  if (capturing) {
    return (
      <CaptureOverlay
        initialStrokes={strokes}
        onCancel={() => setCapturing(false)}
        onDone={(s) => {
          viewportRef.current = { w: window.innerWidth, h: window.innerHeight }
          setStrokes(s.map((st) => [...st]))
          setCapturing(false)
        }}
      />
    )
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Sign the monthly report</h2>
        <p className="muted">
          Your signature will be attached to the July 2026 compliance report.
        </p>

        <div className="sig-box" style={{ width: BOX_W, height: BOX_H }}>
          {strokes.length === 0 ? (
            <span className="sig-placeholder">No signature yet</span>
          ) : (
            <canvas ref={previewRef} style={{ width: BOX_W, height: BOX_H }} />
          )}
        </div>

        {strokes.length > 0 && (
          <label className="mode-toggle">
            Scaling:&nbsp;
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="fit">Fit ink bounding box (recommended)</option>
              <option value="naive">Naive: squash whole viewport</option>
            </select>
          </label>
        )}

        <div className="modal-actions">
          <button className="primary" onClick={() => setCapturing(true)}>
            {strokes.length ? 'Re-capture' : 'Capture signature'}
          </button>
          <button disabled={!strokes.length} onClick={() => setStrokes([])}>
            Clear
          </button>
          <button disabled={!strokes.length} onClick={download}>
            Download PNG
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ---------- dashboard (dummy data) ----------

const METRICS = [
  { label: 'Active patients', value: '1,284', delta: '+4.2%' },
  { label: 'Claims processed', value: '312', delta: '+11%' },
  { label: 'Pending approvals', value: '27', delta: '-8%' },
  { label: 'Revenue (MTD)', value: '$86.4k', delta: '+6.9%' },
]

const ROWS = [
  { name: 'Downtown Clinic', visits: 342, revenue: '$24,100', status: 'On track' },
  { name: 'Northside Care', visits: 289, revenue: '$19,870', status: 'On track' },
  { name: 'Lakeview Center', visits: 214, revenue: '$15,340', status: 'Review' },
  { name: 'Home Visits', visits: 439, revenue: '$27,090', status: 'On track' },
]

export default function App() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="page">
      <header className="topbar">
        <strong>Care Dashboard</strong>
        <span className="proto-badge">PROTOTYPE</span>
      </header>

      <main>
        <div className="metrics">
          {METRICS.map((m) => (
            <div className="card" key={m.label}>
              <div className="muted">{m.label}</div>
              <div className="metric-value">{m.value}</div>
              <div className={m.delta.startsWith('-') ? 'delta down' : 'delta up'}>{m.delta}</div>
            </div>
          ))}
        </div>

        <div className="card table-card">
          <div className="table-head">
            <h3>Locations — July 2026</h3>
            <button className="primary" onClick={() => setModalOpen(true)}>
              Sign monthly report
            </button>
          </div>
          <table>
            <thead>
              <tr><th>Location</th><th>Visits</th><th>Revenue</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td><td>{r.visits}</td><td>{r.revenue}</td><td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {modalOpen && <SignatureModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
