import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markFirstExport } from './firstExport'

interface StorageStub {
  localStorage: {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
  }
}

function installStorage(opts: { throws?: boolean } = {}): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: StorageStub }).window = {
    localStorage: {
      getItem: (k) => {
        if (opts.throws) throw new Error('storage disabled')
        return store.has(k) ? (store.get(k) as string) : null
      },
      setItem: (k, v) => {
        if (opts.throws) throw new Error('storage disabled')
        store.set(k, v)
      },
    },
  }
  return store
}

test('the first export is the first; every export after it is not', () => {
  installStorage()
  assert.equal(markFirstExport('user-a'), true, 'first')
  assert.equal(markFirstExport('user-a'), false, 'second')
  assert.equal(markFirstExport('user-a'), false, 'third')
})

test('scoped per user: a shared browser does not suppress the next account', () => {
  // §5 says "once per browser". That would have silently lost user-b's activation.
  installStorage()
  assert.equal(markFirstExport('user-a'), true)
  assert.equal(markFirstExport('user-b'), true, "user-b's first export is still their first")
})

test('storage unavailable → fails CLOSED (never reports a false first)', () => {
  // Returning true here would log "first export" on EVERY export from this
  // browser and destroy the metric. Under-count instead.
  installStorage({ throws: true })
  assert.equal(markFirstExport('user-a'), false)
  assert.equal(markFirstExport('user-a'), false)
})

test('records when it happened, so the row can be sanity-checked later', () => {
  const store = installStorage()
  markFirstExport('user-a')
  const stamp = store.get('mapdoc.firstExport.v1:user-a')
  assert.ok(stamp && !Number.isNaN(Date.parse(stamp)), 'an ISO timestamp')
})
