// Vector stroke model and rendering for the draw-on-screen signature
// method. Pure logic — no React. Strokes are arrays of viewport CSS-px
// points; rendering scales the ink bounding box uniformly into a target
// box, so window size at capture time is irrelevant.

export type Point = { x: number; y: number }
export type Stroke = Point[]

export const INK_WIDTH = 2.5 // stroke width while drawing fullscreen, CSS px
export const DEFAULT_PAD = 16 // breathing room inside the target box

export interface InkBBox {
  minX: number
  minY: number
  width: number
  height: number
}

export interface FitTransform {
  scale: number
  ox: number
  oy: number
}

export function getInkBBox(strokes: Stroke[]): InkBBox {
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

// Uniform scale of the ink bounding box, centered in a w×h box with `pad`
// margin on the limiting axis.
export function computeFitTransform(strokes: Stroke[], w: number, h: number, pad: number): FitTransform {
  const b = getInkBBox(strokes)
  const scale = Math.min((w - 2 * pad) / b.width, (h - 2 * pad) / b.height)
  return {
    scale,
    ox: (w - b.width * scale) / 2 - b.minX * scale,
    oy: (h - b.height * scale) / 2 - b.minY * scale,
  }
}

// Smooth polyline: quadratic curves through midpoints.
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, map: (p: Point) => Point): void {
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

// Redraws strokes fit-scaled onto a canvas of CSS size w×h, backed at `dpr`.
export function renderStrokes(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  w: number,
  h: number,
  { dpr = window.devicePixelRatio || 1, background = null as string | null } = {},
): void {
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
  }
  if (!strokes.length) return
  const t = computeFitTransform(strokes, w, h, DEFAULT_PAD)
  ctx.lineWidth = Math.min(Math.max(INK_WIDTH * t.scale, 1.2), 4)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1a1f36'
  for (const stroke of strokes) drawStroke(ctx, stroke, (p) => ({ x: p.x * t.scale + t.ox, y: p.y * t.scale + t.oy }))
}

// Normalized export: white background, 2× resolution PNG data URL.
export function renderStrokesToDataUrl(strokes: Stroke[], w: number, h: number): string {
  const canvas = document.createElement('canvas')
  renderStrokes(canvas, strokes, w, h, { dpr: 2, background: '#ffffff' })
  return canvas.toDataURL('image/png')
}
