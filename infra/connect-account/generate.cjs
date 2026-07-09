#!/usr/bin/env node
'use strict';

/**
 * generate.cjs — emit stack.yaml from the canonical JS template.
 *
 * backend/cloud/bootstrapTemplate.js is the SINGLE SOURCE OF TRUTH for the
 * connect-account CloudFormation stack (it's what the in-app download serves). This
 * script renders that same object to infra/connect-account/stack.yaml so the
 * standalone file docs/UI reference can never drift from what users actually deploy.
 *
 * Run:  node infra/connect-account/generate.cjs   (or: npm run gen:connect-stack)
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
fs.writeFileSync(dest, out);
console.log(`Wrote ${dest} (${out.length} bytes) from bootstrapTemplate.js`);
