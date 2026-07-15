'use strict';

/**
 * Tests for the WhatsApp provider seam and the Twilio implementation. The HTTP
 * transport is faked, so no live Twilio call is made; the tests assert the exact
 * request shape (URL, Basic auth, form body) and that the vendor stays behind the
 * whatsappSender interface.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const twilio = require('../delivery/providers/twilioWhatsApp');
const sender = require('../delivery/providers/whatsappSender');

const CFG = { accountSid: 'AC123', authToken: 'tok', from: '+14155238886' };

/** A transport that records the request and returns a scripted response. */
function fakeTransport(response) {
  const calls = { post: 0, url: null, options: null };
  return {
    calls,
    async post(url, options) {
      calls.post += 1;
      calls.url = url;
      calls.options = options;
      return response;
    },
  };
}

const created = (sid) => ({ status: 201, body: JSON.stringify({ sid }) });

// ── Twilio request shaping ──────────────────────────────────────────────────

test('send posts to the account Messages resource with Basic auth and form body', async () => {
  const t = fakeTransport(created('SM1'));
  const result = await twilio.create({ ...CFG, transport: t })
    .send({ to: '+14155550123', body: 'Your invoice', mediaUrl: 'https://x/y.pdf' });

  assert.strictEqual(result.sid, 'SM1');
  assert.strictEqual(t.calls.post, 1);
  assert.strictEqual(t.calls.url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
  assert.strictEqual(t.calls.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.strictEqual(
    t.calls.options.headers.Authorization,
    'Basic ' + Buffer.from('AC123:tok').toString('base64'),
  );

  const form = new URLSearchParams(t.calls.options.body);
  assert.strictEqual(form.get('To'),   'whatsapp:+14155550123');
  assert.strictEqual(form.get('From'), 'whatsapp:+14155238886');
  assert.strictEqual(form.get('Body'), 'Your invoice');
  assert.strictEqual(form.get('MediaUrl'), 'https://x/y.pdf');
});

test('encodeForm omits MediaUrl and Body when not provided', () => {
  const form = new URLSearchParams(twilio.encodeForm({ to: '+1', from: '+2' }));
  assert.strictEqual(form.get('To'),   'whatsapp:+1');
  assert.strictEqual(form.get('From'), 'whatsapp:+2');
  assert.strictEqual(form.has('Body'), false);
  assert.strictEqual(form.has('MediaUrl'), false);
});

test('toWhatsAppAddress is idempotent', () => {
  assert.strictEqual(twilio.toWhatsAppAddress('+1'), 'whatsapp:+1');
  assert.strictEqual(twilio.toWhatsAppAddress('whatsapp:+1'), 'whatsapp:+1');
});

test('send rejects with the Twilio error message on a non-2xx', async () => {
  const t = fakeTransport({ status: 400, body: JSON.stringify({ code: 63016, message: 'Outside the 24h window' }) });
  await assert.rejects(
    () => twilio.create({ ...CFG, transport: t }).send({ to: '+1', mediaUrl: 'https://x/y.pdf' }),
    /Twilio WhatsApp send failed \(400\): Outside the 24h window/,
  );
});

test('parseResult throws when a 2xx carries no sid', () => {
  assert.throws(() => twilio.parseResult(201, JSON.stringify({})), /send failed \(201\)/);
});

// ── Provider seam ───────────────────────────────────────────────────────────

test('providerName defaults to twilio', () => {
  const saved = process.env.WHATSAPP_PROVIDER;
  delete process.env.WHATSAPP_PROVIDER;
  try {
    assert.strictEqual(sender.providerName(), 'twilio');
  } finally {
    if (saved === undefined) delete process.env.WHATSAPP_PROVIDER; else process.env.WHATSAPP_PROVIDER = saved;
  }
});

test('fromEnv builds the Twilio sender when configured; isConfigured reflects env', () => {
  const saved = {
    p: process.env.WHATSAPP_PROVIDER,
    a: process.env.TWILIO_ACCOUNT_SID,
    t: process.env.TWILIO_AUTH_TOKEN,
    f: process.env.TWILIO_WHATSAPP_FROM,
  };
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  try {
    assert.strictEqual(sender.isConfigured(), false);
    assert.throws(() => sender.fromEnv(), /requires TWILIO_ACCOUNT_SID/);

    process.env.TWILIO_ACCOUNT_SID   = 'AC123';
    process.env.TWILIO_AUTH_TOKEN    = 'tok';
    process.env.TWILIO_WHATSAPP_FROM = '+14155238886';
    assert.strictEqual(sender.isConfigured(), true);
    assert.strictEqual(typeof sender.fromEnv().send, 'function');
  } finally {
    for (const [k, v] of [
      ['WHATSAPP_PROVIDER', saved.p], ['TWILIO_ACCOUNT_SID', saved.a],
      ['TWILIO_AUTH_TOKEN', saved.t], ['TWILIO_WHATSAPP_FROM', saved.f],
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('fromEnv rejects an unknown provider', () => {
  const saved = process.env.WHATSAPP_PROVIDER;
  process.env.WHATSAPP_PROVIDER = 'carrier-pigeon';
  try {
    assert.throws(() => sender.fromEnv(), /Unknown WhatsApp provider "carrier-pigeon"/);
  } finally {
    if (saved === undefined) delete process.env.WHATSAPP_PROVIDER; else process.env.WHATSAPP_PROVIDER = saved;
  }
});
