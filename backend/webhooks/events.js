'use strict';

/**
 * webhooks/events.js
 *
 * The catalogue of outbound webhook events: the single list of names every
 * surface validates against, plus a synthetic sample payload per event so a
 * connector (Zapier/Make/n8n) always has an example to show while a user builds
 * an automation — even before any real event has fired.
 *
 * Keep `sampleEvent` shaped exactly like what webhooks/dispatch.js actually
 * sends, so the example matches production.
 */

const KNOWN_EVENTS = ['document.generated', 'bulk.completed', 'bulk.failed'];

/** True when `event` is a recognised webhook event name. */
function isKnownEvent(event) {
  return KNOWN_EVENTS.includes(event);
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** A synthetic example payload for `event`, matching the dispatched shape. */
function sampleEvent(event) {
  const createdAt = new Date().toISOString();
  if (event === 'document.generated') {
    return {
      event:      'document.generated',
      teamId:     ZERO_UUID,
      templateId: ZERO_UUID,
      format:     'pdf',
      fileName:   'document.pdf',
      bytes:      12345,
      createdAt,
    };
  }
  if (event === 'bulk.completed') {
    return {
      event:       'bulk.completed',
      teamId:      ZERO_UUID,
      jobId:       ZERO_UUID,
      rows:        100,
      generated:   100,
      downloadUrl: 'https://example-bucket.s3.us-east-1.amazonaws.com/artifacts/JOB.zip?X-Amz-Signature=…',
      expiresAt:   new Date(Date.now() + 3600 * 1000).toISOString(),
      createdAt,
    };
  }
  if (event === 'bulk.failed') {
    return {
      event:     'bulk.failed',
      teamId:    ZERO_UUID,
      jobId:     ZERO_UUID,
      rows:      100,
      error:     'Example failure reason',
      createdAt,
    };
  }
  return { event };
}

module.exports = { KNOWN_EVENTS, isKnownEvent, sampleEvent };
