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
// Bumped by every startCapture claim and every stopCapture. A startCapture
// that awakes from its await to find the epoch moved on was superseded (a
// newer start or a stop happened) and must not touch the tablet.
let lifecycleEpoch = 0

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
  const claim = ++lifecycleEpoch
  const loaded = await loadSigWebScript(scriptUrl)
  if (claim !== lifecycleEpoch) return { ok: true, value: undefined } // superseded; newer session owns the tablet
  if (!loaded) return { ok: false, reason: 'script-load-failed' }
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ok: false, reason: 'service-unreachable' }
  try {
    teardownTablet()
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

function teardownTablet(): void {
  if (tabletTimer === null) return
  try {
    SetTabletState(0, tabletTimer)
    Reset()
  } catch {
    // service already unreachable — local timer handle is all we can drop
  }
  tabletTimer = null
}

export function stopCapture(): void {
  lifecycleEpoch++
  teardownTablet()
}

export function isCapturing(): boolean {
  return tabletTimer !== null
}

export function hasInk(): boolean {
  try {
    return Number(NumberOfTabletPoints()) > 0
  } catch {
    return false
  }
}

// Exports the pad's signature as a white-background PNG data URL at 2×
// the given CSS size.
export function exportPng(width: number, height: number): Promise<SigWebResult<string>> {
  return new Promise((resolve) => {
    try {
      if (Number(NumberOfTabletPoints()) === 0) {
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
