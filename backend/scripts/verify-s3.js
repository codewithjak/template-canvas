'use strict';

/**
 * scripts/verify-s3.js
 *
 * One-shot check that the S3 artifact config actually works end to end:
 * upload → existence (HEAD) → presigned GET → fetch back. Validates
 * credentials, region, bucket, the IAM policy (PutObject/GetObject) and the
 * SigV4 presigning — without touching the rest of the app.
 *
 * Writes a tiny temp object under the artifacts prefix
 * (artifacts/_verify-<ts>.zip); it is harmless and auto-expires via the bucket
 * lifecycle rule. Prints PASS/FAIL only — never any secret.
 *
 * Run from backend/:  node scripts/verify-s3.js
 */

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const { fromEnv } = require('../storage/s3Store');

  console.log(`region=${process.env.AWS_REGION}  bucket=${process.env.S3_ARTIFACT_BUCKET}  prefix=${process.env.S3_ARTIFACT_PREFIX || 'artifacts'}`);

  const store = fromEnv();
  const jobId = `_verify-${Date.now()}`;
  const body  = `mapdoc s3 verify ${new Date().toISOString()}`;
  const tmp   = path.join(os.tmpdir(), `${jobId}.zip`);
  fs.writeFileSync(tmp, body);

  try {
    console.log('1/3 uploading…');
    await store.put(jobId, { filePath: tmp, contentType: 'text/plain' });
    console.log('    upload OK');

    console.log('2/3 HEAD existence check…');
    const there = await store.exists(store.keyFor(jobId));
    if (!there) throw new Error('object not found after upload (HEAD failed)');
    console.log('    exists OK');

    console.log('3/3 presign GET + fetch…');
    const { url, expiresAt } = await store.downloadTarget(jobId, { fileName: 'verify.zip', expiresInMs: 60_000 });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET returned ${res.status}`);
    const got = await res.text();
    if (got !== body) throw new Error('downloaded content did not match');
    console.log(`    fetch OK (expires ${expiresAt})`);

    console.log('\n✅ PASS — S3 is configured correctly.');
  } catch (err) {
    console.error(`\n❌ FAIL — ${err.message}`);
    process.exitCode = 1;
  } finally {
    fs.unlink(tmp, () => {});
  }
}

main();
