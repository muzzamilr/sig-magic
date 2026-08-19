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
