'use strict';

/**
 * Tests for the SigV4 presigner. The headline test reproduces AWS's documented
 * known-answer vector for a presigned GET (from the "Signature Version 4"
 * reference), which gives high confidence the canonical request, string-to-sign
 * and signing key are all correct.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { presignUrl } = require('../storage/s3SigV4');

const sigOf = (url) => new URL(url).searchParams.get('X-Amz-Signature');

test('reproduces the AWS documented presigned-GET vector', () => {
  const url = presignUrl({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    region: 'us-east-1',
    key: 'test.txt',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    expiresIn: 86400,
    date: '2013-05-24T00:00:00Z',
  });
  assert.strictEqual(sigOf(url), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

test('embeds the expected query parameters', () => {
  const url = presignUrl({
    method: 'GET', host: 'b.s3.us-east-1.amazonaws.com', region: 'us-east-1',
    key: 'artifacts/job.zip', accessKeyId: 'AK', secretAccessKey: 'sk',
    expiresIn: 3600, date: '2026-01-01T00:00:00Z',
  });
  const q = new URL(url).searchParams;
  assert.strictEqual(q.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.strictEqual(q.get('X-Amz-Expires'), '3600');
  assert.strictEqual(q.get('X-Amz-SignedHeaders'), 'host');
  assert.match(q.get('X-Amz-Credential'), /^AK\/20260101\/us-east-1\/s3\/aws4_request$/);
  assert.ok(url.startsWith('https://b.s3.us-east-1.amazonaws.com/artifacts/job.zip?'));
});

test('a session token adds X-Amz-Security-Token and changes the signature', () => {
  const base = { method: 'GET', host: 'b.s3.us-east-1.amazonaws.com', region: 'us-east-1',
    key: 'k', accessKeyId: 'AK', secretAccessKey: 'sk', expiresIn: 60, date: '2026-01-01T00:00:00Z' };
  const plain = presignUrl(base);
  const temp  = presignUrl({ ...base, sessionToken: 'TOKEN123' });
  assert.strictEqual(new URL(plain).searchParams.get('X-Amz-Security-Token'), null);
  assert.strictEqual(new URL(temp).searchParams.get('X-Amz-Security-Token'), 'TOKEN123');
  assert.notStrictEqual(sigOf(plain), sigOf(temp));
});

test('response-content-disposition is signed into the URL', () => {
  const url = presignUrl({
    method: 'GET', host: 'b.s3.us-east-1.amazonaws.com', region: 'us-east-1',
    key: 'k', accessKeyId: 'AK', secretAccessKey: 'sk', expiresIn: 60,
    query: { 'response-content-disposition': 'attachment; filename="out.zip"' },
  });
  assert.strictEqual(
    new URL(url).searchParams.get('response-content-disposition'),
    'attachment; filename="out.zip"',
  );
});
