'use strict';

/**
 * Tests for the delivery media store — keying, buffer upload, and the on-demand
 * short-lived signed GET. The HTTP transport is faked, so no AWS is touched;
 * presigning uses the real signer. The key assertion of A1 (see the arch doc):
 * putArtifact returns a KEY and never a URL; the URL is minted separately.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { createMediaStore, fromEnv, extensionFor } = require('../delivery/mediaStore');

const CREDS = { accessKeyId: 'AK', secretAccessKey: 'sk' };

/** A transport whose upload outcome is scripted. */
function fakeTransport({ status = 200 } = {}) {
  const calls = { upload: 0, lastContentType: null, lastBuffer: null };
  return {
    calls,
    async upload(_url, buffer, contentType) {
      calls.upload += 1;
      calls.lastContentType = contentType;
      calls.lastBuffer = buffer;
      return { status };
    },
  };
}

function store(transport) {
  return createMediaStore({ region: 'us-east-1', bucket: 'b', prefix: 'whatsapp-media', credentials: CREDS, transport });
}

function artifact(overrides = {}) {
  return { buffer: Buffer.from('PDF'), fileName: 'invoice.pdf', contentType: 'application/pdf', ...overrides };
}

test('extensionFor prefers the filename, falls back to content type', () => {
  assert.strictEqual(extensionFor({ fileName: 'a.PNG' }), '.png');
  assert.strictEqual(extensionFor({ contentType: 'application/pdf' }), '.pdf');
  assert.strictEqual(extensionFor({ contentType: 'image/jpeg' }), '.jpg');
  assert.strictEqual(extensionFor({}), '');
});

test('newKey places an unguessable object under the prefix with the right extension', () => {
  const key = store(fakeTransport()).newKey(artifact());
  assert.match(key, /^whatsapp-media\/[0-9a-f-]{36}\.pdf$/);
});

test('putArtifact uploads the buffer with its content type and returns a KEY, not a URL', async () => {
  const t = fakeTransport({ status: 200 });
  const result = await store(t).putArtifact(artifact());

  assert.strictEqual(t.calls.upload, 1);
  assert.strictEqual(t.calls.lastContentType, 'application/pdf');
  assert.deepStrictEqual(t.calls.lastBuffer, Buffer.from('PDF'));

  assert.match(result.key, /^whatsapp-media\/[0-9a-f-]{36}\.pdf$/);
  assert.strictEqual(result.contentType, 'application/pdf');
  assert.ok(!('url' in result), 'putArtifact must never return a URL');
});

test('putArtifact throws on a non-2xx upload', async () => {
  await assert.rejects(
    () => store(fakeTransport({ status: 403 })).putArtifact(artifact()),
    /Media upload failed for whatsapp-media\/.* \(status 403\)\./,
  );
});

test('signedUrlFor mints a short-lived presigned GET for the given key', async () => {
  const before = Date.now();
  const { url, expiresAt } = store(fakeTransport()).signedUrlFor('whatsapp-media/abc.pdf', { expiresInMs: 5 * 60 * 1000 });

  const u = new URL(url);
  assert.strictEqual(u.hostname, 'b.s3.us-east-1.amazonaws.com');
  assert.strictEqual(u.pathname, '/whatsapp-media/abc.pdf');
  assert.strictEqual(u.searchParams.get('X-Amz-Expires'), '300');
  assert.ok(u.searchParams.get('X-Amz-Signature'), 'signed');

  const ms = new Date(expiresAt).getTime();
  assert.ok(ms >= before + 5 * 60 * 1000 && ms <= Date.now() + 5 * 60 * 1000 + 2000, 'expiresAt ~ now + ttl');
});

test('signedUrlFor defaults to a short (~5 min) TTL, well under the 24h session window', () => {
  const { url } = store(fakeTransport()).signedUrlFor('whatsapp-media/abc.pdf');
  assert.strictEqual(new URL(url).searchParams.get('X-Amz-Expires'), '300');
});

test('fromEnv requires region + bucket', () => {
  const saved = { r: process.env.AWS_REGION, b: process.env.S3_MEDIA_BUCKET };
  delete process.env.AWS_REGION;
  delete process.env.S3_MEDIA_BUCKET;
  try {
    assert.throws(() => fromEnv(), /requires AWS_REGION and S3_MEDIA_BUCKET/);

    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_MEDIA_BUCKET = 'b';
    const s = fromEnv();
    assert.strictEqual(s.isRemote, true);
    assert.match(s.newKey({ contentType: 'application/pdf' }), /^whatsapp-media\/[0-9a-f-]{36}\.pdf$/);
  } finally {
    if (saved.r === undefined) delete process.env.AWS_REGION; else process.env.AWS_REGION = saved.r;
    if (saved.b === undefined) delete process.env.S3_MEDIA_BUCKET; else process.env.S3_MEDIA_BUCKET = saved.b;
  }
});
