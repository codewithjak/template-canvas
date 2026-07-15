'use strict';

/**
 * delivery/whatsappDelivery.js
 *
 * The WhatsApp channel for export delivery. WhatsApp cannot take a file buffer —
 * its servers fetch the media from a URL. So this channel:
 *   1. stores the artifact as an opaque KEY (mediaStore.putArtifact),
 *   2. mints a short-lived signed URL only for this send (mediaStore.signedUrlFor),
 *   3. hands that URL to the provider-agnostic sender (whatsappSender interface).
 *
 * The `mediaStore` and `sender` are injected, so the flow is testable without S3
 * or Twilio. Small functions only: shape the caption, then store → sign → send.
 */

const DEFAULT_MEDIA_TTL_MS = 5 * 60 * 1000; // signed URL lifetime; far under the 24h window

/** The caption text sent alongside the media. */
function buildBody({ message }) {
  return message || 'Please find your document attached.';
}

/**
 * Store the artifact, mint a short-lived URL, send it via WhatsApp.
 *
 * @param {object}   p
 * @param {{buffer:Buffer,fileName:string,contentType:string}} p.artifact
 * @param {{to:string,message?:string}} p.whatsapp
 * @param {{send:(m:object)=>Promise<{sid:string}>}} p.sender
 * @param {{putArtifact:Function,signedUrlFor:Function}} p.mediaStore
 * @param {number}   [p.ttlMs]
 * @returns {Promise<{sid:string}>}
 */
async function deliverByWhatsApp({ artifact, whatsapp, sender, mediaStore, ttlMs = DEFAULT_MEDIA_TTL_MS }) {
  const { key } = await mediaStore.putArtifact(artifact);
  const { url } = mediaStore.signedUrlFor(key, { expiresInMs: ttlMs });
  return sender.send({
    to:       whatsapp.to,
    body:     buildBody({ message: whatsapp.message }),
    mediaUrl: url,
  });
}

module.exports = { deliverByWhatsApp, buildBody };
