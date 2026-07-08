'use strict';

/**
 * backend/agent/repoScan.js
 *
 * Local-agent repo scanner (CLOUD_LOCAL_AGENT_ARCHITECTURE.md, Phase 1). Reads a
 * repo directory and produces a SANITIZED "app understanding": runtime, framework,
 * containerization, exposed ports, build/start commands, and the external services
 * the app appears to need.
 *
 * It never reads secret VALUES — for config it only notes which KEY NAMES exist
 * (e.g. DATABASE_URL present ⇒ needs a database), never the value. Pure filesystem
 * read; no network. The output is the small, safe profile that leaves the machine.
 */

const fs = require('fs');
const path = require('path');

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };

// dependency name → external service it implies
const SERVICE_DEPS = {
  postgres: ['pg', 'postgres', 'sequelize', 'typeorm', 'prisma', '@prisma/client', 'psycopg2', 'psycopg2-binary', 'asyncpg'],
  mysql: ['mysql', 'mysql2', 'mysqlclient'],
  redis: ['redis', 'ioredis'],
  s3: ['@aws-sdk/client-s3', 'aws-sdk', 'boto3'],
  dynamodb: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
  sqs: ['@aws-sdk/client-sqs'],
  sns: ['@aws-sdk/client-sns'],
};

// dependency → web framework (order matters: server frameworks before static)
const FRAMEWORKS = [
  ['next', ['next']],
  ['express', ['express', 'koa', 'fastify', '@hapi/hapi']],
  ['django', ['django', 'Django']],
  ['flask', ['flask', 'Flask', 'fastapi']],
  ['rails', ['rails']],
  ['react', ['react', 'react-dom', 'vite', 'react-scripts']],
];

function detectServices(deps) {
  const out = [];
  for (const [svc, names] of Object.entries(SERVICE_DEPS)) {
    if (names.some((n) => deps.has(n))) out.push(svc);
  }
  return out;
}

function detectFramework(deps) {
  for (const [fw, names] of FRAMEWORKS) {
    if (names.some((n) => deps.has(n))) return fw;
  }
  return null;
}

function dockerfilePorts(text) {
  const ports = [];
  const re = /^\s*EXPOSE\s+(.+)$/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    for (const tok of m[1].split(/\s+/)) {
      const n = parseInt(tok, 10);
      if (Number.isInteger(n)) ports.push(n);
    }
  }
  return ports;
}

/** @returns {{name,runtime,framework,containerized,ports,buildCommand,startCommand,services,isStatic}} */
function scanRepo(dir) {
  const deps = new Set();
  let runtime = 'unknown';
  let name = path.basename(path.resolve(dir));
  let buildCommand = null;
  let startCommand = null;

  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg) {
    runtime = 'nodejs';
    if (pkg.name) name = pkg.name;
    for (const d of Object.keys(pkg.dependencies || {})) deps.add(d);
    for (const d of Object.keys(pkg.devDependencies || {})) deps.add(d);
    if (pkg.scripts && pkg.scripts.build) buildCommand = 'npm run build';
    if (pkg.scripts && pkg.scripts.start) startCommand = 'npm start';
  }

  const reqs = readText(path.join(dir, 'requirements.txt'));
  if (reqs) {
    if (runtime === 'unknown') runtime = 'python';
    for (const line of reqs.split('\n')) {
      const d = line.trim().split(/[=<>!~; ]/)[0];
      if (d && !d.startsWith('#')) deps.add(d);
    }
  }
  if (runtime === 'unknown' && exists(path.join(dir, 'go.mod'))) runtime = 'go';
  if (runtime === 'unknown' && (exists(path.join(dir, 'pom.xml')) || exists(path.join(dir, 'build.gradle')))) runtime = 'java';

  const dockerfile = readText(path.join(dir, 'Dockerfile'));
  const containerized = Boolean(dockerfile);
  const ports = dockerfile ? [...new Set(dockerfilePorts(dockerfile))] : [];

  const framework = detectFramework(deps);
  const services = detectServices(deps);

  // Config KEY NAMES only (never values) as an extra service hint.
  const env = readText(path.join(dir, '.env')) || readText(path.join(dir, '.env.example')) || '';
  const envKeys = env.split('\n').map((l) => l.split('=')[0].trim()).filter(Boolean);
  if (envKeys.some((k) => /DATABASE_URL|POSTGRES/i.test(k)) && !services.includes('postgres') && !services.includes('mysql')) services.push('postgres');
  if (envKeys.some((k) => /REDIS/i.test(k)) && !services.includes('redis')) services.push('redis');

  // Static frontend: a React/Vite build with no server framework or DB.
  const isStatic = framework === 'react' && !services.includes('postgres') && !services.includes('mysql');

  return { name, runtime, framework, containerized, ports, buildCommand, startCommand, services, isStatic };
}

module.exports = { scanRepo, detectServices, detectFramework };
