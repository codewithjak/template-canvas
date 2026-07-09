#!/usr/bin/env node
'use strict';

/**
 * backend/agent/cli.js — Mapdoc local agent.
 *
 * `analyze` scans a repo and sends its SANITIZED app understanding to Mapdoc, which
 * infers a reviewable cloud template. Analyze sends keys-only (never secret values).
 *
 * `deploy` ships the workload, with a chosen target (CLOUD_LOCAL_AGENT_ARCHITECTURE.md §7):
 *   --mode source  (default) upload source → the in-account runner builds it. No Docker,
 *                   no cloud creds. Your source (minus secrets/ignored files) goes to
 *                   YOUR OWN account bucket for the build.
 *   --mode image   build the image locally + push with a short-lived scoped credential.
 *                   Source never leaves the machine; only the built image reaches ECR.
 *   --mode push    push an EXISTING image (--image ref) with the scoped credential.
 *
 * Usage:
 *   MAPDOC_API_KEY=tc_live_... node backend/agent/cli.js analyze [repoDir]
 *   MAPDOC_API_KEY=... node backend/agent/cli.js deploy [repoDir] --deployment <id> [--mode source|image|push] [--image <ref>] [--watch]
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

// Never ship credentials/secrets into a build context or an upload — this hard
// denylist is the security guarantee and is applied unconditionally. The repo's
// .gitignore/.dockerignore are ALSO honored (best-effort, for cleanliness), but
// they only affect non-secret files; secrets are covered here regardless.
const SECRET_EXCLUDES = [
  'node_modules', '.git', '.env', '.env.*', '.aws', '.ssh', '.npmrc',
  '*.pem', '*.key', 'id_rsa', 'id_ed25519', '.terraform', '*.tfstate',
];
/**
 * Read .gitignore/.dockerignore into tar --exclude patterns. We normalize in
 * Node rather than using tar's --exclude-from, because tar treats a raw
 * trailing-slash directory line (`dist/`, the MOST common ignore form) as a
 * literal and silently fails to exclude it. Stripping the trailing/leading slash
 * makes `dist` match at any depth. Comments/blanks/negations are skipped (we only
 * ADD excludes; over-excluding a non-secret file is the safe direction).
 */
function ignorePatterns(dir) {
  const out = [];
  for (const f of ['.gitignore', '.dockerignore']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    for (let line of fs.readFileSync(p, 'utf8').split('\n')) {
      line = line.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;
      out.push(line.replace(/\/+$/, '').replace(/^\/+/, ''));
    }
  }
  return out;
}

function tarSource(dir) {
  const tarball = path.join(os.tmpdir(), `mapdoc-src-${Date.now()}.tar.gz`);
  // The denylist is the security guarantee; the ignore patterns are cleanliness.
  const excludes = [...SECRET_EXCLUDES, ...ignorePatterns(dir)]
    .map((e) => `--exclude='${e.replace(/'/g, "'\\''")}'`)
    .join(' ');
  try {
    execSync(`tar czf "${tarball}" ${excludes} -C "${dir}" .`, { cwd: dir });
  } catch (e) {
    fs.rmSync(tarball, { force: true }); // don't leave a partial archive on tar failure
    throw e;
  }
  return tarball;
}

/** Path 2 (default): upload source; the in-account runner builds + deploys it. */
async function deploySource(apiBase, key, dir, deploymentId) {
  console.log('Packaging source (secrets + ignored files excluded)…');
  const tarball = tarSource(dir);
  try {
    await deploySourceUpload(apiBase, key, deploymentId, tarball);
  } finally {
    // Never leave source sitting in /tmp (matters especially under --watch).
    fs.rmSync(tarball, { force: true });
  }
}

async function deploySourceUpload(apiBase, key, deploymentId, tarball) {
  // Throw (don't process.exit) so the caller's finally cleans up the tarball and
  // --watch survives transient errors; main().catch prints + exits 1.
  const prep = await post(apiBase, '/v1/cloud/deploy', key, { deploymentId });
  if (prep.status >= 300) throw new Error(`Prepare failed (${prep.status}): ${prep.body}`);
  const p = JSON.parse(prep.body);
  if (p.simulated) { console.log(`\nDeploy simulated (no cloud configured). Target: ${JSON.stringify(p.targets)}.`); return; }

  console.log('Uploading source to your account…');
  const up = await putFile(p.uploadUrl, tarball);
  if (up.status >= 300) throw new Error(`Upload failed (${up.status})`);

  console.log('Building + deploying in your account (cloud runner)…');
  const run = await post(apiBase, `/v1/cloud/deploy/${p.deployRunId}/run`, key, {});
  if (run.status >= 300) throw new Error(`Run failed (${run.status}): ${run.body}`);
  const t = p.targets;
  const what = t.kind === 'serverless' ? `updating Lambda ${t.lambdaFunction}`
    : t.kind === 'static' ? `building + syncing to ${t.bucket}`
      : `building ${t.ecrRepo} → rolling ${t.ecsService}`;
  console.log(`\nDeploy started (${p.deployRunId}): ${what}. Watch it in the builder.`);
}

/** Path 1: build/push the image locally with a short-lived scoped credential.
 *  `imageRef` set ⇒ push that existing image instead of building (BYO image). */
async function deployImage(apiBase, key, dir, deploymentId, imageRef) {
  const cr = await post(apiBase, `/v1/cloud/deploy/${deploymentId}/credentials`, key, {});
  if (cr.status >= 300) throw new Error(`Could not get deploy credentials (${cr.status}): ${cr.body}`);
  const { credentials, registry, region, targets } = JSON.parse(cr.body);
  const tag = `${registry}/${targets.ecrRepo}:latest`;
  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_REGION: region,
  };
  const sh = (cmd) => execSync(cmd, { stdio: 'inherit', env, cwd: dir });

  console.log('Logging in to ECR (scoped, expires shortly)…');
  sh(`aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry}`);

  if (imageRef) {
    console.log(`Tagging + pushing existing image ${imageRef}…`);
    sh(`docker tag ${imageRef} ${tag}`);
  } else {
    console.log('Building image locally (source stays on this machine)…');
    sh(`docker build -t ${tag} "${dir}"`);
  }
  sh(`docker push ${tag}`);

  console.log('Rolling the ECS service…');
  sh(`aws ecs describe-task-definition --task-definition ${targets.ecsService} --query taskDefinition > /tmp/td.json`);
  sh(`jq --arg IMG "${tag}" '.containerDefinitions[0].image=$IMG | {family,networkMode,requiresCompatibilities,cpu,memory,executionRoleArn,containerDefinitions}' /tmp/td.json > /tmp/newtd.json`);
  sh(`TASKDEF=$(aws ecs register-task-definition --cli-input-json file:///tmp/newtd.json --query taskDefinition.taskDefinitionArn --output text) && aws ecs update-service --cluster ${targets.ecsCluster} --service ${targets.ecsService} --task-definition "$TASKDEF" --force-new-deployment`);
  console.log(`\nDeployed ${tag} → ${targets.ecsService}. Watch it in the builder.`);
}

async function deployOnce(apiBase, key, dir, deploymentId, mode, imageRef) {
  if (mode === 'image' || mode === 'push') return deployImage(apiBase, key, dir, deploymentId, mode === 'push' ? imageRef : null);
  return deploySource(apiBase, key, dir, deploymentId);
}

async function deploy(apiBase, key, dir, deploymentId, opts) {
  if (!deploymentId) { console.error('Deploy needs --deployment <id> (from the deployments panel).'); process.exit(1); }
  if (opts.mode === 'push' && !opts.image) { console.error('--mode push needs --image <ref>.'); process.exit(1); }
  await deployOnce(apiBase, key, dir, deploymentId, opts.mode, opts.image);
  if (!opts.watch) return;
  console.log('\nWatching for changes (ctrl-C to stop)…');
  let last = newestMtime(dir);
  setInterval(async () => {
    const m = newestMtime(dir);
    if (m <= last) return;
    last = m;
    console.log('\nChange detected — redeploying…');
    try { await deployOnce(apiBase, key, dir, deploymentId, opts.mode, opts.image); } catch (e) { console.error(e.message); }
  }, 2000);
}

async function main() {
  const args = process.argv.slice(2);
  let apiBase = process.env.MAPDOC_API || 'http://localhost:8787';
  const opts = { deploymentId: null, watch: false, mode: 'source', image: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--api') { apiBase = args[++i]; }
    else if (a === '--deployment') { opts.deploymentId = args[++i]; }
    else if (a === '--mode') { opts.mode = args[++i]; }
    else if (a === '--image') { opts.image = args[++i]; }
    else if (a === '--watch') { opts.watch = true; }
    else positional.push(a);
  }
  if (!['source', 'image', 'push'].includes(opts.mode)) { console.error('--mode must be source | image | push.'); process.exit(1); }
  const cmd = positional[0] === 'deploy' ? 'deploy' : 'analyze';
  const dir = (cmd === 'deploy' ? positional[1] : positional[0]) || process.cwd();
  const key = process.env.MAPDOC_API_KEY;
  if (!key) { console.error('Set MAPDOC_API_KEY (your Mapdoc API key).'); process.exit(1); }

  if (cmd === 'deploy') await deploy(apiBase, key, dir, opts.deploymentId, opts);
  else await analyze(apiBase, key, dir);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
