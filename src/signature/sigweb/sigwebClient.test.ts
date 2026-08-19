import { describe, expect, test } from 'bun:test'
import { probeSigWeb } from './sigwebClient'

describe('probeSigWeb', () => {
  test('resolves true when the service responds ok', async () => {
    const fakeFetch = (async () => new Response('1', { status: 200 })) as unknown as typeof fetch
    expect(await probeSigWeb(1500, fakeFetch)).toBe(true)
  })

  test('resolves false when the connection is refused', async () => {
    const fakeFetch = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await probeSigWeb(1500, fakeFetch)).toBe(false)
  })

  test('resolves false when the service responds non-ok', async () => {
    const fakeFetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect(await probeSigWeb(1500, fakeFetch)).toBe(false)
  })

  test('aborts and resolves false after the timeout', async () => {
    const hangingFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const started = performance.now()
    expect(await probeSigWeb(50, hangingFetch)).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
