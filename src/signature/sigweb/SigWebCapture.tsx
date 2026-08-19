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
