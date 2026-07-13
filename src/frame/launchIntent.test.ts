import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readLaunchIntent, toLaunchState } from './launchIntent'

test('round-trips an open-template intent', () => {
  const { state } = toLaunchState({ kind: 'open-template', templateId: 't1' })
  assert.deepEqual(readLaunchIntent(state), { kind: 'open-template', templateId: 't1' })
})

test('a plain /canvas visit (no state) yields no intent', () => {
  // The everyday case: the canvas must behave exactly as it does today.
  assert.equal(readLaunchIntent(null), null)
  assert.equal(readLaunchIntent(undefined), null)
  assert.equal(readLaunchIntent({}), null)
})

test('rejects malformed or foreign state instead of wedging the canvas', () => {
  assert.equal(readLaunchIntent({ launchIntent: 'open-template' }), null, 'string, not object')
  assert.equal(readLaunchIntent({ launchIntent: { kind: 'open-template' } }), null, 'no templateId')
  assert.equal(readLaunchIntent({ launchIntent: { kind: 'open-template', templateId: '' } }), null, 'empty id')
  assert.equal(readLaunchIntent({ launchIntent: { kind: 'open-template', templateId: 7 } }), null, 'id not a string')
  assert.equal(readLaunchIntent({ launchIntent: { kind: 'delete-everything' } }), null, 'unknown kind')
  assert.equal(readLaunchIntent({ somethingElse: 1 }), null, 'foreign state')
})
