'use strict';

/**
 * Tests for the S3 store's logic — keying, the resilient upload (retry +
 * "found ⇒ done" existence check), and presigned download targets. The HTTP
 * transport is faked, so no AWS is touched; presigning uses the real signer.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { createS3Store, fromEnv } = require('../storage/s3Store');

const CREDS = { accessKeyId: 'AK', secretAccessKey: 'sk' };

/** A transport whose upload/head outcomes are scripted per call. */
function fakeTransport({ uploads, headStatus }) {
  const calls = { upload: 0, head: 0 };
  return {
    calls,
    async upload() {
      const outcome = uploads[calls.upload] ?? uploads[uploads.length - 1];
      calls.upload += 1;
      if (outcome instanceof Error) throw outcome;
      return { status: outcome };
    },
    async head() {
      calls.head += 1;
      return { status: typeof headStatus === 'function' ? headStatus(calls.head) : headStatus };
    },
  };
}

function store(transport) {
  return createS3Store({ region: 'us-east-1', bucket: 'b', prefix: 'artifacts', credentials: CREDS, transport });
}

test('keyFor places objects under the prefix', () => {
  assert.strictEqual(store(fakeTransport({ uploads: [200] })).keyFor('job-1'), 'artifacts/job-1.zip');
});

test('put succeeds on a 2xx without a HEAD check', async () => {
  const t = fakeTransport({ uploads: [200], headStatus: 404 });
  await store(t).put('job-1', { filePath: '/tmp/x.zip', contentType: 'application/zip' });
  assert.strictEqual(t.calls.upload, 1);
  assert.strictEqual(t.calls.head, 0, 'no existence check needed on success');
});

test('put treats an object that landed despite an error as success (found ⇒ done)', async () => {
  // Upload "fails" (500), but HEAD says the object is there → no retry.
  const t = fakeTransport({ uploads: [500, 200], headStatus: 200 });
  await store(t).put('job-1', { filePath: '/tmp/x.zip' });
  assert.strictEqual(t.calls.upload, 1, 'must not re-upload once found');
  assert.strictEqual(t.calls.head, 1);
});

test('put retries when the object is not found, then succeeds', async () => {
  const t = fakeTransport({ uploads: [new Error('network'), 200], headStatus: 404 });
  await store(t).put('job-1', { filePath: '/tmp/x.zip' });
  assert.strictEqual(t.calls.upload, 2, 'retried after not-found');
  assert.strictEqual(t.calls.head, 1);
});

test('put throws after exhausting all attempts', async () => {
  const t = fakeTransport({ uploads: [500, 500, 500], headStatus: 404 });
  await assert.rejects(
    () => store(t).put('job-1', { filePath: '/tmp/x.zip' }),
    /S3 upload failed for artifacts\/job-1\.zip after 3 attempts/,
  );
  assert.strictEqual(t.calls.upload, 3);
});

test('downloadTarget returns a presigned URL and matching expiry', async () => {
  const before = Date.now();
  const { url, expiresAt } = await store(fakeTransport({ uploads: [200] }))
    .downloadTarget('job-1', { fileName: 'docs.zip', expiresInMs: 3600 * 1000 });

  const u = new URL(url);
  assert.strictEqual(u.hostname, 'b.s3.us-east-1.amazonaws.com');
  assert.strictEqual(u.pathname, '/artifacts/job-1.zip');
  assert.strictEqual(u.searchParams.get('X-Amz-Expires'), '3600');
  assert.ok(u.searchParams.get('X-Amz-Signature'), 'signed');
  assert.match(u.searchParams.get('response-content-disposition'), /filename="docs\.zip"/);

  const ms = new Date(expiresAt).getTime();
  assert.ok(ms >= before + 3600 * 1000 && ms <= Date.now() + 3600 * 1000 + 2000, 'expiresAt ~ now + ttl');
});

test('fromEnv requires region + bucket', () => {
  const saved = { r: process.env.AWS_REGION, b: process.env.S3_ARTIFACT_BUCKET };
  delete process.env.AWS_REGION;
  delete process.env.S3_ARTIFACT_BUCKET;
  try {
    assert.throws(() => fromEnv(), /requires AWS_REGION and S3_ARTIFACT_BUCKET/);

    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_ARTIFACT_BUCKET = 'b';
    const s = fromEnv();
    assert.strictEqual(s.isRemote, true);
    assert.strictEqual(s.keyFor('j'), 'artifacts/j.zip');
  } finally {
    if (saved.r === undefined) delete process.env.AWS_REGION; else process.env.AWS_REGION = saved.r;
    if (saved.b === undefined) delete process.env.S3_ARTIFACT_BUCKET; else process.env.S3_ARTIFACT_BUCKET = saved.b;
  }
});
