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
