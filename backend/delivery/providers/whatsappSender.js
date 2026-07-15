'use strict';

/**
 * delivery/providers/whatsappSender.js
 *
 * The WhatsApp sender SEAM. The delivery channel depends on THIS interface, never
 * on a vendor:
 *
 *   send({ to, body, mediaUrl }) -> Promise<{ sid }>
 *     to:       recipient E.164 number (validated upstream)
 *     body:     optional caption text
 *     mediaUrl: short-lived public URL of the export (mediaStore.signedUrlFor)
 *
 * fromEnv() selects the configured provider and returns a sender implementing that
 * interface. Twilio is the only implementation today; adding Meta Cloud API later
 * is a new provider file plus one entry in PROVIDERS — the orchestrator never
 * changes (Open/Closed).
 */

const twilio = require('./twilioWhatsApp');

const PROVIDERS = {
  twilio,
};

/** The configured provider name (defaults to Twilio). */
function providerName() {
  return (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();
}

/** True when the configured provider has its credentials. */
function isConfigured() {
  const provider = PROVIDERS[providerName()];
  return Boolean(provider && provider.isConfigured());
}

/** Build the configured provider's sender, or throw when unknown/unconfigured. */
function fromEnv() {
  const name = providerName();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown WhatsApp provider "${name}".`);
  return provider.fromEnv();
}

module.exports = { fromEnv, isConfigured, providerName };
