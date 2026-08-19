// Fullscreen transparent overlay for drawing a signature with mouse/touch.
// Records vector strokes in viewport CSS px; scaling happens later in
// strokes.ts. Escape cancels.

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { INK_WIDTH, drawStroke } from './strokes'
import type { Stroke } from './strokes'

export interface CanvasCaptureProps {
  initialStrokes: Stroke[]
  onDone: (strokes: Stroke[]) => void
  onCancel: () => void
}

export function CanvasCapture({ initialStrokes, onDone, onCancel }: CanvasCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>(initialStrokes.map((s) => [...s]))
  const liveStroke = useRef<Stroke | null>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const [hasInk, setHasInk] = useState(initialStrokes.length > 0)

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancelRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', redraw)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    liveStroke.current = [{ x: e.clientX, y: e.clientY }]
    strokesRef.current.push(liveStroke.current)
    setHasInk(true)
    redraw()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
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
    <div className="sig-capture-overlay">
      <canvas
        ref={canvasRef}
        className="sig-capture-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="sig-capture-hint">Sign anywhere on the screen with your mouse</div>
      <div className="sig-capture-toolbar">
        <button onClick={clear}>Clear</button>
        <button onClick={onCancel}>Cancel</button>
        <button className="sig-primary" disabled={!hasInk} onClick={() => onDone(strokesRef.current)}>
          Done
        </button>
      </div>
    </div>
  )
}
