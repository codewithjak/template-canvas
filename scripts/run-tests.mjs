// Frontend test runner (activation doc T0.4 exit check) — no test FRAMEWORK.
//
// The repo needs no vitest/jest: Node's built-in `node --test` runs the suite
// (same as backend/package.json), and esbuild transpiles the TypeScript test
// files (and the real source they import) to a temp dir first, so tests
// exercise the SAME source the app ships. esbuild is a declared devDependency
// (package.json) — NOT relied on via vite's transitive tree — so this runner
// keeps working across a vite bundler swap or a strict (pnpm/PnP) install.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Recursively collect every *.test.ts under a directory. */
function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(full));
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const tests = findTests('src');
if (tests.length === 0) {
  console.error('No *.test.ts files found under src/.');
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), 'mapdoc-tests-'));
try {
  await build({
    entryPoints: tests,
    outdir: outDir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    sourcemap: 'inline',
    logLevel: 'warning',
  });
  const res = spawnSync('node', ['--test', outDir], { stdio: 'inherit' });
  process.exit(res.status ?? 1);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
