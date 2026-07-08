'use strict';

/**
 * Tests for the local-agent repo scanner. Builds throwaway fixture repos in a
 * temp dir and asserts the derived app understanding, including that secret
 * VALUES are never read (only key names inform the service hints).
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanRepo } = require('../agent/repoScan');

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reposcan-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('detects a containerized Express + Postgres API', () => {
  const dir = repo({
    'package.json': JSON.stringify({ name: 'orders-api', dependencies: { express: '^4', pg: '^8' }, scripts: { start: 'node server.js', build: 'tsc' } }),
    Dockerfile: 'FROM node:20\nEXPOSE 3000\nCMD ["node","server.js"]',
  });
  const a = scanRepo(dir);
  assert.strictEqual(a.name, 'orders-api');
  assert.strictEqual(a.runtime, 'nodejs');
  assert.strictEqual(a.framework, 'express');
  assert.strictEqual(a.containerized, true);
  assert.deepStrictEqual(a.ports, [3000]);
  assert.ok(a.services.includes('postgres'));
  assert.strictEqual(a.startCommand, 'npm start');
  assert.strictEqual(a.isStatic, false);
});

test('detects a static React frontend', () => {
  const dir = repo({
    'package.json': JSON.stringify({ name: 'site', dependencies: { react: '^18', vite: '^5' }, scripts: { build: 'vite build' } }),
  });
  const a = scanRepo(dir);
  assert.strictEqual(a.framework, 'react');
  assert.strictEqual(a.isStatic, true);
  assert.strictEqual(a.containerized, false);
});

test('detects a Python app + services from deps', () => {
  const dir = repo({
    'requirements.txt': 'flask==3.0\npsycopg2-binary\nboto3\n# a comment\n',
  });
  const a = scanRepo(dir);
  assert.strictEqual(a.runtime, 'python');
  assert.strictEqual(a.framework, 'flask');
  assert.ok(a.services.includes('postgres'));
  assert.ok(a.services.includes('s3'));
});

test('env KEY names hint services, but VALUES are never read', () => {
  const secret = 'postgres://admin:SUPERSECRET@db:5432/app';
  const dir = repo({
    'package.json': JSON.stringify({ name: 'x', dependencies: {} }),
    '.env': `DATABASE_URL=${secret}\nREDIS_URL=redis://localhost\n`,
  });
  const a = scanRepo(dir);
  assert.ok(a.services.includes('postgres')); // from the KEY name DATABASE_URL
  assert.ok(a.services.includes('redis'));
  // The secret value must never appear anywhere in the profile we emit.
  assert.ok(!JSON.stringify(a).includes('SUPERSECRET'));
});

test('unknown repo degrades gracefully', () => {
  const dir = repo({ 'README.md': '# hi' });
  const a = scanRepo(dir);
  assert.strictEqual(a.runtime, 'unknown');
  assert.strictEqual(a.framework, null);
  assert.deepStrictEqual(a.services, []);
});
