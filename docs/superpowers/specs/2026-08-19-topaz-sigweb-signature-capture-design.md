# Topaz SigWeb + Canvas Signature Capture — Design

**Date:** 2026-08-19
**Status:** Approved for implementation planning

## Overview

Add Topaz SigWeb signature-pad capture to the app as a second signature
method alongside the existing fullscreen canvas drawing. The user picks the
method inside the signature modal via tabs; the app auto-detects whether the
SigWeb service is available and adapts. Both methods produce the same
normalized result, so nothing downstream cares which device captured the
signature.

## Goals

- Two capture methods behind one contract: draw-on-screen (canvas) and Topaz
  signature pad (SigWeb).
- Auto-detect SigWeb availability at modal-open time; degrade gracefully on
  machines without it (e.g. macOS, where SigWeb does not exist).
- **Composability:** the entire signature feature is a self-contained,
  liftable module. It must be possible to copy `src/signature/` (plus the
  vendored SigWeb asset and its `.d.ts`) into another codebase and use it
  without modification.

## Non-goals

- Persisting or uploading signatures anywhere (the demo keeps Download PNG).
- Biometric/forensic vector export (Topaz SigString). The result type leaves
  room to add it later, but it is not implemented.
- Supporting SigWeb from non-localhost origins (LAN access to the dev
  server). SigWeb's origin rules make localhost the supported path.
- Pen pressure, ink color options, or multi-signature documents.

## Result contract

Defined in `src/signature/types.ts`:

```ts
export type SignatureSource = 'canvas' | 'sigweb'

export interface SignatureResult {
  pngDataUrl: string        // normalized PNG at the configured box size, rendered @2x
  width: number             // CSS px of the box the PNG represents
  height: number
  source: SignatureSource
  capturedAt: Date
}
```

- PNG is the only interchange format. The canvas method keeps its vector
  strokes privately (for re-capture and re-render); SigWeb exports its own
  base64 image. Both normalize into the same box dimensions.
- `SignatureResult` is the *only* type that crosses the module boundary to
  the host app.

## Module layout

```
public/vendor/SigWebTablet.js       vendored Topaz library — static asset,
                                    loaded on demand; NOT a source file
                                    (keeps the TS-only source rule intact)
src/
  types/sigweb.d.ts                 ambient declarations for the vendor
                                    globals the client uses
  signature/
    index.ts                        public API barrel (the ONLY import path
                                    the host app uses)
    types.ts                        SignatureResult, SignatureSource,
                                    provider-facing shared types
    signature.css                   module-owned styles, imported by the
                                    barrel
    SignatureModal.tsx              tabs + preview + actions; method-agnostic
    canvas/
      strokes.ts                    Point/Stroke model, ink bbox, fit
                                    transform, stroke rendering (pure
                                    functions, no React)
      CanvasCapture.tsx             fullscreen draw overlay (refactor of the
                                    existing CaptureOverlay)
    sigweb/
      sigwebClient.ts               typed facade over the vendored library:
                                    lazy script loading, probe, capture
                                    lifecycle, PNG export (no React)
      SigWebCapture.tsx             in-modal pad panel: live ink mirror,
                                    Clear / Accept signature
```

`App.tsx` returns to being just the dashboard; it renders
`<SignatureModal … />` imported from `src/signature`.

## Composability rules

These are requirements, not suggestions:

1. **No inward imports.** Nothing under `src/signature/` may import from
   outside `src/signature/` (except React and `src/types/sigweb.d.ts`
   ambient types). The host app imports from `src/signature` (the barrel),
   never from its internals.
2. **Configuration via props, with defaults.** `SignatureModal` accepts:
   - `onClose: () => void`
   - `onComplete?: (result: SignatureResult) => void` — fired when a capture
     is accepted; the demo app may ignore it, a real app persists it
   - `boxWidth?` / `boxHeight?` (default 400×200)
   - `title?` / `description?` (default the current report copy)
   - `sigWebScriptUrl?` (default `/vendor/SigWebTablet.js`) — so a host app
     can serve the vendor file from wherever it likes
3. **Pure logic separated from React.** `strokes.ts` and `sigwebClient.ts`
   contain no JSX/hooks, so they can be unit-tested and reused headlessly.
4. **Self-contained styles.** The module's CSS lives with the module (a
   `signature.css` imported by the barrel), not in the app-level stylesheet.
5. The existing `naive` scaling mode is deleted — `fit` (uniform scale of
   the ink bounding box, centered) is the only mode. It was
   prototype-comparison cruft.

## SigWeb client (`sigwebClient.ts`)

- **Lazy loading.** The vendor script is injected as a `<script>` tag the
  first time the client is used (probe or capture). On machines that never
  open the pad tab path, no SigWeb code loads. Loading is memoized; a load
  failure resolves the probe as unavailable rather than throwing.
- **`probe(timeoutMs = 1500): Promise<boolean>`** — asks the local SigWeb
  service for its version/tablet state with a hard timeout. Used by the
  modal on open and by the "retry" affordance.
- **Capture lifecycle:**
  - `start(canvas: HTMLCanvasElement)` — begins tablet capture with live ink
    mirrored into the given canvas (SetTabletState on + polling timer).
  - `clear()` — clears the pad and the mirror canvas (ClearTablet).
  - `stop()` — ends capture, tears down the polling timer, resets tablet
    state. **Idempotent**, and always called on component unmount and on tab
    switch — leaked timers/tablet state are the classic SigWeb failure mode.
  - `exportPng(width, height): Promise<string>` — returns a base64 PNG data
    URL sized to the signature box (GetSigImageB64 with image size set).
  - `hasInk(): boolean` — whether any points were captured (gates Accept).
- **Typed errors.** Operations resolve to discriminated results (e.g.
  `{ ok: false, reason: 'service-unreachable' | 'no-ink' | … }`) so the UI
  renders friendly states instead of catching stringly-typed throws.

## Canvas method

Behavior is today's flow, relocated and refactored:

- `strokes.ts` holds the vector model and rendering math currently inlined
  in `App.tsx` (bbox, fit transform, quadratic-midpoint stroke drawing).
- `CanvasCapture.tsx` is the fullscreen transparent overlay (pointer events,
  Escape to cancel, Clear/Cancel/Done toolbar).
- On Done, the modal renders strokes to the preview and to a PNG data URL
  (@2x, white background for export) — producing a `SignatureResult` with
  `source: 'canvas'`. Strokes stay in modal-internal state so Re-capture can
  resume from the existing ink.

## Modal UX

```
┌─ Sign the monthly report ──────────────┐
│  Your signature will be attached to …  │
│                                         │
│  ┌──────────┬───────────────────┐       │
│  │ ✏ Draw   │ 🖊 Signature pad  │       │
│  └──────────┴───────────────────┘       │
│                                         │
│  [ tab-specific capture area ]          │
│                                         │
│  ┌───────────────────────────────┐      │
│  │   shared preview (400×200)    │      │
│  └───────────────────────────────┘      │
│                                         │
│  [Clear]  [Download PNG]  [Close]       │
└─────────────────────────────────────────┘
```

- **On open:** probe starts immediately. The pad tab shows "Checking for
  pad…" while pending (max ~1.5 s).
  - Pad found → "Signature pad" is the default tab.
  - Pad not found → "Draw" is default; the pad tab stays visible but
    disabled with the hint *"Topaz signature pad not detected"* and a
    **Retry** affordance (covers plugging the pad in after opening).
- **Draw tab:** a "Capture signature" / "Re-capture" button opens the
  fullscreen overlay; Done returns to the modal with the preview filled.
- **Pad tab:** an inline live-ink canvas mirroring the pad LCD, hint "Sign
  on the pad", buttons **Clear** and **Accept signature** (disabled until
  ink exists). Accept stops the tablet, exports the PNG, fills the shared
  preview.
- **Shared state:** the accepted signature is one `SignatureResult`.
  Switching tabs does not discard it; starting a new capture on either tab
  replaces it. Clear empties it. Download renders/downloads the PNG. Close
  calls `stop()` if pad capture is active, then `onClose`.
- **Error surface:** if the SigWeb service dies mid-capture, the pad panel
  shows an inline error with Retry; the Draw tab always remains usable.

## Error handling summary

| Failure | Behavior |
|---|---|
| SigWeb service absent (macOS, no drivers) | Probe fails fast → pad tab disabled with hint + Retry |
| Vendor script fails to load | Same as service absent |
| Service dies mid-capture | Inline error in pad panel, capture torn down, Retry offered |
| Accept with no ink on pad | Accept button disabled (`hasInk`) |
| Modal closed / tab switched during capture | `stop()` always runs; no leaked timers or tablet state |

## Environment & testing

- **macOS (this machine):** exercises probe-failure path, Draw flow,
  disabled pad tab, Retry. `bun run typecheck` and `bun run lint` must pass.
- **Windows PC (SigWeb drivers installed):** run `bun run dev` locally and
  test at `http://localhost:5173`. SigWeb only trusts localhost/HTTPS
  origins, so LAN access to the Vite server is out of scope.
- Pure modules (`strokes.ts`, the non-network parts of `sigwebClient.ts`)
  are structured for unit testing with `bun test`, though writing tests is
  scoped during implementation planning.

## Repository-rule compliance

- The vendored `SigWebTablet.js` lives in `public/vendor/` as a static
  asset. It is third-party, unmodified, and not part of the TypeScript
  source tree, so the "no new `.js` source files" rule is preserved. All
  first-party code is `.ts`/`.tsx`.
- Bun-only toolchain throughout (`bun install`, `bun run`, `bunx`).
