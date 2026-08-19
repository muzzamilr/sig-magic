# Topaz SigWeb + Canvas Signature Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Topaz SigWeb signature-pad capture as a second method next to the existing canvas drawing, behind a shared PNG contract, inside a self-contained liftable `src/signature/` module with an auto-detecting tabbed modal.

**Architecture:** A composable `src/signature/` package exposes one barrel (`index.ts`) exporting `SignatureModal` and the `SignatureResult` contract. Pure logic (stroke math in `canvas/strokes.ts`, SigWeb facade in `sigweb/sigwebClient.ts`) is React-free and unit-tested with `bun test`. React components (`CanvasCapture`, `SigWebCapture`, `SignatureModal`) are verified manually. The vendored `SigWebTablet.js` is a static asset in `public/vendor/`, lazy-loaded only when the pad is used.

**Tech Stack:** Bun, Vite 8, React 19, TypeScript 5.9 strict, `bun test` for unit tests, vendored Topaz SigWebTablet.js.

**Spec:** `docs/superpowers/specs/2026-08-19-topaz-sigweb-signature-capture-design.md`

## Global Constraints

- Bun only: `bun install`, `bun run <script>`, `bunx <tool>` — never npm/npx/yarn/pnpm/node.
- All first-party source is `.ts`/`.tsx`. The ONLY `.js` file allowed is the unmodified third-party `public/vendor/SigWebTablet.js` (static asset, not source).
- Commit messages must never mention Claude or Anthropic (enforced by `.githooks/commit-msg`). Plain conventional commits.
- `bun run typecheck` and `bun run lint` must pass before every commit.
- Nothing under `src/signature/` may import from outside `src/signature/` (React and ambient types excepted). The host app imports only from the `src/signature` barrel.
- All CSS classes in the module are prefixed `sig-` and live in `src/signature/signature.css`.
- Default signature box: 400×200 CSS px, PNG rendered at 2× (800×400).
- SigWeb service base URL: `http://tablet.sigwebtablet.com:47289/SigWeb/` (Topaz's hostname publicly resolves to 127.0.0.1).

---

### Task 1: Vendor SigWebTablet.js + ambient type declarations

**Files:**
- Create: `public/vendor/SigWebTablet.js` (downloaded, unmodified)
- Create: `src/types/sigweb.d.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: global ambient functions `SetTabletState`, `GetTabletState`, `ClearTablet`, `NumberOfTabletPoints`, `SetImageXSize`, `SetImageYSize`, `SetImagePenWidth`, `SetDisplayXSize`, `SetDisplayYSize`, `GetSigImageB64`, `Reset` — used by Task 3's `sigwebClient.ts`.

- [ ] **Step 1: Download the vendor library**

```bash
mkdir -p public/vendor
curl -fL -o public/vendor/SigWebTablet.js https://www.sigplusweb.com/SigWebTablet.js
```

If that URL 404s, try `https://www.topazsystems.com/software/sigweb/SigWebTablet.js`; failing both, copy the file from the Windows PC's SigWeb install (`C:\Program Files\Common Files\Topaz\SigWeb\SigWebTablet.js`) — any copy shipped with SigWeb 1.6+ is fine. Do not edit the file.

- [ ] **Step 2: Verify the file exposes the functions we need**

```bash
grep -c -E "function (SetTabletState|GetSigImageB64|ClearTablet|NumberOfTabletPoints|SetImageXSize|SetImageYSize|SetDisplayXSize|Reset)" public/vendor/SigWebTablet.js
```

Expected: a count ≥ 8. If any name is missing, stop and get a newer SigWebTablet.js — do not shim around it.

- [ ] **Step 3: Write the ambient declarations**

Create `src/types/sigweb.d.ts`:

```ts
// Ambient declarations for the subset of the vendored
// public/vendor/SigWebTablet.js globals used by
// src/signature/sigweb/sigwebClient.ts. The script is lazy-loaded at
// runtime, so callers must confirm the load succeeded before calling these.

declare function SetTabletState(
  state: number,
  contextOrTimer?: CanvasRenderingContext2D | number | null,
  timerInterval?: number,
): number | null
declare function GetTabletState(): number | string
declare function ClearTablet(): void
declare function NumberOfTabletPoints(): number
declare function SetImageXSize(x: number): void
declare function SetImageYSize(y: number): void
declare function SetImagePenWidth(width: number): void
declare function SetDisplayXSize(x: number): void
declare function SetDisplayYSize(y: number): void
declare function GetSigImageB64(callback: (base64: string) => void): void
declare function Reset(): void
```

- [ ] **Step 4: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both pass (the `.d.ts` compiles; the vendor file is outside `src/` so oxlint/tsc ignore it).

- [ ] **Step 5: Commit**

```bash
git add public/vendor/SigWebTablet.js src/types/sigweb.d.ts
git commit -m "feat: vendor Topaz SigWebTablet.js with ambient type declarations"
```

---

### Task 2: Signature contract + pure stroke math (`types.ts`, `strokes.ts`)

**Files:**
- Create: `src/signature/types.ts`
- Create: `src/signature/canvas/strokes.ts`
- Test: `src/signature/canvas/strokes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`: `type SignatureSource = 'canvas' | 'sigweb'`; `interface SignatureResult { pngDataUrl: string; width: number; height: number; source: SignatureSource; capturedAt: Date }`
  - `strokes.ts`: `type Point = { x: number; y: number }`; `type Stroke = Point[]`; `getInkBBox(strokes: Stroke[]): { minX: number; minY: number; width: number; height: number }`; `computeFitTransform(strokes: Stroke[], w: number, h: number, pad: number): { scale: number; ox: number; oy: number }`; `drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, map: (p: Point) => Point): void`; `renderStrokes(canvas: HTMLCanvasElement, strokes: Stroke[], w: number, h: number, opts?: { dpr?: number; background?: string | null }): void`; `renderStrokesToDataUrl(strokes: Stroke[], w: number, h: number): string`; `const INK_WIDTH = 2.5`; `const DEFAULT_PAD = 16`

The math is a lift of the existing code in `src/App.tsx:35-120`, with the `naive` viewport-squash mode and the `Viewport` type deleted (spec: `fit` is the only mode).

- [ ] **Step 1: Install bun test types**

```bash
bun add -d @types/bun
bun run typecheck
```

Expected: install succeeds, typecheck still passes. If a later step's `import ... from 'bun:test'` fails to resolve in `bun run typecheck`, add `"types": ["bun"]` to `compilerOptions` in `tsconfig.app.json`.

- [ ] **Step 2: Write the failing tests**

Create `src/signature/canvas/strokes.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { computeFitTransform, getInkBBox } from './strokes'

const rectStroke = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 110, y: 70 },
] // ink bbox: 100 × 50 at (10, 20)

describe('getInkBBox', () => {
  test('computes bounding box across strokes', () => {
    const b = getInkBBox([rectStroke, [{ x: 50, y: 90 }]])
    expect(b.minX).toBe(10)
    expect(b.minY).toBe(20)
    expect(b.width).toBe(100)
    expect(b.height).toBe(70)
  })

  test('clamps degenerate (single point) ink to 1×1', () => {
    const b = getInkBBox([[{ x: 5, y: 5 }]])
    expect(b.width).toBe(1)
    expect(b.height).toBe(1)
  })
})

describe('computeFitTransform', () => {
  test('scales uniformly to fit the padded box', () => {
    const t = computeFitTransform([rectStroke], 400, 200, 16)
    // limiting dimension: min(368/100, 168/50) = 3.36
    expect(t.scale).toBeCloseTo(3.36, 5)
  })

  test('centers the ink in the box', () => {
    const t = computeFitTransform([rectStroke], 400, 200, 16)
    const left = 10 * t.scale + t.ox
    const right = 110 * t.scale + t.ox
    expect(left).toBeCloseTo(400 - right, 5) // equal horizontal margins
    const top = 20 * t.scale + t.oy
    const bottom = 70 * t.scale + t.oy
    expect(top).toBeCloseTo(200 - bottom, 5) // equal vertical margins
  })

  test('degenerate ink produces a finite transform', () => {
    const t = computeFitTransform([[{ x: 5, y: 5 }]], 400, 200, 16)
    expect(Number.isFinite(t.scale)).toBe(true)
    expect(Number.isFinite(t.ox)).toBe(true)
    expect(Number.isFinite(t.oy)).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/signature/canvas/strokes.test.ts`
Expected: FAIL — cannot resolve `./strokes`.

- [ ] **Step 4: Write `types.ts` and `strokes.ts`**

Create `src/signature/types.ts`:

```ts
export type SignatureSource = 'canvas' | 'sigweb'

export interface SignatureResult {
  /** Normalized PNG data URL, rendered at 2× the stated CSS size. */
  pngDataUrl: string
  /** CSS px of the signature box the PNG represents. */
  width: number
  height: number
  source: SignatureSource
  capturedAt: Date
}
```

Create `src/signature/canvas/strokes.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/signature/canvas/strokes.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
bun run typecheck && bun run lint
git add src/signature/types.ts src/signature/canvas/strokes.ts src/signature/canvas/strokes.test.ts package.json bun.lock
git commit -m "feat: add signature contract and pure stroke math module"
```

(If Step 1 modified `tsconfig.app.json`, add it to the commit.)

---

### Task 3: SigWeb typed facade (`sigwebClient.ts`)

**Files:**
- Create: `src/signature/sigweb/sigwebClient.ts`
- Test: `src/signature/sigweb/sigwebClient.test.ts`

**Interfaces:**
- Consumes: ambient globals from Task 1 (`SetTabletState`, `ClearTablet`, `NumberOfTabletPoints`, `SetImageXSize`, `SetImageYSize`, `SetImagePenWidth`, `SetDisplayXSize`, `SetDisplayYSize`, `GetSigImageB64`, `Reset`).
- Produces (used by Tasks 5–6):
  - `type SigWebFailureReason = 'script-load-failed' | 'service-unreachable' | 'no-ink' | 'export-failed'`
  - `type SigWebResult<T> = { ok: true; value: T } | { ok: false; reason: SigWebFailureReason }`
  - `const DEFAULT_SIGWEB_SCRIPT_URL = '/vendor/SigWebTablet.js'`
  - `probeSigWeb(timeoutMs?: number, fetchImpl?: typeof fetch): Promise<boolean>`
  - `startCapture(canvas: HTMLCanvasElement, scriptUrl?: string): Promise<SigWebResult<void>>`
  - `clearCapture(): void`
  - `stopCapture(): void` (idempotent)
  - `hasInk(): boolean`
  - `isCapturing(): boolean`
  - `exportPng(width: number, height: number): Promise<SigWebResult<string>>`

- [ ] **Step 1: Write the failing tests**

`probeSigWeb` takes an injectable `fetchImpl` precisely so it is testable without a DOM or a real service. Create `src/signature/sigweb/sigwebClient.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { probeSigWeb } from './sigwebClient'

describe('probeSigWeb', () => {
  test('resolves true when the service responds ok', async () => {
    const fakeFetch = (async () => new Response('1', { status: 200 })) as typeof fetch
    expect(await probeSigWeb(1500, fakeFetch)).toBe(true)
  })

  test('resolves false when the connection is refused', async () => {
    const fakeFetch = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    expect(await probeSigWeb(1500, fakeFetch)).toBe(false)
  })

  test('resolves false when the service responds non-ok', async () => {
    const fakeFetch = (async () => new Response('', { status: 500 })) as typeof fetch
    expect(await probeSigWeb(1500, fakeFetch)).toBe(false)
  })

  test('aborts and resolves false after the timeout', async () => {
    const hangingFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as typeof fetch
    const started = performance.now()
    expect(await probeSigWeb(50, hangingFetch)).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/signature/sigweb/sigwebClient.test.ts`
Expected: FAIL — cannot resolve `./sigwebClient`.

- [ ] **Step 3: Write the implementation**

Create `src/signature/sigweb/sigwebClient.ts`:

```ts
// Typed facade over the vendored public/vendor/SigWebTablet.js.
// Pure logic — no React. The vendor script is lazy-loaded on first use so
// machines without a Topaz pad never load SigWeb code. All operations
// return typed results instead of throwing, so the UI can render friendly
// states. stopCapture() is idempotent and must be called on unmount/tab
// switch — leaked polling timers are the classic SigWeb failure mode.

export type SigWebFailureReason =
  | 'script-load-failed'
  | 'service-unreachable'
  | 'no-ink'
  | 'export-failed'

export type SigWebResult<T> = { ok: true; value: T } | { ok: false; reason: SigWebFailureReason }

export const DEFAULT_SIGWEB_SCRIPT_URL = '/vendor/SigWebTablet.js'

// Topaz owns this hostname; it publicly resolves to 127.0.0.1, where the
// SigWeb Windows service listens.
const SIGWEB_SERVICE_URL = 'http://tablet.sigwebtablet.com:47289/SigWeb/'

let scriptPromise: Promise<boolean> | null = null
let tabletTimer: number | null = null

function loadSigWebScript(url: string): Promise<boolean> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const el = document.createElement('script')
    el.src = url
    el.onload = () => resolve(typeof SetTabletState === 'function')
    el.onerror = () => {
      scriptPromise = null // allow retry after a transient load failure
      resolve(false)
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

// Fast availability check: does the local SigWeb service answer at all?
// Does not need the vendor script. On machines without SigWeb the
// connection is refused almost instantly; the timeout covers pathological
// cases (e.g. a firewall black-holing the port).
export async function probeSigWeb(timeoutMs = 1500, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${SIGWEB_SERVICE_URL}TabletState`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Begins tablet capture with live ink mirrored into `canvas`.
export async function startCapture(
  canvas: HTMLCanvasElement,
  scriptUrl: string = DEFAULT_SIGWEB_SCRIPT_URL,
): Promise<SigWebResult<void>> {
  const loaded = await loadSigWebScript(scriptUrl)
  if (!loaded) return { ok: false, reason: 'script-load-failed' }
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ok: false, reason: 'service-unreachable' }
  try {
    stopCapture()
    SetDisplayXSize(canvas.width)
    SetDisplayYSize(canvas.height)
    ClearTablet()
    tabletTimer = SetTabletState(1, ctx, 50)
    return { ok: true, value: undefined }
  } catch {
    tabletTimer = null
    return { ok: false, reason: 'service-unreachable' }
  }
}

export function clearCapture(): void {
  try {
    ClearTablet()
  } catch {
    // service gone mid-capture; the UI's next export/start will surface it
  }
}

export function stopCapture(): void {
  if (tabletTimer === null) return
  try {
    SetTabletState(0, tabletTimer)
    Reset()
  } catch {
    // service already unreachable — local timer handle is all we can drop
  }
  tabletTimer = null
}

export function isCapturing(): boolean {
  return tabletTimer !== null
}

export function hasInk(): boolean {
  try {
    return NumberOfTabletPoints() > 0
  } catch {
    return false
  }
}

// Exports the pad's signature as a white-background PNG data URL at 2×
// the given CSS size.
export function exportPng(width: number, height: number): Promise<SigWebResult<string>> {
  return new Promise((resolve) => {
    try {
      if (NumberOfTabletPoints() === 0) {
        resolve({ ok: false, reason: 'no-ink' })
        return
      }
      SetImageXSize(width * 2)
      SetImageYSize(height * 2)
      SetImagePenWidth(5)
      GetSigImageB64((base64) => {
        if (base64) resolve({ ok: true, value: `data:image/png;base64,${base64}` })
        else resolve({ ok: false, reason: 'export-failed' })
      })
    } catch {
      resolve({ ok: false, reason: 'export-failed' })
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/signature/sigweb/sigwebClient.test.ts`
Expected: all 4 tests PASS. Also run `bun test` — the Task 2 tests must still pass.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
bun run typecheck && bun run lint
git add src/signature/sigweb/sigwebClient.ts src/signature/sigweb/sigwebClient.test.ts
git commit -m "feat: add typed SigWeb client facade with availability probe"
```

---

### Task 4: Fullscreen draw overlay (`CanvasCapture.tsx`)

**Files:**
- Create: `src/signature/canvas/CanvasCapture.tsx`

This is the existing `CaptureOverlay` from `src/App.tsx:124-207`, moved into the module, importing `drawStroke`/`INK_WIDTH` from `./strokes` and using `sig-`-prefixed class names. No unit test (DOM component, no DOM test infra in this repo); it is manually verified in Task 7.

**Interfaces:**
- Consumes: `drawStroke`, `INK_WIDTH`, `Stroke` from `./strokes` (Task 2).
- Produces: `CanvasCapture` React component with props `{ initialStrokes: Stroke[]; onDone: (strokes: Stroke[]) => void; onCancel: () => void }` — used by Task 6.

- [ ] **Step 1: Write the component**

Create `src/signature/canvas/CanvasCapture.tsx`:

```tsx
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
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
```

- [ ] **Step 2: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both pass. (The component is not yet imported anywhere; `noUnusedLocals` applies to locals, not exports, so this is fine.)

- [ ] **Step 3: Commit**

```bash
git add src/signature/canvas/CanvasCapture.tsx
git commit -m "feat: add fullscreen canvas signature capture component"
```

---

### Task 5: Pad capture panel (`SigWebCapture.tsx`)

**Files:**
- Create: `src/signature/sigweb/SigWebCapture.tsx`

**Interfaces:**
- Consumes: `startCapture`, `stopCapture`, `clearCapture`, `hasInk`, `exportPng`, `SigWebFailureReason` from `./sigwebClient` (Task 3).
- Produces: `SigWebCapture` React component with props `{ boxWidth: number; boxHeight: number; scriptUrl: string; onAccept: (pngDataUrl: string) => void }` — used by Task 6.

Behavior: on mount, starts pad capture with live ink mirrored into an inline canvas (440×110, ~pad aspect ratio). Polls `hasInk()` every 400 ms to enable **Accept signature**. Accept exports the PNG, stops the tablet, and shows a captured state with a **Sign again** button. Errors show inline with **Retry**. `stopCapture()` always runs on unmount. React StrictMode double-mounts effects in dev, so start is guarded by a cancellation flag and stop is idempotent.

- [ ] **Step 1: Write the component**

Create `src/signature/sigweb/SigWebCapture.tsx`:

```tsx
// In-modal Topaz pad capture panel: live ink mirror, Clear / Accept,
// inline errors with Retry. Owns the SigWeb capture lifecycle; guarantees
// stopCapture() on unmount.

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearCapture, exportPng, hasInk, startCapture, stopCapture } from './sigwebClient'
import type { SigWebFailureReason } from './sigwebClient'

const MIRROR_W = 440
const MIRROR_H = 110
const INK_POLL_MS = 400

export interface SigWebCaptureProps {
  boxWidth: number
  boxHeight: number
  scriptUrl: string
  onAccept: (pngDataUrl: string) => void
}

type PanelState = 'starting' | 'capturing' | 'captured' | 'error'

const ERROR_COPY: Record<SigWebFailureReason, string> = {
  'script-load-failed': 'Could not load the SigWeb library.',
  'service-unreachable': 'Lost connection to the SigWeb service.',
  'no-ink': 'Nothing was signed on the pad yet.',
  'export-failed': 'Could not read the signature from the pad.',
}

export function SigWebCapture({ boxWidth, boxHeight, scriptUrl, onAccept }: SigWebCaptureProps) {
  const mirrorRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<PanelState>('starting')
  const [error, setError] = useState<string | null>(null)
  const [inkOnPad, setInkOnPad] = useState(false)

  const begin = useCallback(async () => {
    const canvas = mirrorRef.current
    if (!canvas) return
    setState('starting')
    setError(null)
    setInkOnPad(false)
    const started = await startCapture(canvas, scriptUrl)
    if (started.ok) {
      setState('capturing')
    } else {
      setState('error')
      setError(ERROR_COPY[started.reason])
    }
  }, [scriptUrl])

  useEffect(() => {
    let cancelled = false
    void begin().then(() => {
      if (cancelled) stopCapture() // StrictMode/unmount race: start resolved after cleanup
    })
    return () => {
      cancelled = true
      stopCapture()
    }
  }, [begin])

  useEffect(() => {
    if (state !== 'capturing') return
    const poll = setInterval(() => setInkOnPad(hasInk()), INK_POLL_MS)
    return () => clearInterval(poll)
  }, [state])

  const clear = () => {
    clearCapture()
    setInkOnPad(false)
  }

  const accept = async () => {
    const exported = await exportPng(boxWidth, boxHeight)
    if (exported.ok) {
      stopCapture()
      setState('captured')
      onAccept(exported.value)
    } else {
      setState('error')
      setError(ERROR_COPY[exported.reason])
      stopCapture()
    }
  }

  return (
    <div className="sig-pad-panel">
      <canvas
        ref={mirrorRef}
        width={MIRROR_W}
        height={MIRROR_H}
        className="sig-pad-mirror"
        hidden={state === 'captured' || state === 'error'}
      />
      {state === 'starting' && <div className="sig-hint">Connecting to the signature pad…</div>}
      {state === 'capturing' && <div className="sig-hint">Sign on the pad — the ink appears above</div>}
      {state === 'captured' && <div className="sig-hint">Signature captured from the pad</div>}
      {state === 'error' && <div className="sig-error">{error}</div>}
      <div className="sig-pad-actions">
        {state === 'capturing' && (
          <>
            <button onClick={clear} disabled={!inkOnPad}>
              Clear
            </button>
            <button className="sig-primary" onClick={accept} disabled={!inkOnPad}>
              Accept signature
            </button>
          </>
        )}
        {(state === 'captured' || state === 'error') && (
          <button className="sig-primary" onClick={begin}>
            {state === 'captured' ? 'Sign again' : 'Retry'}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/signature/sigweb/SigWebCapture.tsx
git commit -m "feat: add SigWeb pad capture panel component"
```

---

### Task 6: Modal, module styles, and public barrel

**Files:**
- Create: `src/signature/SignatureModal.tsx`
- Create: `src/signature/signature.css`
- Create: `src/signature/index.ts`

**Interfaces:**
- Consumes: `SignatureResult`, `SignatureSource` (Task 2 `./types`); `Stroke`, `renderStrokesToDataUrl` (Task 2 `./canvas/strokes`); `CanvasCapture` (Task 4); `SigWebCapture` (Task 5); `probeSigWeb`, `DEFAULT_SIGWEB_SCRIPT_URL` (Task 3).
- Produces (the module's entire public API, via `src/signature/index.ts`):
  - `SignatureModal` component and `SignatureModalProps`
  - `type SignatureResult`, `type SignatureSource`

- [ ] **Step 1: Write the modal**

Create `src/signature/SignatureModal.tsx`:

```tsx
// Method-agnostic signature modal: Draw / Signature pad tabs, SigWeb
// auto-detection, shared preview + actions. Holds one SignatureResult;
// never touches strokes or SigWeb internals beyond the tab panels.

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { CanvasCapture } from './canvas/CanvasCapture'
import { renderStrokesToDataUrl } from './canvas/strokes'
import type { Stroke } from './canvas/strokes'
import { SigWebCapture } from './sigweb/SigWebCapture'
import { DEFAULT_SIGWEB_SCRIPT_URL, probeSigWeb } from './sigweb/sigwebClient'
import type { SignatureResult, SignatureSource } from './types'

export interface SignatureModalProps {
  onClose: () => void
  /** Fired whenever a capture is accepted (either method). */
  onComplete?: (result: SignatureResult) => void
  boxWidth?: number
  boxHeight?: number
  title?: string
  description?: string
  sigWebScriptUrl?: string
}

type PadStatus = 'probing' | 'available' | 'unavailable'
type Tab = 'canvas' | 'sigweb'

export function SignatureModal({
  onClose,
  onComplete,
  boxWidth = 400,
  boxHeight = 200,
  title = 'Sign the monthly report',
  description = 'Your signature will be attached to the July 2026 compliance report.',
  sigWebScriptUrl = DEFAULT_SIGWEB_SCRIPT_URL,
}: SignatureModalProps) {
  const [padStatus, setPadStatus] = useState<PadStatus>('probing')
  const [tab, setTab] = useState<Tab>('canvas')
  const [result, setResult] = useState<SignatureResult | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [drawing, setDrawing] = useState(false)
  const userPickedTab = useRef(false)

  const probe = () => {
    setPadStatus('probing')
    void probeSigWeb().then((available) => {
      setPadStatus(available ? 'available' : 'unavailable')
      if (available && !userPickedTab.current) setTab('sigweb')
      if (!available && !userPickedTab.current) setTab('canvas')
    })
  }

  useEffect(probe, [])

  const pickTab = (next: Tab) => {
    userPickedTab.current = true
    setTab(next)
  }

  const accept = (pngDataUrl: string, source: SignatureSource) => {
    const r: SignatureResult = { pngDataUrl, width: boxWidth, height: boxHeight, source, capturedAt: new Date() }
    setResult(r)
    onComplete?.(r)
  }

  const download = () => {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.pngDataUrl
    a.download = 'signature.png'
    a.click()
  }

  const clearAll = () => {
    setResult(null)
    setStrokes([])
  }

  if (drawing) {
    return (
      <CanvasCapture
        initialStrokes={strokes}
        onCancel={() => setDrawing(false)}
        onDone={(s) => {
          setStrokes(s.map((st) => [...st]))
          setDrawing(false)
          accept(renderStrokesToDataUrl(s, boxWidth, boxHeight), 'canvas')
        }}
      />
    )
  }

  return (
    <div
      className="sig-modal-backdrop"
      onClick={(e: ReactMouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose()}
    >
      <div className="sig-modal">
        <h2>{title}</h2>
        <p className="sig-muted">{description}</p>

        <div className="sig-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'canvas'}
            className={tab === 'canvas' ? 'sig-tab active' : 'sig-tab'}
            onClick={() => pickTab('canvas')}
          >
            ✏️ Draw
          </button>
          <button
            role="tab"
            aria-selected={tab === 'sigweb'}
            className={tab === 'sigweb' ? 'sig-tab active' : 'sig-tab'}
            disabled={padStatus !== 'available'}
            onClick={() => pickTab('sigweb')}
          >
            🖊️ Signature pad
            {padStatus === 'probing' && ' (checking…)'}
          </button>
        </div>
        {padStatus === 'unavailable' && (
          <div className="sig-pad-note">
            Topaz signature pad not detected.{' '}
            <button className="sig-linklike" onClick={probe}>
              Retry
            </button>
          </div>
        )}

        {tab === 'canvas' && (
          <div className="sig-panel">
            <button className="sig-primary" onClick={() => setDrawing(true)}>
              {strokes.length ? 'Re-capture signature' : 'Capture signature'}
            </button>
          </div>
        )}
        {tab === 'sigweb' && padStatus === 'available' && (
          <SigWebCapture
            boxWidth={boxWidth}
            boxHeight={boxHeight}
            scriptUrl={sigWebScriptUrl}
            onAccept={(png) => accept(png, 'sigweb')}
          />
        )}

        <div className="sig-box" style={{ width: boxWidth, height: boxHeight }}>
          {result ? (
            <img src={result.pngDataUrl} width={boxWidth} height={boxHeight} alt="Captured signature" />
          ) : (
            <span className="sig-placeholder">No signature yet</span>
          )}
        </div>

        <div className="sig-actions">
          <button disabled={!result} onClick={clearAll}>
            Clear
          </button>
          <button disabled={!result} onClick={download}>
            Download PNG
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the module stylesheet**

Create `src/signature/signature.css`. Everything the module renders is styled here (including its own buttons), so the module works in a host app with no global styles:

```css
/* Signature module styles. All classes are sig- prefixed; the module owns
   its button styling so it stays self-contained when lifted into another
   codebase. */

.sig-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 40, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.sig-modal {
  background: #fff;
  border-radius: 12px;
  padding: 26px;
  width: 520px;
  max-width: calc(100vw - 32px);
  color: #1a1f36;
}
.sig-modal h2 { margin: 0 0 6px; font-size: 19px; }
.sig-muted { color: #6b7280; font-size: 13px; margin: 0 0 18px; }

.sig-modal button,
.sig-capture-toolbar button {
  font: inherit;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #d4d8e2;
  background: #fff;
  color: #1a1f36;
  cursor: pointer;
}
.sig-modal button:hover:not(:disabled),
.sig-capture-toolbar button:hover:not(:disabled) { background: #f2f4f9; }
.sig-modal button:disabled,
.sig-capture-toolbar button:disabled { opacity: 0.45; cursor: default; }
.sig-modal button.sig-primary,
.sig-capture-toolbar button.sig-primary { background: #3b5bdb; border-color: #3b5bdb; color: #fff; }
.sig-modal button.sig-primary:hover:not(:disabled),
.sig-capture-toolbar button.sig-primary:hover:not(:disabled) { background: #3450c4; }

.sig-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.sig-modal .sig-tab { border-radius: 8px 8px 0 0; border-bottom: 2px solid transparent; }
.sig-modal .sig-tab.active { border-bottom-color: #3b5bdb; font-weight: 600; }

.sig-pad-note { font-size: 13px; color: #6b7280; margin-bottom: 12px; }
.sig-modal .sig-linklike {
  border: none;
  background: none;
  padding: 0;
  color: #3b5bdb;
  text-decoration: underline;
  cursor: pointer;
}

.sig-panel { margin-bottom: 14px; text-align: center; }

.sig-pad-panel { margin-bottom: 14px; text-align: center; }
.sig-pad-mirror {
  display: block;
  margin: 0 auto 10px;
  border: 1px solid #e3e6ee;
  border-radius: 8px;
  background: #fff;
}
.sig-pad-actions { display: flex; gap: 8px; justify-content: center; margin-top: 8px; }
.sig-hint { font-size: 13px; color: #6b7280; }
.sig-error { font-size: 13px; color: #b42318; }

.sig-box {
  border: 2px dashed #c6cbd9;
  border-radius: 8px;
  background: #fafbfe;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 14px auto;
  overflow: hidden;
}
.sig-placeholder { color: #9aa1b2; font-size: 14px; }

.sig-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

/* fullscreen draw overlay */
.sig-capture-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(59, 91, 219, 0.05);
}
.sig-capture-canvas {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  touch-action: none;
}
.sig-capture-hint {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(26, 31, 54, 0.85);
  color: #fff;
  font-size: 13px;
  padding: 7px 16px;
  border-radius: 999px;
  pointer-events: none;
}
.sig-capture-toolbar {
  position: absolute;
  bottom: 26px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  background: #fff;
  border: 1px solid #e3e6ee;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 8px 30px rgba(20, 24, 40, 0.18);
}
```

- [ ] **Step 3: Write the barrel**

Create `src/signature/index.ts`:

```ts
// Public API of the signature module. Host apps import ONLY from here.
import './signature.css'

export { SignatureModal } from './SignatureModal'
export type { SignatureModalProps } from './SignatureModal'
export type { SignatureResult, SignatureSource } from './types'
```

- [ ] **Step 4: Typecheck, lint, tests**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/signature/SignatureModal.tsx src/signature/signature.css src/signature/index.ts
git commit -m "feat: add tabbed signature modal with SigWeb auto-detection"
```

---

### Task 7: Rewire the app + macOS manual verification

**Files:**
- Modify: `src/App.tsx` (delete everything except the dashboard, lines 1–120 and 124–298 of the current file go away)
- Modify: `src/index.css` (delete lines 70–148: the `/* modal */` and `/* fullscreen capture */` sections — `.modal-backdrop`, `.modal`, `.sig-box`, `.sig-placeholder`, `.mode-toggle`, `.modal-actions`, `.capture-overlay`, `.capture-canvas`, `.capture-hint`, `.capture-toolbar`)

**Interfaces:**
- Consumes: `SignatureModal` from `./signature` (Task 6 barrel). Nothing else from the module.

- [ ] **Step 1: Rewrite `App.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { SignatureModal } from './signature'

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

      {modalOpen && (
        <SignatureModal
          onClose={() => setModalOpen(false)}
          onComplete={(result) => console.log('signature captured:', result.source, result.capturedAt)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Prune `src/index.css`**

Delete the `/* modal */` and `/* fullscreen capture */` sections (currently lines 70–148). Keep everything above them (page, topbar, cards, table, generic `button` styles — the dashboard still uses those).

- [ ] **Step 3: Typecheck, lint, tests**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all pass, no unused-import complaints in `App.tsx`.

- [ ] **Step 4: Manual verification on macOS**

Run: `bun run dev`, open `http://localhost:5173`, and verify:

1. Dashboard renders unchanged.
2. "Sign monthly report" opens the modal; the pad tab briefly shows "(checking…)" then disables, with "Topaz signature pad not detected. Retry" underneath; Draw tab is selected.
3. Clicking Retry re-probes and returns to the same disabled state.
4. Capture signature → fullscreen overlay → draw → Done → preview shows the fit-scaled signature in the 400×200 box.
5. Re-capture resumes with existing ink; Escape cancels the overlay.
6. Clear empties the preview; Download PNG saves a white-background 800×400 PNG.
7. Clicking the backdrop closes the modal; browser console shows the `signature captured: canvas …` log and no errors (in particular, no SigWeb network spam — the vendor script must not have loaded).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "refactor: use composable signature module in the dashboard app"
```

---

### Task 8: Windows / real-pad verification (manual, run on the Windows PC)

**Files:** none (checklist only). This task runs later on the Windows PC with SigWeb drivers and a Topaz pad connected. Any fixes it produces are new commits against this plan's code.

- [ ] **Step 1: Set up**

On the Windows PC: clone/pull the repo, `bun install`, `bun run dev`, open `http://localhost:5173` in a browser **on that machine** (SigWeb only trusts localhost/HTTPS origins — do not test over the LAN).

- [ ] **Step 2: Detection**

1. With the SigWeb service running and pad plugged in: modal opens → pad tab enables and becomes the selected tab.
2. Stop the SigWeb service (services.msc → "SigWeb" → Stop) → reopen modal → pad tab disabled with the not-detected note; Retry after restarting the service re-enables it.

- [ ] **Step 3: Capture flow**

1. Sign on the pad → ink mirrors live into the in-modal canvas.
2. Clear wipes both the pad LCD (if the model has one) and the mirror.
3. Accept signature → preview fills with the pad signature; console logs `signature captured: sigweb …`.
4. Sign again → replaces the previous signature.
5. Download PNG produces a legible 800×400 image.

- [ ] **Step 4: Lifecycle/robustness**

1. Switch to the Draw tab mid-capture, then back — no duplicate ink, no console errors (stop/start cycled cleanly).
2. Close the modal mid-capture, reopen — capture restarts cleanly.
3. Kill the SigWeb service mid-capture → inline error appears in the pad panel with Retry; Draw tab still works.
4. Accept with nothing signed is impossible (button disabled).

- [ ] **Step 5: Record findings**

Note any deviations (e.g. pen width, mirror aspect ratio for the specific pad model, probe false-negatives) and fix them as follow-up commits. Known contingency: if the probe reports unavailable while the service is running (CORS behavior differs across SigWeb versions), change `probeSigWeb` to load the vendor script and call `GetTabletState()` in a try/catch instead of using `fetch` — connection-refused makes it fail fast on machines without SigWeb.
