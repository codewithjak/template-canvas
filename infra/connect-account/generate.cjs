#!/usr/bin/env node
'use strict';

/**
 * generate.cjs — emit (or verify) stack.yaml from the canonical JS template.
 *
 * backend/cloud/bootstrapTemplate.js is the SINGLE SOURCE OF TRUTH for the
 * connect-account CloudFormation stack (it's what the in-app download serves). This
 * script renders that same object to infra/connect-account/stack.yaml so the
 * standalone file docs/UI reference can never drift from what users actually deploy.
 *
 *   node infra/connect-account/generate.cjs           write stack.yaml (npm run gen:connect-stack)
 *   node infra/connect-account/generate.cjs --check    CI drift check: fail if the committed
 *                                                       stack.yaml differs from the source (no write)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const template = require('../../backend/cloud/bootstrapTemplate');

const banner = [
  '# GENERATED FILE — do not edit by hand.',
  '# Source of truth: backend/cloud/bootstrapTemplate.js',
  '# Regenerate:      node infra/connect-account/generate.cjs  (npm run gen:connect-stack)',
  '',
].join('\n');

const out = banner + yaml.dump(template, { lineWidth: 120, noRefs: true });
const dest = path.join(__dirname, 'stack.yaml');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (current !== out) {
    console.error(
      'stack.yaml is out of sync with backend/cloud/bootstrapTemplate.js.\n'
      + 'Either it was hand-edited, or the JS changed and stack.yaml was not regenerated.\n'
      + 'Fix: run `npm run gen:connect-stack` and commit the result.',
    );
    process.exit(1);
  }
  console.log('stack.yaml is in sync with bootstrapTemplate.js.');
} else {
  fs.writeFileSync(dest, out);
  console.log(`Wrote ${dest} (${out.length} bytes) from bootstrapTemplate.js`);
}
