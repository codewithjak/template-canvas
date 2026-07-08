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
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
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

/** One-shot PUT of a file to a presigned URL (the source tarball → the user's own bucket). */
function putFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const size = fs.statSync(filePath).size;
    const req = lib.request(
      { method: 'PUT', hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, headers: { 'Content-Length': size } },
      (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve({ status: r.statusCode, body: b })); },
    );
    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

async function analyze(apiBase, key, dir) {
  const app = scanRepo(dir);
  console.log('Detected app understanding:\n' + JSON.stringify(app, null, 2));
  const res = await post(apiBase, '/v1/cloud/agent/analyze', key, { app });
  if (res.status >= 300) { console.error(`\nFailed (${res.status}): ${res.body}`); process.exit(1); }
  const out = JSON.parse(res.body);
  console.log(`\nCreated cloud template "${out.name}" (${out.templateId}).`);
  console.log('Open the builder, pick it from the Template bar, and review the proposed infra.');
}

/** Newest file mtime under a dir, skipping node_modules/.git (for --watch). */
function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      try { if (e.isDirectory()) walk(p); else newest = Math.max(newest, fs.statSync(p).mtimeMs); } catch { /* ignore */ }
    }
  };
  walk(dir);
  return newest;
}

async function deployOnce(apiBase, key, dir, deploymentId) {
  console.log('Packaging source…');
  const tarball = path.join(os.tmpdir(), `mapdoc-src-${Date.now()}.tar.gz`);
  execSync(`tar czf "${tarball}" --exclude=node_modules --exclude=.git -C "${dir}" .`);

  const prep = await post(apiBase, '/v1/cloud/deploy', key, { deploymentId });
  if (prep.status >= 300) { console.error(`\nPrepare failed (${prep.status}): ${prep.body}`); process.exit(1); }
  const p = JSON.parse(prep.body);
  if (p.simulated) { console.log(`\nDeploy simulated (no cloud configured). Target: ${p.targets.ecrRepo} → ${p.targets.ecsService}.`); return; }

  console.log('Uploading source to your account…');
  const up = await putFile(p.uploadUrl, tarball);
  if (up.status >= 300) { console.error(`\nUpload failed (${up.status})`); process.exit(1); }

  console.log('Building + deploying in your account (cloud runner)…');
  const run = await post(apiBase, `/v1/cloud/deploy/${p.deployRunId}/run`, key, {});
  if (run.status >= 300) { console.error(`\nRun failed (${run.status}): ${run.body}`); process.exit(1); }
  const t = p.targets;
  const what = t.kind === 'serverless' ? `updating Lambda ${t.lambdaFunction}`
    : t.kind === 'static' ? `building + syncing to ${t.bucket}`
      : `building ${t.ecrRepo} → rolling ${t.ecsService}`;
  console.log(`\nDeploy started (${p.deployRunId}): ${what}. Watch it in the builder.`);
}

async function deploy(apiBase, key, dir, deploymentId, watch) {
  if (!deploymentId) { console.error('Deploy needs --deployment <id> (from the deployments panel).'); process.exit(1); }
  await deployOnce(apiBase, key, dir, deploymentId);
  if (!watch) return;
  console.log('\nWatching for changes (ctrl-C to stop)…');
  let last = newestMtime(dir);
  setInterval(async () => {
    const m = newestMtime(dir);
    if (m <= last) return;
    last = m;
    console.log('\nChange detected — redeploying…');
    try { await deployOnce(apiBase, key, dir, deploymentId); } catch (e) { console.error(e.message); }
  }, 2000);
}

async function main() {
  const args = process.argv.slice(2);
  let apiBase = process.env.MAPDOC_API || 'http://localhost:8787';
  let deploymentId = null;
  let watch = false;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--api') { apiBase = args[i + 1]; i += 1; } else if (args[i] === '--deployment') { deploymentId = args[i + 1]; i += 1; } else if (args[i] === '--watch') { watch = true; } else positional.push(args[i]);
  }
  const cmd = positional[0] === 'deploy' ? 'deploy' : 'analyze';
  const dir = (cmd === 'deploy' ? positional[1] : positional[0]) || process.cwd();
  const key = process.env.MAPDOC_API_KEY;
  if (!key) { console.error('Set MAPDOC_API_KEY (your Mapdoc API key).'); process.exit(1); }

  if (cmd === 'deploy') await deploy(apiBase, key, dir, deploymentId, watch);
  else await analyze(apiBase, key, dir);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
