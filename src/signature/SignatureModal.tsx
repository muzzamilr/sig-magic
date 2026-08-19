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
