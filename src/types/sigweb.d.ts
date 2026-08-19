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
