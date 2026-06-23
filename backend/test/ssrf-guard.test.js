'use strict';

/**
 * Tests for the webhook SSRF guard: IP classification, registration-time URL
 * validation, and the delivery-time lookup. All network-free — dns.lookup on IP
 * literals and "localhost" resolves without hitting the network.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { isPublicAddress, assertPublicUrl, guardedLookup } = require('../webhooks/ssrfGuard');

// ── IP classification ──────────────────────────────────────────────────────────

test('isPublicAddress flags public vs private/reserved IPv4', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1']) {
    assert.strictEqual(isPublicAddress(ip), true, `${ip} should be public`);
  }
  for (const ip of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '198.18.0.1', '255.255.255.255',
  ]) {
    assert.strictEqual(isPublicAddress(ip), false, `${ip} should be blocked`);
  }
});

test('isPublicAddress flags public vs private/reserved IPv6', () => {
  assert.strictEqual(isPublicAddress('2606:4700:4700::1111'), true); // public (Cloudflare)
  assert.strictEqual(isPublicAddress('::ffff:8.8.8.8'), true);        // mapped public v4
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1']) {
    assert.strictEqual(isPublicAddress(ip), false, `${ip} should be blocked`);
  }
});

test('isPublicAddress returns false for non-IP input', () => {
  assert.strictEqual(isPublicAddress('example.com'), false);
  assert.strictEqual(isPublicAddress('not-an-ip'), false);
});

// ── assertPublicUrl (registration) ──────────────────────────────────────────────

test('assertPublicUrl allows public hosts and public IP literals', () => {
  assert.doesNotThrow(() => assertPublicUrl('https://hooks.zapier.com/abc'));
  assert.doesNotThrow(() => assertPublicUrl('https://example.com/webhook'));
  assert.doesNotThrow(() => assertPublicUrl('http://8.8.8.8/h'));
});

test('assertPublicUrl rejects bad schemes', () => {
  for (const url of ['ftp://example.com', 'file:///etc/passwd', 'not a url', '']) {
    assert.throws(() => assertPublicUrl(url), /valid http/i, url);
  }
});

test('assertPublicUrl rejects literal private/reserved targets', () => {
  for (const url of [
    'http://127.0.0.1', 'http://localhost'.replace('localhost', '127.0.0.1'),
    'http://169.254.169.254/latest/meta-data/', 'http://10.1.2.3:8080/x',
    'http://192.168.0.5', 'http://[::1]:9000', 'https://[fd00::1]/x',
  ]) {
    assert.throws(() => assertPublicUrl(url), /public address/i, url);
  }
});

test('assertPublicUrl honours the WEBHOOK_ALLOW_PRIVATE_TARGETS bypass', () => {
  const saved = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
  try {
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
    assert.doesNotThrow(() => assertPublicUrl('http://127.0.0.1:3000/hook'));
  } finally {
    if (saved === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    else process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = saved;
  }
});

// ── guardedLookup (delivery) ──────────────────────────────────────────────────

const lookup = (host, opts) => new Promise((resolve, reject) =>
  guardedLookup(host, opts, (err, addr, fam) => (err ? reject(err) : resolve({ addr, fam }))));

test('guardedLookup resolves a public IP literal', async () => {
  const { addr } = await lookup('8.8.8.8', {});
  assert.strictEqual(addr, '8.8.8.8');
});

test('guardedLookup blocks loopback and link-local literals', async () => {
  await assert.rejects(() => lookup('127.0.0.1', {}), /SSRF blocked/);
  await assert.rejects(() => lookup('169.254.169.254', {}), /SSRF blocked/);
});

test('guardedLookup blocks localhost (resolves to loopback)', async () => {
  await assert.rejects(() => lookup('localhost', {}), /SSRF blocked/);
});
