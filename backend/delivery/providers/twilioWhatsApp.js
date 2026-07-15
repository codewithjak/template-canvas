'use strict';

/**
 * delivery/providers/twilioWhatsApp.js
 *
 * Twilio implementation of the WhatsApp sender interface (see whatsappSender.js).
 * One REST call to Twilio's Messages resource: form-encoded, HTTP Basic auth with
 * the account SID + auth token, delivering the export as a `MediaUrl` that the
 * WhatsApp servers fetch (the short-lived signed URL from mediaStore.signedUrlFor).
 *
 * The HTTP transport is injected so tests assert the request shape without a live
 * call. Nothing above this file imports Twilio — swapping providers is a new file.
 */

const https = require('https');

const API_HOST    = 'api.twilio.com';
const API_VERSION = '2010-04-01';

const ok = (status) => status >= 200 && status < 300;

/** Default HTTPS transport: form POST → { status, body }. */
function httpsTransport() {
  return {
    post(url, { headers, body }) {
      return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
          { method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
          },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    },
  };
}

/** WhatsApp channel address for an E.164 number (idempotent). */
function toWhatsAppAddress(e164) {
  return String(e164).startsWith('whatsapp:') ? String(e164) : `whatsapp:${e164}`;
}

/** HTTP Basic auth header from the account credentials. */
function basicAuth(accountSid, authToken) {
  return 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
}

/** Form-encode the Twilio message params. MediaUrl/Body added only when present. */
function encodeForm({ to, from, body, mediaUrl }) {
  const params = new URLSearchParams({
    To:   toWhatsAppAddress(to),
    From: toWhatsAppAddress(from),
  });
  if (body)     params.set('Body', body);
  if (mediaUrl) params.set('MediaUrl', mediaUrl);
  return params.toString();
}

/** Twilio's message SID on success; a descriptive Error otherwise. */
function parseResult(status, responseBody) {
  let parsed = {};
  try { parsed = JSON.parse(responseBody); } catch { /* non-JSON error body */ }
  if (ok(status) && parsed.sid) return { sid: parsed.sid };
  const detail = parsed.message || responseBody || 'unknown error';
  throw new Error(`Twilio WhatsApp send failed (${status}): ${detail}`);
}

/**
 * @param {object} cfg
 * @param {string} cfg.accountSid
 * @param {string} cfg.authToken
 * @param {string} cfg.from        E.164 WhatsApp sender, e.g. "+14155238886"
 * @param {object} [cfg.transport] injected for tests; defaults to real HTTPS
 */
function create(cfg) {
  const transport = cfg.transport || httpsTransport();
  const url = `https://${API_HOST}/${API_VERSION}/Accounts/${cfg.accountSid}/Messages.json`;

  async function send({ to, body, mediaUrl }) {
    const res = await transport.post(url, {
      headers: {
        'Authorization': basicAuth(cfg.accountSid, cfg.authToken),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: encodeForm({ to, from: cfg.from, body, mediaUrl }),
    });
    return parseResult(res.status, res.body);
  }

  return { send };
}

/** True when Twilio's credentials + sender are all present in the environment. */
function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM,
  );
}

/** Build the Twilio sender from environment configuration. */
function fromEnv() {
  if (!isConfigured()) {
    throw new Error('Twilio WhatsApp requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.');
  }
  return create({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken:  process.env.TWILIO_AUTH_TOKEN,
    from:       process.env.TWILIO_WHATSAPP_FROM,
  });
}

module.exports = { create, fromEnv, isConfigured, encodeForm, toWhatsAppAddress, parseResult };
