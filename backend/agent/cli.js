#!/usr/bin/env node
'use strict';

/**
 * backend/agent/cli.js — minimal Mapdoc local agent (Phase 1).
 *
 * Scans a repo and sends its SANITIZED app understanding to Mapdoc, which infers a
 * reviewable cloud template. It talks ONLY to Mapdoc (no cloud access, no secrets,
 * source stays local). The proposed infra appears in the builder's template picker
 * for the user to review and apply.
 *
 * Usage:
 *   MAPDOC_API_KEY=tc_live_... node backend/agent/cli.js [repoDir] [--api https://app.map-doc.com]
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { scanRepo } = require('./repoScan');

function post(apiBase, apiPath, key, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(apiBase + apiPath);
    const lib = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(
      {
        method: 'POST', hostname: u.hostname, port: u.port || undefined, path: u.pathname,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key, 'Content-Length': Buffer.byteLength(data) },
      },
      (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve({ status: r.statusCode, body: b })); },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  let apiBase = process.env.MAPDOC_API || 'http://localhost:8787';
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--api') { apiBase = args[i + 1]; i += 1; } else positional.push(args[i]);
  }
  const dir = positional[0] || process.cwd();
  const key = process.env.MAPDOC_API_KEY;
  if (!key) { console.error('Set MAPDOC_API_KEY (your Mapdoc API key).'); process.exit(1); }

  const app = scanRepo(dir);
  console.log('Detected app understanding:\n' + JSON.stringify(app, null, 2));

  const res = await post(apiBase, '/v1/cloud/agent/analyze', key, { app });
  if (res.status >= 300) { console.error(`\nFailed (${res.status}): ${res.body}`); process.exit(1); }
  const out = JSON.parse(res.body);
  console.log(`\nCreated cloud template "${out.name}" (${out.templateId}).`);
  console.log('Open the builder, pick it from the Template bar, and review the proposed infra.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
