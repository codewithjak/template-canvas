'use strict';

/**
 * webhooks/ssrfGuard.js
 *
 * SSRF protection for outbound webhooks. The dispatcher POSTs to URLs that
 * users register, so a malicious/careless subscriber could otherwise point us
 * at internal targets (cloud metadata at 169.254.169.254, localhost, RFC-1918
 * ranges, …). Two layers:
 *
 *   assertPublicUrl(url)  — at REGISTRATION (subscribe/create): reject bad
 *                           schemes and literal private/reserved IP hosts up
 *                           front. (Hostnames are re-checked at delivery, since
 *                           DNS can change — TOCTOU / rebinding.)
 *
 *   guardedLookup         — at DELIVERY: a `lookup` hook for http/https that
 *                           resolves the host, drops any private/reserved
 *                           addresses, and connects ONLY to a validated public
 *                           IP. Using the resolved IP for the actual connection
 *                           closes the DNS-rebinding window.
 *
 * Escape hatch: set WEBHOOK_ALLOW_PRIVATE_TARGETS=true to disable the guard for
 * local development (e.g. delivering to a localhost receiver). Off by default.
 */

const net = require('net');
const dns = require('dns');
const { httpError } = require('../lib/apiAuth');

/** Dev-only bypass so localhost receivers can be tested. */
function allowPrivate() {
  return process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true';
}

// ── IPv4 ────────────────────────────────────────────────────────────────────────

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => acc * 256 + (parseInt(o, 10) & 255), 0);
}

function inV4Cidr(intIp, baseIp, bits) {
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (intIp & mask) === (ipv4ToInt(baseIp) & mask);
}

// Private, loopback, link-local, CGNAT, reserved, multicast, documentation, etc.
const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function isPublicV4(ip) {
  const n = ipv4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => inV4Cidr(n, base, bits));
}

// ── IPv6 ────────────────────────────────────────────────────────────────────────

/** Expand an IPv6 string (incl. embedded IPv4) to 16 bytes, or null if invalid. */
function v6ToBytes(input) {
  let s = String(input).split('%')[0].toLowerCase();

  // Fold a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const o = m[2].split('.').map(Number);
    if (o.length !== 4 || o.some((x) => Number.isNaN(x) || x > 255)) return null;
    const g1 = ((o[0] << 8) | o[1]).toString(16);
    const g2 = ((o[2] << 8) | o[3]).toString(16);
    s = m[1] + g1 + ':' + g2;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;

  let groups;
  if (tail === null) {
    groups = head;
  } else {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;

  const bytes = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push((v >> 8) & 255, v & 255);
  }
  return bytes;
}

function isPublicV6(ip) {
  const b = v6ToBytes(ip);
  if (!b) return false; // unparseable → treat as not public (fail safe)

  // IPv4-mapped (::ffff:x.x.x.x) → judge by the embedded IPv4.
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return isPublicV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  if (b.every((x) => x === 0)) return false;                       // :: unspecified
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return false; // ::1 loopback
  if (b[0] === 0xff) return false;                                  // ff00::/8 multicast
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return false;        // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return false;                         // fc00::/7 unique-local
  return true;
}

/** True if `ip` is a routable public address (v4 or v6). Non-IPs → false. */
function isPublicAddress(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return isPublicV4(ip);
  if (fam === 6) return isPublicV6(ip);
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a webhook target URL at registration. Throws httpError(400) on a
 * non-http(s) scheme or a literal private/reserved IP host. Hostnames pass here
 * and are re-validated at delivery via guardedLookup. Returns the parsed URL.
 */
function assertPublicUrl(urlString) {
  let u;
  try {
    u = new URL(String(urlString));
  } catch {
    throw httpError(400, '"url" must be a valid http(s) URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw httpError(400, '"url" must be a valid http(s) URL.');
  }
  if (allowPrivate()) return u;

  const host = u.hostname.replace(/^\[/, '').replace(/\]$/, ''); // strip IPv6 brackets
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw httpError(400, 'URL must point to a public address (private, loopback and link-local targets are blocked).');
  }
  return u;
}

/**
 * A `lookup` implementation for http/https that only resolves to public
 * addresses, so the connection is pinned to a validated IP (no rebinding).
 * Errors with code ESSRFBLOCKED when the host has no public address.
 */
function guardedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const usable = allowPrivate() ? addresses : addresses.filter((a) => isPublicAddress(a.address));
    if (usable.length === 0) {
      const e = new Error(`SSRF blocked: ${hostname} resolves only to private/reserved addresses`);
      e.code = 'ESSRFBLOCKED';
      return callback(e);
    }
    if (options && options.all) return callback(null, usable);
    return callback(null, usable[0].address, usable[0].family);
  });
}

module.exports = { assertPublicUrl, guardedLookup, isPublicAddress };
