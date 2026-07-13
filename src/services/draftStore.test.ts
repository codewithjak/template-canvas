import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { TemplateDocument } from '../types/canvas'
import { saveDraft, restoreDraft, clearDraft } from './draftStore'

// ── localStorage stub (node has no window) ──────────────────────────────────
interface StorageStub {
  localStorage: {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
    removeItem(k: string): void
  }
}
function installStorage(opts: { quota?: boolean } = {}): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: StorageStub }).window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k, v) => {
        if (opts.quota) {
          const e = new Error('quota') as Error & { name: string }
          e.name = 'QuotaExceededError'
          throw e
        }
        store.set(k, v)
      },
      removeItem: (k) => void store.delete(k),
    },
  }
  return store
}

const doc = (id = 't1'): TemplateDocument =>
  ({
    version: '2.0',
    meta: { templateId: id, name: 'Test', createdAt: 'x', updatedAt: 'x' },
    pages: [{ pageId: 'p1', label: 'P', repeatHeader: false, headerElementIds: [], elements: [], header: {}, footer: {} }],
    ai: null,
  }) as unknown as TemplateDocument

test('round-trips a draft and returns its savedAt + teamId', () => {
  installStorage()
  saveDraft(doc('t1'), 'user-a', 'team-a')
  const r = restoreDraft('user-a')
  assert.equal(r?.doc.meta.templateId, 't1')
  assert.equal(typeof r?.savedAt, 'string')
  assert.equal(r?.teamId, 'team-a', 'teamId round-trips so the card can compare it to the active team')
})

test('teamId is null when the draft was written without a team', () => {
  installStorage()
  saveDraft(doc(), 'user-a', null)
  assert.equal(restoreDraft('user-a')?.teamId, null)
})

test('draft is user-scoped: another user (and anon) cannot read it', () => {
  installStorage()
  saveDraft(doc(), 'user-a', 'team-a')
  assert.equal(restoreDraft('user-b'), null)
  assert.equal(restoreDraft(null), null)
})

test('clearDraft removes the draft', () => {
  installStorage()
  saveDraft(doc(), 'user-a', 'team-a')
  clearDraft('user-a')
  assert.equal(restoreDraft('user-a'), null)
})

test('over-quota save skips AND deletes any stale draft', () => {
  const store = installStorage()
  saveDraft(doc(), 'user-a', 'team-a') // succeeds
  ;(globalThis as unknown as { window: StorageStub }).window.localStorage.setItem = () => {
    const e = new Error('quota') as Error & { name: string }
    e.name = 'QuotaExceededError'
    throw e
  }
  saveDraft(doc(), 'user-a', 'team-a') // must not throw
  assert.equal(restoreDraft('user-a'), null, 'stale draft deleted, not left behind')
  assert.ok(!store.has('mapdoc.canvas.draft.v1:user-a'))
})

test('rejects corrupt/foreign payloads (meta:null, missing elements, bad JSON)', () => {
  const store = installStorage()
  const key = 'mapdoc.canvas.draft.v1:user-a'

  store.set(key, JSON.stringify({ savedAt: 'x', doc: { version: '2.0', meta: null, pages: [] } }))
  assert.equal(restoreDraft('user-a'), null, 'meta:null rejected')
  assert.ok(!store.has(key), 'and the bad entry is cleared')

  store.set(key, JSON.stringify({ savedAt: 'x', doc: { version: '2.0', meta: {}, pages: [{ pageId: 'p1' }] } }))
  assert.equal(restoreDraft('user-a'), null, 'page without elements[] rejected')

  store.set(key, '{ not json')
  assert.equal(restoreDraft('user-a'), null, 'corrupt JSON rejected')
})
