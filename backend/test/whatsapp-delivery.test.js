'use strict';

/**
 * Tests for the WhatsApp delivery channel and its request validation. The media
 * store and sender are injected, so the store→sign→send flow is exercised without
 * S3 or Twilio. Validation is checked through the orchestrator's public surface.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { deliverByWhatsApp, buildBody } = require('../delivery/whatsappDelivery');
const { validateDelivery, validateWhatsApp } = require('../delivery');

const ARTIFACT = { buffer: Buffer.from('PDF'), fileName: 'invoice.pdf', contentType: 'application/pdf' };

/** A media store that records what it was asked to store/sign. */
function fakeMediaStore() {
  const calls = { put: 0, sign: 0, signedKey: null, signedTtl: null };
  return {
    calls,
    async putArtifact(artifact) {
      calls.put += 1;
      calls.storedArtifact = artifact;
      return { key: 'whatsapp-media/k.pdf', contentType: artifact.contentType };
    },
    signedUrlFor(key, opts) {
      calls.sign += 1;
      calls.signedKey = key;
      calls.signedTtl = opts.expiresInMs;
      return { url: 'https://signed/k.pdf', expiresAt: 'later' };
    },
  };
}

/** A sender that records the message and returns a sid. */
function fakeSender() {
  const calls = { send: 0, message: null };
  return {
    calls,
    async send(message) { calls.send += 1; calls.message = message; return { sid: 'SM9' }; },
  };
}

// ── Channel flow ────────────────────────────────────────────────────────────

test('deliverByWhatsApp stores the artifact, mints a URL for the key, and sends it', async () => {
  const mediaStore = fakeMediaStore();
  const sender = fakeSender();

  const result = await deliverByWhatsApp({
    artifact: ARTIFACT,
    whatsapp: { to: '+14155550123', message: 'Your invoice' },
    sender,
    mediaStore,
  });

  assert.deepStrictEqual(result, { sid: 'SM9' });
  assert.strictEqual(mediaStore.calls.put, 1);
  assert.strictEqual(mediaStore.calls.signedKey, 'whatsapp-media/k.pdf', 'signs the stored key');
  assert.strictEqual(sender.calls.message.to, '+14155550123');
  assert.strictEqual(sender.calls.message.body, 'Your invoice');
  assert.strictEqual(sender.calls.message.mediaUrl, 'https://signed/k.pdf', 'sends the minted URL, not a buffer');
});

test('buildBody falls back to a default caption when no message is given', () => {
  assert.strictEqual(buildBody({}), 'Please find your document attached.');
  assert.strictEqual(buildBody({ message: 'hi' }), 'hi');
});

// ── Validation ──────────────────────────────────────────────────────────────

test('validateWhatsApp requires an E.164 number and bounds the message', () => {
  assert.strictEqual(validateWhatsApp({ to: '+14155550123' }), null);
  assert.match(validateWhatsApp({}), /number is required/);
  assert.match(validateWhatsApp({ to: '14155550123' }), /E\.164/);
  assert.match(validateWhatsApp({ to: '+0155550123' }), /E\.164/);
  assert.match(validateWhatsApp({ to: '+14155550123', message: 'x'.repeat(1025) }), /too long/);
});

test('validateDelivery accepts a WhatsApp-only request', () => {
  assert.strictEqual(validateDelivery({ whatsapp: { to: '+14155550123' } }), null);
});

test('validateDelivery still accepts an email-only request', () => {
  assert.strictEqual(validateDelivery({ email: { to: 'a@b.com' } }), null);
});

test('validateDelivery rejects a request with no target', () => {
  assert.match(validateDelivery({}), /No delivery target/);
});

test('validateDelivery surfaces a bad WhatsApp number', () => {
  assert.match(validateDelivery({ whatsapp: { to: 'nope' } }), /E\.164/);
});
